import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import loadMaterials, { invalidateMaterialsCache } from '../utils/loadMaterials';
import { dashboardFieldLabel } from './dashboard/dashboardI18n';
import './collaboration.css';

const LANGUAGES = [['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['en', 'English']];
const FIELDS = [
  'workingtitle',
  'materialTypeId',
  'materialcategoryId',
  'functionId',
  'kbobId',
  'siaId',
  'density_kg_m3',
  'thickness_mm',
  'thermalConductivity_W_mK',
  'specificHeat_Wh_kgK',
  'specificHeat_J_kgK',
  'waterVaporDiffusionResistanceCoefficientDry',
  'waterVaporDiffusionResistanceCoefficientWet',
  'fireClassification',
  'reactionToFire',
];
const NUMERIC_FIELDS = new Set([
  'density_kg_m3',
  'thickness_mm',
  'thermalConductivity_W_mK',
  'specificHeat_Wh_kgK',
  'specificHeat_J_kgK',
  'waterVaporDiffusionResistanceCoefficientDry',
  'waterVaporDiffusionResistanceCoefficientWet',
]);

const clone = (value) => JSON.parse(JSON.stringify(value));

const editableMaterial = (material) => ({
  ...clone(material),
  translations: LANGUAGES.reduce((translations, [language]) => ({
    ...translations,
    [language]: {
      name: material.translations?.[language]?.name || '',
      description: material.translations?.[language]?.description || '',
    },
  }), {}),
});

const newMaterial = () => editableMaterial({
  __isNew: true,
  workingtitle: '',
  materialTypeId: '',
  materialcategoryId: '',
  functionId: '',
});

const materialPayload = (material, { duplicate = false } = {}) => {
  const payload = clone(material);
  Object.keys(payload).filter((key) => key.startsWith('__')).forEach((key) => delete payload[key]);
  delete payload.createdAt;
  delete payload.updatedAt;
  if (payload.source?.original) payload.source = payload.source.original;
  if (duplicate) delete payload.id;
  return payload;
};

export default function MaterialEditor() {
  const { id } = useParams();
  const isCreating = id === 'new';
  const navigate = useNavigate();
  const { lang } = useContext(LangContext);
  const { user, can, request } = useAuth();
  const [material, setMaterial] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [visibility, setVisibility] = useState('private');
  const [organizationId, setOrganizationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([loadMaterials({ forceRefresh: true }), request('/api/organizations').catch(() => ({ organizations: [] }))])
      .then(async ([materials, organizationPayload]) => {
        if (!active) return;
        let found = isCreating ? newMaterial() : materials.find((item) => String(item.id) === String(id));
        if (!found && !isCreating) {
          const directPayload = await request(`/api/content/materials/item/${encodeURIComponent(id)}`)
            .catch((error) => (error.status === 404 ? null : Promise.reject(error)));
          found = directPayload?.item || null;
        }
        if (!active) return;
        setMaterial(found ? editableMaterial(found) : null);
        setVisibility(found?.__visibility || 'private');
        setOrganizationId(found?.__organizationId || '');
        setOrganizations(organizationPayload.organizations || []);
      })
      .catch((error) => active && setMessage(error.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, isCreating, request]);

  const canModify = useMemo(() => {
    if (!material) return false;
    if (material.__isNew) return true;
    if (!material.__contentId) return can('dashboard');
    if (user?.role === 'admin' || material.__ownerId === user?.id) return true;
    return Boolean(material.__organizationId && organizations.some((organization) => (
      organization.id === material.__organizationId && organization.membershipRole === 'organization_admin'
    )));
  }, [can, material, organizations, user]);

  const canManageVisibility = Boolean(
    material?.__contentId && (user?.role === 'admin' || material.__ownerId === user?.id),
  );

  const setField = (field, value) => setMaterial((current) => ({
    ...current,
    [field]: NUMERIC_FIELDS.has(field) ? (value === '' ? null : Number(value)) : value,
  }));

  const setTranslation = (language, field, value) => setMaterial((current) => ({
    ...current,
    translations: {
      ...current.translations,
      [language]: { ...current.translations?.[language], [field]: value },
    },
  }));

  const validateSharing = () => {
    if (visibility === 'organization' && !organizationId) {
      setMessage('Sélectionnez une organisation.');
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!material || !canModify) return;
    setMessage('Enregistrement…');
    try {
      if (material.__isNew) {
        if (!validateSharing()) return;
        const response = await request('/api/content/materials', {
          method: 'POST',
          body: JSON.stringify({
            item: materialPayload(material, { duplicate: true }),
            visibility,
            organizationId: visibility === 'organization' ? organizationId : null,
          }),
        });
        setMaterial(editableMaterial(response.item));
        setVisibility(response.item.__visibility || 'private');
        setOrganizationId(response.item.__organizationId || '');
        navigate(`/material-custom/${response.item.id}`, { replace: true });
      } else if (material.__contentId) {
        if (canManageVisibility && !validateSharing()) return;
        const body = { item: materialPayload(material) };
        if (canManageVisibility) {
          body.visibility = visibility;
          body.organizationId = visibility === 'organization' ? organizationId : null;
        }
        const response = await request(`/api/content/materials/${encodeURIComponent(material.__contentId)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setMaterial(editableMaterial(response.item));
        setVisibility(response.item.__visibility || 'private');
        setOrganizationId(response.item.__organizationId || '');
      } else {
        const response = await request('/api/catalog/materials', {
          method: 'POST',
          body: JSON.stringify({ item: materialPayload(material) }),
        });
        setMaterial(editableMaterial(response.item));
      }
      invalidateMaterialsCache();
      setMessage('Matériau enregistré.');
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    }
  };

  const duplicate = async () => {
    if (!material || !validateSharing()) return;
    setMessage('Duplication…');
    try {
      const response = await request('/api/content/materials', {
        method: 'POST',
        body: JSON.stringify({
          item: materialPayload(material, { duplicate: true }),
          visibility,
          organizationId: visibility === 'organization' ? organizationId : null,
        }),
      });
      invalidateMaterialsCache();
      setMaterial(editableMaterial(response.item));
      setVisibility(response.item.__visibility || 'private');
      setOrganizationId(response.item.__organizationId || '');
      navigate(`/material-custom/${response.item.id}`, { replace: true });
      setMessage('Nouveau matériau créé.');
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    }
  };

  if (loading) return <><Header /><main className="collab-page"><p>Chargement…</p></main></>;
  if (!material) return <><Header /><main className="collab-page"><p>Matériau introuvable.</p><Link to="/">Retour</Link></main></>;

  return <><Header /><main className="collab-page">
    <header><span>Matériaux</span><h1>{isCreating ? 'Créer un matériau' : 'Modifier ou dupliquer un matériau'}</h1></header>
    {message && <div className="collab-message">{message}</div>}

    <section className="collab-card">
      <div className="collab-title">
        <div><h2>{material.translations?.[lang]?.name || material.translations?.fr?.name || material.workingtitle || 'Sans nom'}</h2><p>{isCreating ? 'L’identifiant sera créé automatiquement.' : <>Identifiant : <code>{material.id}</code></>}</p></div>
        {!isCreating && <Link to={`/material/${material.id}`}>Voir la fiche</Link>}
      </div>
      <div className="collab-form collab-form-row">
        {FIELDS.map((field) => <label key={field}>{dashboardFieldLabel(field, lang)}<small>{field}</small><input type={NUMERIC_FIELDS.has(field) ? 'number' : 'text'} step={NUMERIC_FIELDS.has(field) ? 'any' : undefined} value={material[field] ?? ''} onChange={(event) => setField(field, event.target.value)} /></label>)}
      </div>
    </section>

    <section className="collab-card">
      <h2>Traductions</h2>
      <div className="collab-grid" style={{ marginBottom: 0 }}>
        {LANGUAGES.map(([language, label]) => <div className="collab-form" key={language}><h3 style={{ marginBottom: 0 }}>{label}</h3><label>Nom<input value={material.translations?.[language]?.name || ''} onChange={(event) => setTranslation(language, 'name', event.target.value)} /></label><label>Description<textarea rows="4" style={{ boxSizing: 'border-box', width: '100%', padding: '9px', border: '1px solid #abb6b0', borderRadius: '5px', resize: 'vertical', font: 'inherit' }} value={material.translations?.[language]?.description || ''} onChange={(event) => setTranslation(language, 'description', event.target.value)} /></label></div>)}
      </div>
    </section>

    <section className="collab-card">
      <h2>{isCreating ? 'Partage' : 'Partage de la copie'}</h2>
      <div className="collab-form collab-form-row">
        <label>Visibilité<select value={visibility} onChange={(event) => { setVisibility(event.target.value); if (event.target.value !== 'organization') setOrganizationId(''); }}><option value="private">Privé</option><option value="organization" disabled={!organizations.length}>Organisation</option><option value="public">Public</option></select></label>
        {visibility === 'organization' && <label>Organisation<select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Sélectionner…</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}
      </div>
      {material.__contentId && !canManageVisibility && <p>Ce choix s’applique à la copie ; la visibilité du matériau d’origine reste inchangée.</p>}
      {!canModify && <p>Vous ne pouvez pas modifier ce matériau directement. Vous pouvez toutefois en créer une copie.</p>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
        {canModify && <button type="button" onClick={save}>{isCreating ? 'Créer le matériau' : 'Enregistrer'}</button>}
        {!isCreating && <button type="button" onClick={duplicate}>Dupliquer matériau</button>}
      </div>
    </section>
  </main></>;
}
