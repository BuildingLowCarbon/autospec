import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import categoriesData from '../../data/categories.json';
import { apiJson, labelOf } from './dashboardApi';
import { generationBlocks, replaceGenerationBlocks } from './generationHistory';
import LayerGroupEditor from './LayerGroupEditor';
import { materialOptionLabel } from '../../components/MaterialSelect';

const dateLabel = (value) => value ? new Date(value).toLocaleString('fr-CH') : 'Date inconnue';
const POSITIONS = [['structure', '1. Structures porteuses et couches intégrées'], ['above', '2. Couches au-dessus'], ['below', '3. Couches au-dessous']];

export default function GenerationHistoryPanel({ lang, materials, products, onUpdated, onDeleted = () => {} }) {
  const [history, setHistory] = useState([]);
  const [components, setComponents] = useState([]);
  const [runId, setRunId] = useState('');
  const [edits, setEdits] = useState({});
  const [selectedBlocks, setSelectedBlocks] = useState(new Set());
  const [editor, setEditor] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const catalog = useMemo(() => [...materials, ...products], [materials, products]);
  const catalogById = useMemo(() => new Map(catalog.map((item) => [String(item.id), item])), [catalog]);
  const run = history.find((entry) => entry.id === runId);
  const runComponents = useMemo(() => {
    const ids = new Set(run?.componentIds || []);
    return components.filter((component) => ids.has(component.id));
  }, [run, components]);
  const blocks = useMemo(() => generationBlocks(runComponents), [runComponents]);
  const replacements = useMemo(() => replaceGenerationBlocks(runComponents, blocks, edits, selectedBlocks), [runComponents, blocks, edits, selectedBlocks]);

  useEffect(() => {
    let cancelled = false;
    apiJson('/api/structures/history', { cache: 'no-store' }).then((payload) => {
      if (cancelled) return;
      const entries = (payload.history || []).filter((entry) => !entry.deletedAt).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      setHistory(entries); setComponents(payload.components || []); setRunId(entries.at(-1)?.id || '');
    }).catch((error) => { if (!cancelled) setMessage(`Erreur : ${error.message}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setEdits({}); setEditor(null); setPreviewOpen(false); setName(run?.name || '');
    setSelectedBlocks(new Set(Object.values(blocks).flat().map((block) => block.id)));
  }, [blocks, run]);

  const layerLabel = (layer) => {
    const material = catalogById.get(String(layer.productId || layer.materialId));
    return `${material ? materialOptionLabel(material, lang) : layer.productName || layer.translations?.[lang]?.name || 'Liaison / air'} · ${layer.thickness_mm ?? '—'} mm${layer.width_mm != null ? ` · b ${layer.width_mm}` : ''}${layer.spacing_mm != null ? ` · e ${layer.spacing_mm}` : ''}${layer.structure === 'in-lying' ? ' · en parallèle' : ''}`;
  };

  const apply = async () => {
    if (!run || !replacements.length) return;
    setBusy(true); setMessage('');
    try {
      const byId = new Map(runComponents.map((component) => [component.id, component]));
      const result = await apiJson(`/api/structures/history/${run.id}`, { method: 'PATCH', body: JSON.stringify({
        expectedRevision: run.revision, name, componentIds: replacements.map((item) => item.id), replacements,
        expectedVersions: Object.fromEntries(replacements.map((item) => [item.id, byId.get(item.id).metadata?.updated_at || null])),
      }) });
      const updated = new Map(result.updated.map((item) => [item.id, item]));
      setComponents((current) => current.map((item) => updated.get(item.id) || item));
      setHistory(result.history.filter((entry) => !entry.deletedAt));
      onUpdated(result.updated);
      setMessage(`${result.updated.length} composant(s) mis à jour et recalculés, identifiants conservés. Version : ${result.versionFile}`);
    } catch (error) { setMessage(`Erreur : ${error.message}`); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!run || !window.confirm(`Supprimer la génération « ${run.name} » et les composants créés uniquement par ce lot ? Les composants réutilisés ou partagés avec un autre lot seront conservés. Une sauvegarde sera créée.`)) return;
    setBusy(true); setMessage('');
    try {
      const result = await apiJson(`/api/structures/history/${run.id}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision: run.revision }) });
      const deleted = new Set(result.deletedIds);
      setComponents((current) => current.filter((item) => !deleted.has(item.id)));
      setHistory(result.history); setRunId(result.history.at(-1)?.id || '');
      onDeleted(result.deletedIds);
      setMessage(`Génération supprimée : ${result.deletedIds.length} composant(s) supprimés, ${result.retainedIds.length} réutilisé(s) ou partagé(s) conservés. Sauvegarde : ${result.versionFile}`);
    } catch (error) { setMessage(`Erreur : ${error.message}`); }
    finally { setBusy(false); }
  };

  if (loading) return <p>Chargement de l’historique…</p>;
  return <section className="db-generation-history">
    <div className="db-editor-title"><h3>Historique des générations</h3><button type="button" disabled={busy} onClick={async () => { setLoading(true); try { const result = await apiJson('/api/structures/history', { cache: 'no-store' }); setHistory(result.history); setComponents(result.components); } catch (error) { setMessage(`Erreur : ${error.message}`); } finally { setLoading(false); } }}>Actualiser</button></div>
    {!history.length ? <p>Aucune génération enregistrée.</p> : <>
      <label>Génération<select value={runId} disabled={busy} onChange={(event) => { setRunId(event.target.value); setMessage(''); }}>{[...history].reverse().map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.componentIds.length} composants · révision {entry.revision}</option>)}</select></label>
      {run ? <>
        <div className="db-generator-intro"><label>Nom de la génération<input value={name} onChange={(event) => setName(event.target.value)} /></label><span>Créée le {dateLabel(run.createdAt)} · {runComponents.length}/{run.componentIds.length} composants disponibles</span><button type="button" className="db-danger" disabled={busy} onClick={remove}>Supprimer cette génération</button></div>
        <p>{categoriesData.categories.find((category) => category.id === runComponents[0]?.categoryId)?.label?.[lang] || runComponents[0]?.categoryId} · Sélectionnez le groupe à modifier dans une des trois colonnes. Les autres parties des composants sont conservées.</p>
        {run.reconstructed ? <p className="building-weight-note">Lot récupéré à partir des composants existants. Vérifiez la liste concernée avant une modification.</p> : null}
        <div className="db-generator-columns">{POSITIONS.map(([position, title]) => <section className="db-generator-column" key={position}><h4>{title}</h4><div>{blocks[position].map((block, index) => {
          const current = edits[block.id] || block;
          return <div className={`db-group-choice${edits[block.id] ? ' is-edited' : ''}`} key={block.id}>
            <label><input type="checkbox" checked={selectedBlocks.has(block.id)} onChange={(event) => { setSelectedBlocks((previous) => { const next = new Set(previous); if (event.target.checked) next.add(block.id); else next.delete(block.id); return next; }); setPreviewOpen(false); }} /><span><strong>{current.name || `${position === 'structure' ? 'Structure' : 'Groupe'} ${index + 1}`}{edits[block.id] ? ' — modifié' : ''}</strong><small>{current.layers.length} couche(s) · {block.componentIds.length} composant(s)</small></span></label>
            <ul>{current.layers.map((layer, i) => <li key={i}>{layerLabel(layer)}</li>)}</ul>
            <button type="button" disabled={busy} onClick={() => setEditor({ ...current, id: block.id, name: current.name || `${position === 'structure' ? 'Structure' : 'Groupe'} ${index + 1}` })}>Modifier {position === 'structure' ? 'la structure' : 'le groupe'} {index + 1}</button>
            {edits[block.id] ? <button type="button" onClick={() => { setEdits((previous) => { const next = { ...previous }; delete next[block.id]; return next; }); setPreviewOpen(false); }}>Annuler ce changement</button> : null}
          </div>;
        })}</div></section>)}</div>
        {editor ? <LayerGroupEditor key={editor.id} initialValue={editor} catalog={catalog} lang={lang} busy={busy} allowPosition={false} allowVariants={false} title={editor.position === 'structure' ? 'Modifier la structure et ses couches intégrées' : 'Modifier les couches du groupe'} onClose={() => setEditor(null)} onSave={(value) => { setEdits({ ...edits, [value.id]: value }); setEditor(null); setPreviewOpen(false); }} /> : null}
        <section className="db-generation-preview"><h3>Aperçu des modifications</h3><p>{replacements.length} composant(s) concernés. Chaque composant conserve son identifiant et ses autres groupes de couches.</p><button type="button" disabled={busy || !replacements.length} onClick={() => setPreviewOpen(true)}>Prévisualiser les modifications ({replacements.length} composants)</button>
          {previewOpen ? <div className="db-generation-warning"><strong>{replacements.length} composant(s) seront modifiés et recalculés.</strong><ul>{replacements.map((replacement) => <li key={replacement.id}><Link to={`/element/${replacement.id}`}>{labelOf(runComponents.find((component) => component.id === replacement.id), lang)}</Link> · {replacement.layers.length} couches · {replacement.id}</li>)}</ul><button type="button" className="db-primary" disabled={busy} onClick={apply}>{busy ? 'Mise à jour…' : 'Appliquer aux composants existants'}</button></div> : null}
        </section>
        <details><summary>Révisions et modifications</summary><ul>{[...(run.events || [])].reverse().map((event, index) => <li key={`${event.at}-${index}`}>{dateLabel(event.at)} · {event.type === 'groups_update' ? 'Modification des groupes de couches' : event.type === 'parameter_update' ? 'Modification des paramètres' : event.type === 'legacy_import' ? 'Récupération historique' : 'Génération'}{event.versionFile ? ` · ${event.versionFile}` : ''}</li>)}</ul></details>
      </> : null}
    </>}
    {message ? <p role="status" className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p> : null}
  </section>;
}
