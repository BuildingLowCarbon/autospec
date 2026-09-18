import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './auth.css';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination = location.state?.from || '/';

  if (loading) return <div className="auth-loading">Connexion à Autospec…</div>;
  if (!loading && user) return <Navigate to={destination} replace />;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
      navigate(destination, { replace: true });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <section className="auth-card">
      <div className="auth-brand">AutoSpec</div>
      <h1>Connexion</h1>
      <p>Connectez-vous pour accéder à l’application.</p>
      <form onSubmit={submit}>
        <label>Nom d’utilisateur
          <input autoFocus autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>Mot de passe
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </section>
  </main>;
}
