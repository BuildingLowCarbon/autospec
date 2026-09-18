import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { invalidateComponentsCache } from '../utils/loadComponents';
import { invalidateMaterialsCache } from '../utils/loadMaterials';
import './collaboration.css';

const contentTitle = (item) => item?.translations?.fr?.name || item?.workingtitle || item?.serialNo || item?.id;

export default function Organizations() {
  const { user, request } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState(null);
  const [users, setUsers] = useState([]);
  const [createForm, setCreateForm] = useState({ name: '', description: '', adminUserId: '' });
  const [memberForm, setMemberForm] = useState({ username: '', role: 'member' });
  const [message, setMessage] = useState('');

  const loadOrganizations = useCallback(async () => {
    const payload = await request('/api/organizations');
    setOrganizations(payload.organizations || []);
    setSelectedId((current) => current || payload.organizations?.[0]?.id || '');
  }, [request]);

  const loadDetails = useCallback(async (id) => {
    if (!id) { setDetails(null); return; }
    const payload = await request(`/api/organizations/${encodeURIComponent(id)}`);
    setDetails(payload);
  }, [request]);

  useEffect(() => {
    loadOrganizations().catch((error) => setMessage(error.message));
    if (user.role === 'admin') request('/api/admin/users').then((payload) => setUsers(payload.users || [])).catch(() => {});
  }, [loadOrganizations, request, user.role]);
  useEffect(() => { loadDetails(selectedId).catch((error) => setMessage(error.message)); }, [loadDetails, selectedId]);

  const createOrganization = async (event) => {
    event.preventDefault(); setMessage('');
    try {
      const payload = await request('/api/organizations', { method: 'POST', body: JSON.stringify(createForm) });
      setCreateForm({ name: '', description: '', adminUserId: '' });
      await loadOrganizations();
      setSelectedId(payload.organization.id);
    } catch (error) { setMessage(error.message); }
  };

  const addMember = async (event) => {
    event.preventDefault(); setMessage('');
    try {
      await request(`/api/organizations/${encodeURIComponent(selectedId)}/members`, { method: 'POST', body: JSON.stringify(memberForm) });
      setMemberForm({ username: '', role: 'member' });
      await loadDetails(selectedId);
    } catch (error) { setMessage(error.message); }
  };

  const setMemberRole = async (member, role) => {
    try {
      await request(`/api/organizations/${encodeURIComponent(selectedId)}/members/${encodeURIComponent(member.userId)}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      await loadDetails(selectedId);
    } catch (error) { setMessage(error.message); }
  };

  const removeMember = async (member) => {
    if (!window.confirm(`Retirer ${member.user?.username || 'ce membre'} de l’organisation ?`)) return;
    try {
      await request(`/api/organizations/${encodeURIComponent(selectedId)}/members/${encodeURIComponent(member.userId)}`, { method: 'DELETE' });
      await loadDetails(selectedId);
    } catch (error) { setMessage(error.message); }
  };

  const removeContent = async (kind, item) => {
    if (!window.confirm('Supprimer définitivement ce contenu ?')) return;
    try {
      await request(`/api/content/${kind}/${encodeURIComponent(item.__contentId)}`, { method: 'DELETE' });
      invalidateComponentsCache(); invalidateMaterialsCache();
      await loadDetails(selectedId);
    } catch (error) { setMessage(error.message); }
  };

  const deleteOrganization = async () => {
    if (!window.confirm(`Supprimer l’organisation « ${details.organization.name} » ?`)) return;
    try {
      await request(`/api/organizations/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
      setSelectedId(''); setDetails(null); await loadOrganizations();
    } catch (error) { setMessage(error.message); }
  };

  return <><Header /><main className="collab-page"><header><span>Partage</span><h1>Organisations</h1></header>{message && <div className="collab-message">{message}</div>}
    {user.role === 'admin' && <section className="collab-card"><h2>Créer une organisation</h2><form className="collab-form collab-form-row" onSubmit={createOrganization}><label>Nom<input required value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} /></label><label>Description<input value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} /></label><label>Administrateur de l’organisation<select required value={createForm.adminUserId} onChange={(event) => setCreateForm({ ...createForm, adminUserId: event.target.value })}><option value="">Sélectionner…</option>{users.filter((entry) => entry.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName || entry.username} ({entry.username})</option>)}</select></label><button>Créer</button></form></section>}
    <section className="collab-card"><div className="collab-title"><div><h2>Organisation sélectionnée</h2><p>Les composants partagés apparaissent comme une base disponible dans les filtres.</p></div><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Aucune</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div></section>
    {details && <><section className="collab-card"><div className="collab-title"><div><h2>{details.organization.name}</h2><p>{details.organization.description || 'Aucune description'}</p></div>{user.role === 'admin' && <button className="danger" onClick={deleteOrganization}>Supprimer l’organisation</button>}</div>{details.canManage && <form className="collab-form collab-form-row" onSubmit={addMember}><label>Nom d’utilisateur<input required value={memberForm.username} onChange={(event) => setMemberForm({ ...memberForm, username: event.target.value })} /></label><label>Rôle<select value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })}><option value="member">Membre</option><option value="organization_admin">Administrateur d’organisation</option></select></label><button>Ajouter ou mettre à jour</button></form>}<div className="collab-table-wrap"><table><thead><tr><th>Membre</th><th>Rôle</th>{details.canManage && <th>Actions</th>}</tr></thead><tbody>{details.memberships.map((member) => <tr key={member.id}><td>{member.user?.displayName || member.user?.username || member.userId}<small>{member.user?.username}</small></td><td>{details.canManage ? <select value={member.role} onChange={(event) => setMemberRole(member, event.target.value)}><option value="member">Membre</option><option value="organization_admin">Administrateur</option></select> : member.role === 'organization_admin' ? 'Administrateur' : 'Membre'}</td>{details.canManage && <td><button className="danger" onClick={() => removeMember(member)}>Retirer</button></td>}</tr>)}</tbody></table></div></section>
      <div className="collab-grid"><OrganizationContent title="Composants partagés" kind="components" items={details.components} canManage={details.canManage} onDelete={removeContent} /><OrganizationContent title="Matériaux partagés" kind="materials" items={details.materials} canManage={details.canManage} onDelete={removeContent} /></div></>}
  </main></>;
}

function OrganizationContent({ title, kind, items, canManage, onDelete }) {
  return <section className="collab-card"><h2>{title}</h2>{items.length ? <ul className="collab-content-list">{items.map((item) => <li key={item.__contentId}><span><strong>{contentTitle(item)}</strong><small>{item.id}</small></span><span><Link to={kind === 'components' ? `/custom/${item.id}` : `/material-custom/${item.id}`}>Ouvrir</Link>{canManage && <button className="danger" onClick={() => onDelete(kind, item)}>Supprimer</button>}</span></li>)}</ul> : <p>Aucun contenu partagé.</p>}</section>;
}
