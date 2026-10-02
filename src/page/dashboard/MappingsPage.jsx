import React, { useContext, useEffect, useMemo, useState } from 'react';
import { apiJson, fetchArray, normalize } from './dashboardApi';
import LangContext from '../../context/LangContext';
import { dashboardFieldLabel, dashboardText, localizedName } from './dashboardI18n';

const CHARACTERISTICS = ['id', 'workingtitle', 'materialTypeId', 'materialcategoryId', 'functionId', 'kbobId', 'siaId', 'density_kg_m3', 'thermalConductivity_W_mK', 'specificHeat_Wh_kgK', 'specificHeat_J_kgK', 'waterVaporDiffusionResistanceCoefficientDry', 'waterVaporDiffusionResistanceCoefficientWet', 'fireClassification', 'reactionToFire'];

const targetValue = (target, key) => {
  if (!target) return null;
  if (target[key] !== undefined && target[key] !== null) return target[key];
  return target.declaredProperties?.[key] ?? target.calculatedProperties?.[key] ?? null;
};

const sameValue = (left, right) => String(left ?? '').trim() === String(right ?? '').trim();

function TargetSearch({ row, targets, lang, onChange }) {
  const { lang: interfaceLang } = useContext(LangContext);
  const t = dashboardText(interfaceLang);
  const selected = targets.find((item) => String(item.id) === String(row.tbzId));
  const [query, setQuery] = useState(selected ? `${localizedName(selected, lang)} · ${selected.kbobId || ''}` : '');
  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return targets.slice(0, 12);
    return targets.filter((item) => normalize(`${item.id} ${localizedName(item, lang)} ${item.workingtitle} ${item.kbobId}`).includes(needle)).slice(0, 12);
  }, [lang, query, targets]);
  return <div className="db-target-search"><label>{t.targetSearch}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t.id}, ${t.name}, kbobId`} /></label><div className="db-target-results">{results.length ? results.map((item) => <button type="button" className={String(item.id) === String(row.tbzId) ? 'active' : ''} key={item.id} onClick={() => { onChange(item.id); setQuery(`${localizedName(item, lang)} · ${item.kbobId || ''}`); }}><strong>{localizedName(item, lang)}</strong><small>{item.kind} · KBOB {item.kbobId || '—'} · <code>{item.id}</code></small></button>) : <p>{t.noResult}</p>}</div>{row.tbzId && <button type="button" onClick={() => { onChange(''); setQuery(''); }}>× {t.unmapped}</button>}</div>;
}

export default function MappingsPage() {
  const { lang } = useContext(LangContext);
  const t = dashboardText(lang);
  const [rows, setRows] = useState([]);
  const [targets, setTargets] = useState([]);
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [scope, setScope] = useState('selected');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      apiJson('/api/lignum/mappings'),
      fetchArray('/db/components_unified.json'),
      fetchArray('/db/components_lignum_selected.json'),
    ]).then(([data, unified, selected]) => {
      const selectedComponentIds = new Set(selected.map((item) => String(item.id)));
      const selectedReferenceIds = new Set();
      unified.forEach((component) => {
        if (!selectedComponentIds.has(String(component.id))) return;
        (component.structure?.layers || []).forEach((layer) => {
          if (layer.productId) selectedReferenceIds.add(String(layer.productId));
        });
      });
      setRows(data.rows.map((row) => ({
        ...row,
        usedBySelected: selectedReferenceIds.has(String(row.lignumId)),
      })));
      setTargets(data.tbzItems);
    }).catch((e) => setMessage(`Erreur : ${e.message}`));
  }, []);
  const targetById = useMemo(() => new Map(targets.map((item) => [String(item.id), item])), [targets]);
  const visible = useMemo(() => { const needle = normalize(query); return rows.filter((row) => (scope === 'unified' || row.usedBySelected) && (!onlyMissing || !row.tbzId) && (!needle || [row.lignumId, localizedName(row, lang), row.workingtitle, row.kbobId, row.tbzId, localizedName(targetById.get(String(row.tbzId)), lang)].some((v) => normalize(v).includes(needle)))); }, [lang, onlyMissing, query, rows, scope, targetById]);
  const update = (id, tbzId) => setRows((current) => current.map((row) => row.lignumId === id ? { ...row, tbzId } : row));
  const save = async () => { setBusy(true); setMessage('Enregistrement…'); try { const result = await apiJson('/api/lignum/mappings', { method: 'PUT', body: JSON.stringify({ mappings: rows.map(({ lignumId, tbzId }) => ({ lignumId, tbzId })) }) }); setMessage(`${result.count} correspondances enregistrées. Version : ${result.versionFile}`); } catch (e) { setMessage(`Erreur : ${e.message}`); } finally { setBusy(false); } };
  return <section className="db-card">
    <div className="db-title-row"><div><h2>{t.mappings} Lignum → TBZ</h2><p>{t.mappingIntro}</p></div><div className="db-title-actions"><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="selected">{t.selectedDatabase}</option><option value="unified">{t.unifiedDatabase}</option></select><button className="db-primary" disabled={busy} onClick={save}>{t.saveMappings}</button></div></div>
    <div className="db-toolbar"><input type="search" placeholder={`${t.name}, ${t.id}, KBOB…`} value={query} onChange={(e) => setQuery(e.target.value)} /><label><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> {t.missingOnly}</label><span>{visible.length}/{rows.length}</span></div>
    {message && <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p>}
    <div className="db-mapping-list">{visible.map((row) => { const target = targetById.get(String(row.tbzId)); return <details className={`db-mapping ${row.tbzId ? '' : 'missing'}`} key={row.lignumId}><summary><span><strong>{localizedName(row, lang) || row.workingtitle || '—'}</strong><small><code>{row.lignumId}</code> · KBOB {row.kbobId || '—'}</small></span><span className="db-map-arrow">→</span><span>{target ? <><strong>{localizedName(target, lang)}</strong><small>{target.kind} · <code>{target.id}</code></small></> : <strong>{t.unmapped}</strong>}</span></summary><div className="db-map-body"><TargetSearch row={row} targets={targets} lang={lang} onChange={(tbzId) => update(row.lignumId, tbzId)} /><div className="db-characteristics db-comparison"><div className="db-comparison-head"><small>{t.originalLignum}</small><small>{t.correctedTbz}</small></div>{CHARACTERISTICS.map((key) => { const original = key === 'id' ? row.lignumId : key === 'workingtitle' ? localizedName(row, lang) : row[key]; const corrected = key === 'workingtitle' ? localizedName(target, lang) : targetValue(target, key); const changed = target && !sameValue(original, corrected); return <div key={key}><small>{dashboardFieldLabel(key, lang)}</small><span>{String(original ?? '—')}</span><span className={changed ? 'db-changed' : ''}>{String(corrected ?? '—')}{changed && <em>{t.changed}</em>}</span></div>; })}</div></div></details>; })}</div>
  </section>;
}
