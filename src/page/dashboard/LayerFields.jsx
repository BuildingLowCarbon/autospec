import React from 'react';
import MaterialSelect from '../../components/MaterialSelect';
import ecccData from '../../data/eccc.json';
import { LAYER_FUNCTION_IDS, layerRole } from './structureGrouping';

export const ROLE_LABELS = { structure: 'Structure porteuse', insulation: 'Isolation', screed: 'Chape', bracing: 'Contreventement', mass: 'Ajout de masse', sealing: 'Étanchéité / pare-vapeur', battens: 'Lattes / profils', connection: 'Liaison', covering: 'Parement / revêtement', finish: 'Finition', other: 'Autre' };
const NUMBERS = { thickness_mm: 'Épaisseur (mm)', width_mm: 'Largeur (mm)', spacing_mm: 'Espacement / entraxe (mm)', time_burning_min: 'Temps de combustion (min)', time_fire_start_min: 'Début de combustion (min)' };

export const normalizeEditedLayer = (layer, order = 0, inherit = false) => ({
  ...layer, order,
  ...Object.fromEntries(Object.keys(NUMBERS).map((key) => [key, layer[key] === '' || layer[key] === null || layer[key] === undefined ? null : Number(layer[key])])),
  layerFunctionId: layer.layerFunctionId || (inherit ? '' : layerRole(layer)),
  isSupportStructure: layer.isSupportStructure === true || (!inherit && layerRole(layer) === 'structure'),
  ...(layer.variants ? { variants: layer.variants.map((variant) => normalizeEditedLayer(variant, 0, true)) } : {}),
});

export const emptyEditableLayer = () => ({ productId: '', thickness_mm: null, width_mm: null, spacing_mm: null, structure: 'on-lying', layerFunctionId: 'other', isSupportStructure: false, translations: {} });

export default function LayerFields({ layer, onChange: onChangeValue, catalog, lang = 'fr', inherit = false, base = null }) {
  const onChange = (patch) => onChangeValue(inherit ? { ...patch, overrides: [...new Set([...(layer.overrides || []), ...Object.keys(patch)])] } : patch);
  const updateTranslation = (key, value) => onChange({ translations: { ...layer.translations, [lang]: { ...layer.translations?.[lang], [key]: value } } });
  return <div className="db-full-layer-fields">
    <label>Nom de la couche<input value={layer.translations?.[lang]?.name || ''} placeholder={inherit ? 'Identique à la base' : ''} onChange={(event) => updateTranslation('name', event.target.value)} /></label>
    <label>Description de la couche<input value={layer.translations?.[lang]?.description || ''} placeholder={inherit ? 'Identique à la base' : ''} onChange={(event) => updateTranslation('description', event.target.value)} /></label>
    <div className="db-layer-material-field"><span>Matériau / produit</span><MaterialSelect catalog={catalog} lang={lang} value={layer.productId || ''} emptyLabel={inherit ? 'Identique à la base' : '—'} onChange={(productId) => onChange({ productId })} /></div>
    {Object.entries(NUMBERS).map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" value={layer[key] ?? ''} placeholder={inherit ? base?.[key] ?? 'Base' : key === 'width_mm' || key === 'spacing_mm' ? 'Continu' : ''} onChange={(event) => onChange({ [key]: event.target.value })} /></label>)}
    <label>Couche / disposition<select value={layer.structure || (inherit ? '' : 'on-lying')} onChange={(event) => onChange({ structure: event.target.value })}>{inherit ? <option value="">Identique à la base</option> : null}<option value="on-lying">on-lying — en série</option><option value="in-lying">in-lying — en parallèle</option><option value="overlaying centered">overlaying centered — liaison</option></select></label>
    <label>Direction des fibres<select value={layer.fiberDirection ?? ''} onChange={(event) => onChange({ fiberDirection: event.target.value || null })}><option value="">{inherit ? 'Identique à la base' : 'Non renseignée'}</option><option value="quer">quer — transversale</option><option value="lengthwise">lengthwise — longitudinale</option></select></label>
    <label>Rôle<select value={layer.layerFunctionId || (inherit ? '' : layerRole(layer))} onChange={(event) => onChange({ layerFunctionId: event.target.value, isSupportStructure: event.target.value === 'structure' })}>{inherit ? <option value="">Identique à la base</option> : null}{LAYER_FUNCTION_IDS.map((id) => <option value={id} key={id}>{ROLE_LABELS[id]}</option>)}</select></label>
    <label>eCCC<select value={layer.ecccId || ''} onChange={(event) => onChange({ ecccId: event.target.value || null, ecccDescription: ecccData.find((item) => item.id === event.target.value)?.name || null })}><option value="">{inherit ? 'Identique à la base' : 'Non attribué'}</option>{ecccData.map((item) => <option key={item.id} value={item.id}>{item.id} — {item.name}</option>)}</select></label>
    <label>Réaction au feu<input value={layer.reactionToFire || ''} placeholder={inherit ? 'Identique à la base' : 'RF1, RF3…'} onChange={(event) => onChange({ reactionToFire: event.target.value || null })} /></label>
    <label>Type d’isolation<input value={layer.insulationTypeId || ''} placeholder="Détection automatique" onChange={(event) => onChange({ insulationTypeId: event.target.value || null })} /></label>
    <label><input type="checkbox" checked={layer.isSupportStructure === true || (layer.layerFunctionId || (inherit ? base?.layerFunctionId : '')) === 'structure'} onChange={(event) => onChange({ isSupportStructure: event.target.checked, layerFunctionId: event.target.checked ? 'structure' : (layer.layerFunctionId || base?.layerFunctionId) === 'structure' ? 'other' : layer.layerFunctionId })} /> Structure porteuse</label>
    <label><input type="checkbox" checked={Boolean(layer.protectsSupportSidesFromFire ?? (inherit ? base?.protectsSupportSidesFromFire : false))} onChange={(event) => onChange({ protectsSupportSidesFromFire: event.target.checked })} /> Protection latérale au feu</label>
  </div>;
}
