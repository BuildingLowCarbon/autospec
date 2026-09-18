import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import './users.css';

const emptyForm = {
  username: '', displayName: '', password: '', role: 'user', active: true, permissions: ['app'],
};

const permissionChecked = (draft, permission) => draft.role === 'admin' || draft.permissions.includes(permission);

const togglePermission = (draft, permission, checked) => ({
  ...draft,
  permissions: checked
    ? Array.from(new Set([...draft.permissions, permission]))
    : draft.permissions.filter((item) => item !== permission),
});

function AccessFields({ value, onChange }) {
  const admin = value.role === 'admin';
  return <div className="user-access-fields">
    <label><input type="checkbox" checked={permissionChecked(value, 'app')} disabled={admin} onChange={(event) => onChange(togglePermission(value, 'app', event.target.checked))} /> Application</label>
    <label><input type="checkbox" checked={permissionChecked(value, 'dashboard')} disabled={admin} onChange={(event) => onChange(togglePermission(value, 'dashboard', event.target.checked))} /> Dashboard</label>
    <label><input type="checkbox" checked={admin} disabled /> Gestion des utilisateurs</label>
  </div>;
}

function UserRow({ user, currentUserId, onSave, onDelete }) {
  const [draft, setDraft] = useState({ ...user, password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => setDraft({ ...user, password: '' }), [user]);

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      await onSave(user.id, draft);
      setMessage('Enregistré');
      setDraft((current) => ({ ...current, password: '' }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer définitivement l’utilisateur « ${user.username} » ?`)) return;
    setBusy(true);
    setMessage('');
    try {
      await onDelete(user.id);
    } catch (error) {
      setMessage(error.message);
      setBusy(false);
    }
  };

  return <tr>
    <td><strong>{user.username}</strong>{user.id === currentUserId && <small className="user-self">Votre compte</small>}</td>
    <td><input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></td>
    <td><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}><option value="user">Utilisateur</option><option value="admin">Administrateur</option></select></td>
    <td><AccessFields value={draft} onChange={setDraft} /></td>
    <td><label className="user-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Actif</label></td>
    <td><input type="password" minLength="10" autoComplete="new-password" placeholder="Nouveau mot de passe" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /></td>
    <td><div className="user-actions"><button className="db-primary" disabled={busy} onClick={save}>Enregistrer</button><button className="user-delete" disabled={busy || user.id === currentUserId} onClick={remove}>Supprimer</button>{message && <small>{message}</small>}</div></td>
  </tr>;
}

export default function UsersPage() {
  const { user: currentUser, request } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await request('/api/admin/users');
      setUsers(payload.users || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = await request('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
      setUsers((current) => [...current, payload.user].sort((a, b) => a.username.localeCompare(b.username)));
      setForm(emptyForm);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (id, draft) => {
    const body = {
      displayName: draft.displayName,
      role: draft.role,
      active: draft.active,
      permissions: draft.permissions,
      ...(draft.password ? { password: draft.password } : {}),
    };
    const payload = await request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
    setUsers((current) => current.map((item) => item.id === id ? payload.user : item));
  };

  const remove = async (id) => {
    await request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setUsers((current) => current.filter((item) => item.id !== id));
  };

  return <div className="db-stack users-page">
    <section className="db-card">
      <div className="db-title-row"><div><h2>Utilisateurs et accès</h2><p>Créez les comptes et choisissez les parties de l’application auxquelles ils peuvent accéder.</p></div><Link className="db-primary" to="/organizations">Gérer les organisations</Link></div>
      <form className="user-create" onSubmit={create}>
        <label>Nom d’utilisateur<input required minLength="3" autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
        <label>Nom affiché<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
        <label>Mot de passe<input required minLength="10" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <label>Rôle<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="user">Utilisateur</option><option value="admin">Administrateur</option></select></label>
        <fieldset><legend>Accès</legend><AccessFields value={form} onChange={setForm} /></fieldset>
        <button className="db-primary" disabled={busy}>{busy ? 'Création…' : 'Ajouter l’utilisateur'}</button>
      </form>
      {error && <div className="db-error">{error}</div>}
    </section>
    <section className="db-card">
      <h2>Comptes existants</h2>
      {loading ? <p>Chargement…</p> : <div className="db-table-wrap user-table-wrap"><table className="db-table user-table"><thead><tr><th>Utilisateur</th><th>Nom</th><th>Rôle</th><th>Accès</th><th>État</th><th>Réinitialiser le mot de passe</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <UserRow key={user.id} user={user} currentUserId={currentUser.id} onSave={save} onDelete={remove} />)}</tbody></table></div>}
    </section>
  </div>;
}
