import React, { useState } from 'react';
import { apiJson } from './dashboardApi';
import { inferInsulationTypeId, isSupportStructureLayer, LAYER_FUNCTION_IDS, layerRole } from './structureGrouping';

const LABELS = {
  structure: 'Structure porteuse', insulation: 'Isolation', screed: 'Chape', bracing: 'Contreventement', mass: 'Ajout de masse',
  sealing: 'Étanchéité / pare-vapeur', battens: 'Lattes / profils', connection: 'Liaison', covering: 'Parement / revêtement', finish: 'Finition', other: 'Autre',
};
const INSULATION_TYPES = [
  ['mineral_wool', 'Laine minérale'], ['wood_fibre', 'Fibre de bois'], ['cellulose', 'Cellulose'], ['eps', 'EPS'], ['xps', 'XPS'],
  ['pur_pir', 'PUR / PIR'], ['foam_glass', 'Verre cellulaire'], ['plant_fibre', 'Fibre végétale'], ['other', 'Autre'],
];

const layerName = (layer, lang) => layer?.translations?.[lang]?.name || layer?.translations?.[lang]?.description || layer?.translations?.fr?.name || layer?.translations?.fr?.description || layer?.productName || layer?.productId || layer?.materialId || 'Couche';

export default function LayerIdentificationEditor({ component, source, lang, onClose, onSaved }) {
  const [layers, setLayers] = useState(() => (component.structure?.layers || []).map((layer) => ({
    ...layer,
    layerFunctionId: layer.layerFunctionId || layerRole(layer),
    isSupportStructure: isSupportStructureLayer(layer),
    insulationTypeId: (layer.layerFunctionId || layerRole(layer)) === 'insulation' ? inferInsulationTypeId(layer) : null,
  })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const update = (index, patch) => setLayers((current) => current.map((layer, layerIndex) => layerIndex === index ? { ...layer, ...patch } : layer));
  const save = async () => {
    setBusy(true);
    try {
      const result = await apiJson(`/api/structures/component/${encodeURIComponent(source)}/${encodeURIComponent(component.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ layers: layers.map((layer, order) => ({
          ...layer,
          order,
          layerFunctionId: layer.isSupportStructure ? 'structure' : layer.layerFunctionId,
          insulationTypeId: layer.layerFunctionId === 'insulation' ? (layer.insulationTypeId || null) : null,
        })) }),
      });
      onSaved(result.item);
      setMessage(`Identification enregistrée dans ${source}.`);
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return <div className="db-identification-editor">
    <div className="db-editor-title"><div><h4>Identifier les couches</h4><small>Les valeurs explicites enregistrées ici priment sur la détection automatique.</small></div><button type="button" onClick={onClose}>Fermer</button></div>
    <div className="db-identification-list">{layers.map((layer, index) => <div key={`${layer.order ?? index}-${index}`} className={layer.isSupportStructure ? 'is-support' : ''}>
      <strong>{index + 1}. {layerName(layer, lang)}</strong>
      <small>{layer.thickness_mm ?? '—'} mm</small>
      <label><input type="checkbox" checked={layer.isSupportStructure} onChange={(event) => update(index, { isSupportStructure: event.target.checked, layerFunctionId: event.target.checked ? 'structure' : (layer.layerFunctionId === 'structure' ? 'other' : layer.layerFunctionId) })} /> Dans la structure porteuse</label>
      <label>Rôle<select disabled={layer.isSupportStructure} value={layer.isSupportStructure ? 'structure' : layer.layerFunctionId} onChange={(event) => update(index, { layerFunctionId: event.target.value })}>{LAYER_FUNCTION_IDS.filter((id) => layer.isSupportStructure || id !== 'structure').map((id) => <option value={id} key={id}>{LABELS[id]}</option>)}</select></label>
      {!layer.isSupportStructure && layer.layerFunctionId === 'insulation' ? <label>Type d’isolation<select value={layer.insulationTypeId || ''} onChange={(event) => update(index, { insulationTypeId: event.target.value })}><option value="">À identifier</option>{INSULATION_TYPES.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label> : null}
    </div>)}</div>
    <div className="db-title-actions"><button className="db-primary" disabled={busy} type="button" onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer les identifications'}</button>{message ? <span className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</span> : null}</div>
  </div>;
}
