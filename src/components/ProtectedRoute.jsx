import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ permission = 'app', children }) {
  const { user, loading, can, logout } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-loading">Connexion à Autospec…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (permission && !can(permission)) {
    return <main className="auth-denied"><h1>Accès non autorisé</h1><p>Votre compte ne possède pas l’accès requis pour cette page.</p><button type="button" onClick={logout}>Déconnexion</button></main>;
  }
  return children || <Outlet />;
}
