import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import ComponentPreviewViews from '../components/ComponentPreviewViews';
import LangContext from '../context/LangContext';
import { getAcousticInsulation } from '../utils/acoustic';
import loadComponents from '../utils/loadComponents';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import { hasSelectedGroup, groupDescriptorIdentity, setGroupSelected, setGroupIgnored, readBuildingDraft, writeBuildingDraft } from '../utils/buildingGroupSelections';
import { groupComponentsByStructure, layerRole, splitLayersAroundStructure } from './dashboard/structureGrouping';
import './ComponentGroup.css';

const ROLE_LABELS = {
  structure: 'Structure porteuse', insulation: 'Isolation', screed: 'Chape', bracing: 'Contreventement', mass: 'Ajout de masse',
  sealing: 'Étanchéité / pare-vapeur', battens: 'Lattes / profils', connection: 'Liaison', covering: 'Parement / revêtement', finish: 'Finition', other: 'Autre',
};

const nameOf = (item, lang) => item?.translations?.[lang]?.name
  || item?.translations?.fr?.name || item?.translations?.de?.name || item?.translations?.en?.name
  || item?.workingtitle || item?.serialNo || item?.source?.externalId || item?.id || 'Composant';

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const display = (value, digits, unit) => {
  const number = finite(value);
  return number === null ? 'N/A' : `${number.toLocaleString('fr-CH', { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`;
};

const referencedId = (layer) => String(layer?.productId || layer?.materialId || '');
const layerDifferenceKey = (layer) => layer ? JSON.stringify({
  reference: referencedId(layer),
  thickness_mm: finite(layer.thickness_mm), width_mm: finite(layer.width_mm), spacing_mm: finite(layer.spacing_mm),
  role: layerRole(layer), structure: layer.structure || null,
}) : '__missing__';

const splitForComparison = (item) => {
  const split = splitLayersAroundStructure(item);
  return { above: split.above, support: split.support, within: split.within, below: split.below };
};

const differingIndexes = (variants, zone) => {
  const layersByVariant = variants.map((item) => splitForComparison(item)[zone]);
  const max = Math.max(0, ...layersByVariant.map((layers) => layers.length));
  return Array.from({ length: max }, (_, index) => index)
    .filter((index) => new Set(layersByVariant.map((layers) => layerDifferenceKey(layers[index]))).size > 1);
};

function DifferenceLayerList({ layers, indexes, lang, catalog }) {
  if (!indexes.length) return <span className="component-group-identical">Identique</span>;
  return <div className="component-group-difference-layers">
    {indexes.map((index) => {
      const layer = layers[index];
      if (!layer) return <div className="is-missing" key={index}>— aucune couche —</div>;
      const material = catalog.get(referencedId(layer));
      const dimensions = [
        finite(layer.thickness_mm) !== null ? display(layer.thickness_mm, 1, 'mm') : null,
        finite(layer.width_mm) !== null ? `b ${display(layer.width_mm, 1, 'mm')}` : null,
        finite(layer.spacing_mm) !== null ? `e ${display(layer.spacing_mm, 1, 'mm')}` : null,
      ].filter(Boolean).join(' · ');
      return <div key={`${index}-${referencedId(layer)}`}>
        <strong>{material ? nameOf(material, lang) : 'Matériau non renseigné'}</strong>
        <span>{dimensions || 'Dimensions non renseignées'}</span>
        <small>{ROLE_LABELS[layerRole(layer)] || layerRole(layer)}</small>
      </div>;
    })}
  </div>;
}

function DifferenceProperties({ item, fields }) {
  if (!fields.length) return <span className="component-group-identical">Identiques</span>;
  const acoustic = getAcousticInsulation(item);
  const values = {
    thickness: ['Épaisseur', display(item.thickness_mm, 0, 'mm')], weight: ['Masse', display(item.weight_kg_m2, 0, 'kg/m²')],
    uValue: ['Valeur U', display(item.uValue_W_m2K, 3, 'W/m²K')], gwp: ['GWP', display(item.gwp_kgco2e_m2, 1, 'kg CO₂-eq/m²')],
    rw: ['Rw', display(acoustic.rwCorrected, 0, 'dB')], lnw: ['Ln,w', display(acoustic.lnwCorrected, 0, 'dB')],
    layers: ['Couches', String(item?.structure?.layers?.length || 0)],
  };
  return <div className="component-group-difference-properties">{fields.map((key) => <div key={key}><span>{values[key][0]}</span><strong>{values[key][1]}</strong></div>)}</div>;
}

function ComparisonTable({ items, lang, matching, fields, zoneIndexes, catalog }) {
  if (!items.length) return <p>Aucune variante de ce groupe ne correspond actuellement aux filtres.</p>;
  return <div className="component-group-table-wrap"><table className="component-group-table">
    <thead><tr><th>Composant</th><th>Caractéristiques différentes</th><th>Au-dessus</th><th>Structure</th><th>Intégré</th><th>Au-dessous</th></tr></thead>
    <tbody>{items.map((item) => {
      const zones = splitForComparison(item);
      return <tr className={matching ? '' : 'is-filtered-out'} key={item.id}>
        <td><span className="component-group-match">{matching ? 'Correspond aux filtres' : 'Hors filtres'}</span><Link to={`/element/${item.id}`}>{nameOf(item, lang)}</Link><small>{item.serialNo || item.source?.externalId || item.id}</small><ComponentPreviewViews layers={item.structure?.layers || []} /></td>
        <td><DifferenceProperties item={item} fields={fields} /></td>
        {['above', 'support', 'within', 'below'].map((zone) => <td key={zone}><DifferenceLayerList layers={zones[zone]} indexes={zoneIndexes[zone]} lang={lang} catalog={catalog} /></td>)}
      </tr>;
    })}</tbody>
  </table></div>;
}

export default function ComponentGroup() {
  const { lang, setLang } = useContext(LangContext);
  const { groupKey: encodedGroupKey } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const groupKey = decodeURIComponent(encodedGroupKey || '');
  const storageKey = `autospec-component-group:${groupKey}`;
  const [context, setContext] = useState(() => {
    if (location.state) return location.state;
    try { return JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') || {}; } catch (error) { return {}; }
  });
  const [data, setData] = useState({ components: [], materials: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [selectionState, setSelectionState] = useState(() => {
    const draft = readBuildingDraft(context.projectSessionKey);
    return draft && draft.id === context.projectId ? draft.state : context.selectionState || {};
  });
  const [selectionMessage, setSelectionMessage] = useState('');

  const descriptor = context.descriptor;
  const draft = readBuildingDraft(context.projectSessionKey);
  const canEditSelection = Boolean(descriptor && draft && draft.id === context.projectId);
  const selected = descriptor ? hasSelectedGroup(selectionState, descriptor) : false;
  const ignored = descriptor ? (selectionState.ignoredGroupIds || []).includes(groupDescriptorIdentity(descriptor)) : false;
  const changeSelection = (action, checked) => {
    const currentDraft = readBuildingDraft(context.projectSessionKey);
    if (!currentDraft || currentDraft.id !== context.projectId) return;
    const proposed = { ...descriptor, filterSummary: context.filterSummary || [] };
    const next = action === 'ignore'
      ? setGroupIgnored(currentDraft.state, proposed, checked)
      : setGroupSelected(currentDraft.state, proposed, checked);
    writeBuildingDraft(context.projectSessionKey, { ...currentDraft, state: next, dirty: true });
    setSelectionState(next);
    setSelectionMessage('Choix conservé dans le brouillon du bâtiment.');
  };

  useEffect(() => {
    if (!location.state) return;
    setContext(location.state);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(location.state)); } catch (error) { /* Optional cache. */ }
  }, [location.state, storageKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadComponents(), loadMaterials(), loadProducts()])
      .then(([components, materials, products]) => { if (!cancelled) setData({ components, materials, products }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const catalog = useMemo(() => new Map([...data.materials, ...data.products].map((item) => [String(item.id), item])), [data.materials, data.products]);
  const group = useMemo(() => groupComponentsByStructure(data.components).find((entry) => entry.key === groupKey) || null, [data.components, groupKey]);
  const matchingIds = useMemo(() => new Set((context.matchingIds || []).map(String)), [context.matchingIds]);
  const hasFilterContext = Array.isArray(context.matchingIds);
  const ordered = useMemo(() => {
    const variants = group?.variants || [];
    return [...variants].sort((a, b) => Number(!(hasFilterContext ? matchingIds.has(String(a.id)) : true)) - Number(!(hasFilterContext ? matchingIds.has(String(b.id)) : true)));
  }, [group, hasFilterContext, matchingIds]);
  const matching = ordered.filter((item) => !hasFilterContext || matchingIds.has(String(item.id)));
  const excluded = ordered.filter((item) => hasFilterContext && !matchingIds.has(String(item.id)));

  const differingFields = useMemo(() => {
    const accessors = {
      thickness: (item) => finite(item.thickness_mm), weight: (item) => finite(item.weight_kg_m2), uValue: (item) => finite(item.uValue_W_m2K),
      gwp: (item) => finite(item.gwp_kgco2e_m2), rw: (item) => finite(getAcousticInsulation(item).rwCorrected),
      lnw: (item) => finite(getAcousticInsulation(item).lnwCorrected), layers: (item) => item?.structure?.layers?.length || 0,
    };
    return Object.entries(accessors).filter(([, accessor]) => new Set(ordered.map(accessor)).size > 1).map(([key]) => key);
  }, [ordered]);
  const zoneIndexes = useMemo(() => Object.fromEntries(['above', 'support', 'within', 'below'].map((zone) => [zone, differingIndexes(ordered, zone)])), [ordered]);
  const structureTitle = group?.supportLayers?.map((layer) => {
    const dimensions = [layer.thickness_mm, layer.width_mm, layer.spacing_mm].map(finite);
    return `${dimensions[0] ?? '—'} mm${dimensions[1] !== null ? ` · b ${dimensions[1]} mm` : ''}${dimensions[2] !== null ? ` · e ${dimensions[2]} mm` : ''}`;
  }).join(' + ');

  return <>
    <Header lang={lang} setLang={setLang} />
    <main className="component-group-page">
      <button type="button" className="component-group-back" onClick={() => navigate(-1)}>← Retour au bâtiment</button>
      {loading ? <p>Chargement…</p> : null}
      {!loading && !group ? <section className="component-group-empty"><h1>Groupe introuvable</h1><p>Ce groupe n’est plus disponible dans les bases actuelles.</p></section> : null}
      {group ? <>
        <header className="component-group-page-header"><div><small>Comparaison des variantes</small><h1>{structureTitle || 'Structure non identifiée'}</h1><p>{group.variants.length} variante{group.variants.length > 1 ? 's' : ''}, dont {matching.length} correspondant aux filtres du bâtiment. Seules les différences sont affichées.</p></div></header>
        {context.filterSummary?.length ? <section className="component-group-filter-summary"><h2>Filtres du bâtiment</h2><div>{context.filterSummary.map((entry) => <p key={entry.label}><span>{entry.label}</span><strong>{entry.value}</strong></p>)}</div></section> : null}
        {canEditSelection ? <section className="component-group-selection-controls"><label><input type="checkbox" checked={selected} onChange={(event) => changeSelection('select', event.target.checked)} /> Sélectionner le groupe</label><label><input type="checkbox" checked={ignored} onChange={(event) => changeSelection('ignore', event.target.checked)} /> Ignorer le groupe</label>{selectionMessage ? <p role="status">{selectionMessage}</p> : null}</section> : null}
        <section className="component-group-variants-section"><h2>Variantes correspondant aux filtres ({matching.length})</h2><ComparisonTable items={matching} lang={lang} matching fields={differingFields} zoneIndexes={zoneIndexes} catalog={catalog} /></section>
        {excluded.length ? <section className="component-group-variants-section is-excluded"><h2>Autres variantes du groupe ({excluded.length})</h2><p>Ces variantes ne participent pas à la plage du bâtiment.</p><ComparisonTable items={excluded} lang={lang} matching={false} fields={differingFields} zoneIndexes={zoneIndexes} catalog={catalog} /></section> : null}
      </> : null}
    </main>
  </>;
}
