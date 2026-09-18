import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { invalidateMaterialsCache } from '../utils/loadMaterials';
import { invalidateComponentsCache } from '../utils/loadComponents';
import './collaboration.css';

const newMaterialForm = { name: '', density: '', conductivity: '', visibility: 'private', organizationId: '' };

const titleOf = (item) => item?.translations?.fr?.name || item?.workingtitle || item?.serialNo || item?.id || 'Sans nom';

export default function Profile() {
  const { user, request } = useAuth();
  const [profile, setProfile] = useState({ organizations: [], components: [], materials: [] });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [material, setMaterial] = useState(newMaterialForm);
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

  const createMaterial = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      const item = {
        workingtitle: material.name,
        translations: { fr: { name: material.name, description: '' } },
        density_kg_m3: material.density === '' ? null : Number(material.density),
        thermalConductivity_W_mK: material.conductivity === '' ? null : Number(material.conductivity),
      };
      await request('/api/content/materials', {
        method: 'POST',
        body: JSON.stringify({ item, visibility: material.visibility, organizationId: material.organizationId || null }),
      });
      invalidateMaterialsCache();
      setMaterial(newMaterialForm);
      setMessage('Matériau créé dans MongoDB.');
      await load();
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
    <section className="collab-card"><h2>Créer un matériau</h2><p>Le matériau sera utilisable dans les couches par les utilisateurs autorisés selon sa visibilité.</p><form className="collab-form collab-form-row" onSubmit={createMaterial}><label>Nom<input required value={material.name} onChange={(event) => setMaterial({ ...material, name: event.target.value })} /></label><label>Masse volumique (kg/m³)<input type="number" min="0" step="any" value={material.density} onChange={(event) => setMaterial({ ...material, density: event.target.value })} /></label><label>Conductivité thermique (W/mK)<input type="number" min="0" step="any" value={material.conductivity} onChange={(event) => setMaterial({ ...material, conductivity: event.target.value })} /></label><label>Visibilité<select value={material.visibility} onChange={(event) => setMaterial({ ...material, visibility: event.target.value, organizationId: event.target.value === 'organization' ? material.organizationId : '' })}><option value="private">Privé</option><option value="organization" disabled={!profile.organizations.length}>Organisation</option><option value="public">Public</option></select></label>{material.visibility === 'organization' && <label>Organisation<select required value={material.organizationId} onChange={(event) => setMaterial({ ...material, organizationId: event.target.value })}><option value="">Sélectionner…</option>{profile.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}<button>Créer</button></form></section>
    <div className="collab-grid">
      <ContentList title="Mes composants" kind="components" items={profile.components} onDelete={removeContent} />
      <ContentList title="Mes matériaux" kind="materials" items={profile.materials} onDelete={removeContent} />
    </div>
  </main></>;
}

function ContentList({ title, kind, items, onDelete }) {
  return <section className="collab-card"><h2>{title}</h2>{items.length ? <ul className="collab-content-list">{items.map((item) => <li key={item.__contentId}><span><strong>{titleOf(item)}</strong><small>{item.__visibility === 'organization' ? 'Organisation' : item.__visibility === 'public' ? 'Public' : 'Privé'} · {item.id}</small></span><span><Link to={kind === 'components' ? `/custom/${item.id}` : `/material-custom/${item.id}`}>Modifier</Link><button className="danger" onClick={() => onDelete(kind, item.__contentId)}>Supprimer</button></span></li>)}</ul> : <p>Aucun contenu.</p>}</section>;
}
