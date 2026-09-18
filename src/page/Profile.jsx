import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { invalidateMaterialsCache } from '../utils/loadMaterials';
import { invalidateComponentsCache } from '../utils/loadComponents';
import './collaboration.css';

const titleOf = (item) => item?.translations?.fr?.name || item?.workingtitle || item?.serialNo || item?.id || 'Sans nom';

export default function Profile() {
  const { user, request } = useAuth();
  const [profile, setProfile] = useState({ organizations: [], components: [], materials: [] });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await request('/api/profile');
      setProfile(payload.profile);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const changePassword = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      await request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(passwords) });
      setPasswords({ currentPassword: '', newPassword: '' });
      setMessage('Mot de passe modifié.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeContent = async (kind, contentId) => {
    if (!window.confirm('Supprimer définitivement ce contenu ?')) return;
    try {
      await request(`/api/content/${kind}/${encodeURIComponent(contentId)}`, { method: 'DELETE' });
      invalidateComponentsCache();
      invalidateMaterialsCache();
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return <><Header /><main className="collab-page">
    <header><span>Compte</span><h1>Mon profil</h1></header>
    {message && <div className="collab-message">{message}</div>}
    <div className="collab-grid">
      <section className="collab-card"><h2>Informations</h2><dl><dt>Nom d’utilisateur</dt><dd>{user.username}</dd><dt>Nom</dt><dd>{user.displayName || '—'}</dd><dt>Rôle</dt><dd>{user.role === 'admin' ? 'Administrateur global' : 'Utilisateur'}</dd></dl></section>
      <section className="collab-card"><h2>Changer le mot de passe</h2><form className="collab-form" onSubmit={changePassword}><label>Mot de passe actuel<input required type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label><label>Nouveau mot de passe<input required minLength="10" type="password" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /></label><button>Modifier</button></form></section>
    </div>
    <section className="collab-card"><div className="collab-title"><div><h2>Mes organisations</h2><p>Organisations auxquelles votre compte appartient.</p></div><Link to="/organizations">Gérer les organisations</Link></div>{loading ? <p>Chargement…</p> : <div className="collab-chips">{profile.organizations.length ? profile.organizations.map((organization) => <span key={organization.id}>{organization.name}{organization.membershipRole === 'organization_admin' ? ' · administrateur' : ''}</span>) : <em>Aucune organisation</em>}</div>}</section>
    <div className="collab-grid">
      <ContentList title="Mes composants" kind="components" items={profile.components} onDelete={removeContent} />
      <ContentList title="Mes matériaux" kind="materials" items={profile.materials} onDelete={removeContent} />
    </div>
  </main></>;
}

function ContentList({ title, kind, items, onDelete }) {
  const createPath = kind === 'components' ? '/custom/new' : '/material-custom/new';
  return <section className="collab-card"><div className="collab-title"><h2>{title}</h2><Link to={createPath}>Créer un nouveau</Link></div>{items.length ? <ul className="collab-content-list">{items.map((item) => <li key={item.__contentId}><span><strong>{titleOf(item)}</strong><small>{item.__visibility === 'organization' ? 'Organisation' : item.__visibility === 'public' ? 'Public' : 'Privé'} · {item.id}</small></span><span><Link to={kind === 'components' ? `/custom/${item.id}` : `/material-custom/${item.id}`}>Modifier</Link><button className="danger" onClick={() => onDelete(kind, item.__contentId)}>Supprimer</button></span></li>)}</ul> : <p>Aucun contenu.</p>}</section>;
}
