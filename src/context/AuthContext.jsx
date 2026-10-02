import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { invalidateComponentsCache } from '../utils/loadComponents';
import { invalidateMaterialsCache } from '../utils/loadMaterials';

const AuthContext = createContext(null);

const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `Erreur HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) {
        setUser(null);
        setCsrfToken('');
        return null;
      }
      const payload = await parseResponse(response);
      setUser(payload.user);
      setCsrfToken(payload.csrfToken || '');
      return payload.user;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      setUser(null);
      setCsrfToken('');
    });
  }, [refresh]);

  const login = useCallback(async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const payload = await parseResponse(response);
    setUser(payload.user);
    setCsrfToken(payload.csrfToken || '');
    invalidateComponentsCache();
    invalidateMaterialsCache();
    return payload.user;
  }, []);

  const request = useCallback(async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(url, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) {
      setUser(null);
      setCsrfToken('');
      invalidateComponentsCache();
      invalidateMaterialsCache();
    }
    return parseResponse(response);
  }, [csrfToken]);

  const logout = useCallback(async () => {
    try {
      await request('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch (error) {
      // The local session is cleared even if it already expired server-side.
    } finally {
      setUser(null);
      setCsrfToken('');
      invalidateComponentsCache();
      invalidateMaterialsCache();
    }
  }, [request]);

  const can = useCallback((permission) => Boolean(user)
    && (user.role === 'admin' || (user.permissions || []).includes(permission)), [user]);

  const value = useMemo(() => ({ user, loading, login, logout, refresh, request, can }), [user, loading, login, logout, refresh, request, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider.');
  return context;
};

export default AuthContext;
