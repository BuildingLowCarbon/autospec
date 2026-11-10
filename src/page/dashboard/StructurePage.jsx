import React, { Fragment, useContext, useEffect, useMemo, useState } from 'react';
import LangContext from '../../context/LangContext';
import { invalidateComponentsCache } from '../../utils/loadComponents';
import categoriesData from '../../data/categories.json';
import dataTranslations from '../../language/dataTranslations';
import { getSubcategoryLabel } from '../../utils/componentTaxonomy';
import { apiJson, fetchArray, labelOf, normalize } from './dashboardApi';
import { groupComponentsByStructure, inferInsulationTypeId, layerRole, splitLayersAroundStructure } from './structureGrouping';
import LayerIdentificationEditor from './LayerIdentificationEditor';
import StructureGeneratorPanel from './StructureGeneratorPanel';
import './structure.css';
import './structureWorkspace.css';

const ROLE_LABELS = {
  fr: { structure: 'Structure', insulation: 'Isolation', screed: 'Chape', bracing: 'Contreventement', mass: 'Ajout de masse', sealing: 'Étanchéité', battens: 'Lattes / profils', connection: 'Liaison', covering: 'Parement / revêtement', finish: 'Finition', other: 'Autre' },
  de: { structure: 'Struktur', insulation: 'Dämmung', screed: 'Estrich', bracing: 'Aussteifung', mass: 'Masse', sealing: 'Abdichtung', battens: 'Latten / Profile', connection: 'Verbindung', covering: 'Bekleidung', finish: 'Oberfläche', other: 'Andere' },
  en: { structure: 'Structure', insulation: 'Insulation', screed: 'Screed', bracing: 'Bracing', mass: 'Mass addition', sealing: 'Sealing', battens: 'Battens / profiles', connection: 'Connection', covering: 'Covering', finish: 'Finish', other: 'Other' },
  it: { structure: 'Struttura', insulation: 'Isolamento', screed: 'Massetto', bracing: 'Controventatura', mass: 'Massa', sealing: 'Impermeabilizzazione', battens: 'Listelli / profili', connection: 'Collegamento', covering: 'Rivestimento', finish: 'Finitura', other: 'Altro' },
};

const TEXT = {
  fr: { title: 'Structures', intro: 'Composants Lignum, Minergie et Bauteilkatalog regroupés par catégorie et par dimensions de structure. Les couches périphériques constituent les variantes.', search: 'Rechercher une structure ou un composant…', all: 'Toutes', selectedOnly: 'Sélectionnées uniquement', sources: 'Sources', order: 'Trier', dimensions: 'Dimensions', variants: 'Nombre de variantes', selected: 'Nombre sélectionné', structure: 'Structure', variantCount: 'Variantes', selectedCount: 'Sélectionnés', component: 'Composant', above: 'Avant / au-dessus', within: 'Structure et couches intégrées', below: 'Après / en dessous', unidentified: 'Structure non identifiée', save: 'Enregistrer la sélection Lignum', saving: 'Enregistrement…', empty: 'Aucune structure ne correspond aux filtres.', saved: 'composants Lignum enregistrés', version: 'Version', alwaysActive: 'Base active complète' },
  de: { title: 'Strukturen', intro: 'Lignum-, Minergie- und Bauteilkatalog-Bauteile nach Kategorie und Strukturabmessungen gruppiert. Die umgebenden Schichten bilden die Varianten.', search: 'Struktur oder Bauteil suchen…', all: 'Alle', selectedOnly: 'Nur ausgewählte', sources: 'Quellen', order: 'Sortieren', dimensions: 'Abmessungen', variants: 'Anzahl Varianten', selected: 'Anzahl ausgewählt', structure: 'Struktur', variantCount: 'Varianten', selectedCount: 'Ausgewählt', component: 'Bauteil', above: 'Vorher / oben', within: 'Struktur und integrierte Schichten', below: 'Nachher / unten', unidentified: 'Struktur nicht erkannt', save: 'Lignum-Auswahl speichern', saving: 'Speichern…', empty: 'Keine Struktur entspricht den Filtern.', saved: 'Lignum-Bauteile gespeichert', version: 'Version', alwaysActive: 'Vollständig aktive Datenbank' },
  en: { title: 'Structures', intro: 'Lignum, Minergie and Bauteilkatalog components grouped by category and structure dimensions. Surrounding layers form the variants.', search: 'Search for a structure or component…', all: 'All', selectedOnly: 'Selected only', sources: 'Sources', order: 'Sort', dimensions: 'Dimensions', variants: 'Variant count', selected: 'Selected count', structure: 'Structure', variantCount: 'Variants', selectedCount: 'Selected', component: 'Component', above: 'Before / above', within: 'Structure and integrated layers', below: 'After / below', unidentified: 'Unidentified structure', save: 'Save Lignum selection', saving: 'Saving…', empty: 'No structure matches the filters.', saved: 'Lignum components saved', version: 'Version', alwaysActive: 'Fully active database' },
};
TEXT.it = { ...TEXT.en, title: 'Strutture' };
TEXT.fr.subcategory = 'Sous-catégorie';
TEXT.de.subcategory = 'Unterkategorie';
TEXT.en.subcategory = 'Subcategory';
TEXT.it.subcategory = 'Sottocategoria';

const localized = (translations, lang, field = 'name') => {
  const order = [lang, 'fr', 'de', 'en', 'it'].filter((value, index, all) => value && all.indexOf(value) === index);
  for (const code of order) {
    const value = translations?.[code]?.[field];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
};

const dimensionText = (layer) => {
  const values = [];
  if (layer?.thickness_mm !== null && layer?.thickness_mm !== undefined) values.push(`h ${Number(layer.thickness_mm).toLocaleString('fr-CH')} mm`);
  if (layer?.width_mm !== null && layer?.width_mm !== undefined) values.push(`b ${Number(layer.width_mm).toLocaleString('fr-CH')} mm`);
  if (layer?.spacing_mm !== null && layer?.spacing_mm !== undefined) values.push(`e ${Number(layer.spacing_mm).toLocaleString('fr-CH')} mm`);
  return values.join(' · ');
};

const sourceId = (item) => String(item?.source?.databaseId || '').toLowerCase() || 'unknown';
const SOURCE_LABELS = { lignum: 'Lignum', minergie: 'Minergie', btk: 'Bauteilkatalog', generated: 'TypoBuildZero' };
const INSULATION_LABELS = { mineral_wool: 'Laine minérale', wood_fibre: 'Fibre de bois', cellulose: 'Cellulose', eps: 'EPS', xps: 'XPS', pur_pir: 'PUR / PIR', foam_glass: 'Verre cellulaire', plant_fibre: 'Fibre végétale', other: 'Autre' };

function LayerList({ layers, lang }) {
  if (!layers.length) return <span className="db-structure-empty">—</span>;
  const roles = ROLE_LABELS[lang] || ROLE_LABELS.en;
  return <div className="db-layer-list">{layers.map((layer, index) => {
    const role = layerRole(layer);
    const insulationTypeId = role === 'insulation' ? inferInsulationTypeId(layer) : null;
    return <div className="db-layer-item" key={`${layer.order ?? index}-${layer.productId || layer.materialId || index}`}>
      <span className={`db-layer-role role-${role}`}>{roles[role]}</span>
      <strong>{localized(layer.translations, lang) || layer.productName || layer.productId || layer.materialId || 'Couche'}</strong>
      {dimensionText(layer) ? <small>{dimensionText(layer)}</small> : null}
      {insulationTypeId ? <small>Type : {INSULATION_LABELS[insulationTypeId] || insulationTypeId}</small> : null}
    </div>;
  })}</div>;
}

export default function StructurePage() {
  const { lang } = useContext(LangContext);
  const t = TEXT[lang] || TEXT.fr;
  const [components, setComponents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [sort, setSort] = useState('dimensions');
  const [enabledSources, setEnabledSources] = useState(() => new Set(['lignum', 'minergie', 'btk', 'generated']));
  const [openGroup, setOpenGroup] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('explorer');
  const [editingIdentification, setEditingIdentification] = useState(null);

  useEffect(() => {
    Promise.all([
      fetchArray('/db/components_unified.json'),
      fetchArray('/db/components_minergie_enriched.json'),
      fetchArray('/db/components_btk_enriched.json'),
      fetchArray('/db/components_lignum_selected.json'),
      fetchArray('/db/components_generated.json'),
    ])
      .then(([lignum, minergie, btk, current, generated]) => {
        setComponents([...lignum, ...minergie, ...btk, ...generated]);
        setSelected(new Set(current.map((item) => String(item.id))));
      })
      .catch((error) => setMessage(`Erreur : ${error.message}`));
  }, []);

  const groups = useMemo(() => groupComponentsByStructure(
    components.filter((item) => enabledSources.has(sourceId(item))),
    { separateSubcategories: true },
  ), [components, enabledSources]);
  const categoryMeta = useMemo(() => new Map(categoriesData.categories.map((category) => [category.id, category])), []);
  const visibleCategories = useMemo(() => {
    const needle = normalize(query);
    const categoryGroups = new Map();
    groups.forEach((group) => {
      const selectedCount = group.variants.filter((item) => sourceId(item) !== 'lignum' || selected.has(String(item.id))).length;
      if (onlySelected && !selectedCount) return;
      const supportNames = [...new Set(group.variants.flatMap((item) =>
        splitLayersAroundStructure(item).support.map((layer) => localized(layer.translations, lang) || layer.productName).filter(Boolean)))].join(' / ');
      const subcategoryLabel = getSubcategoryLabel(categoryMeta.get(group.categoryId), group.subcategoryId, lang) || '—';
      const matches = !needle || normalize([
        supportNames,
        subcategoryLabel,
        ...group.variants.flatMap((item) => [item.id, item.serialNo, labelOf(item, lang)]),
      ].join(' ')).includes(needle);
      if (!matches) return;
      const enriched = { ...group, selectedCount, supportNames, subcategoryLabel };
      if (!categoryGroups.has(group.categoryId)) categoryGroups.set(group.categoryId, []);
      categoryGroups.get(group.categoryId).push(enriched);
    });
    const collator = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
    const comparison = (a, b) => {
      if (sort === 'variants') return b.variants.length - a.variants.length || collator.compare(a.supportNames, b.supportNames);
      if (sort === 'selected') return b.selectedCount - a.selectedCount || b.variants.length - a.variants.length;
      if (sort === 'name') return collator.compare(a.supportNames, b.supportNames);
      const aDimensions = a.supportLayers.map(dimensionText).join(' ');
      const bDimensions = b.supportLayers.map(dimensionText).join(' ');
      return collator.compare(aDimensions, bDimensions) || collator.compare(a.supportNames, b.supportNames);
    };
    const entries = [...categoryGroups.entries()].map(([categoryId, items]) => [categoryId, items.sort(comparison)]);
    return entries.sort(([a], [b]) => {
      const orderA = categoryMeta.get(a)?.order ?? 999;
      const orderB = categoryMeta.get(b)?.order ?? 999;
      return orderA - orderB || collator.compare(a, b);
    });
  }, [categoryMeta, groups, lang, onlySelected, query, selected, sort]);

  const categoryLabel = (categoryId) => {
    const category = categoryMeta.get(categoryId);
    return category?.label?.[lang] || category?.label?.fr || dataTranslations.categories?.[categoryId]?.[lang] || dataTranslations.categories?.[categoryId]?.fr || categoryId;
  };
  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(String(id))) next.delete(String(id)); else next.add(String(id));
    return next;
  });
  const toggleSource = (id) => setEnabledSources((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const save = async () => {
    setBusy(true);
    setMessage(t.saving);
    try {
      const result = await apiJson('/api/lignum/selection', { method: 'POST', body: JSON.stringify({ selectedIds: [...selected] }) });
      invalidateComponentsCache();
      setMessage(`${result.count} ${t.saved}. ${t.version} : ${result.versionFile}`);
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const replaceComponent = (updated) => {
    const updatedSource = sourceId(updated);
    setComponents((current) => current.map((item) => (
      sourceId(item) === updatedSource && String(item.id) === String(updated.id) ? updated : item
    )));
  };

  const addGenerated = (created, updated = [], deletedIds = []) => setComponents((current) => {
    const updatedByKey = new Map(updated.map((item) => [`${sourceId(item)}:${item.id}`, item]));
    const deleted = new Set(deletedIds);
    const next = current.filter((item) => sourceId(item) !== 'generated' || !deleted.has(item.id)).map((item) => updatedByKey.get(`${sourceId(item)}:${item.id}`) || item);
    return [...next, ...created];
  });

  return <section className="db-card db-structures-page">
    <div className="db-title-row"><div><h2>{t.title}</h2><p>{t.intro}</p></div>{view === 'explorer' ? <button className="db-primary" disabled={busy} onClick={save}>{busy ? t.saving : t.save} ({selected.size})</button> : null}</div>
    <nav className="db-structure-tabs" aria-label="Outils de structure"><button type="button" className={view === 'explorer' ? 'active' : ''} onClick={() => setView('explorer')}>Explorer et identifier</button><button type="button" className={view === 'generator' ? 'active' : ''} onClick={() => setView('generator')}>Générer des variantes</button></nav>
    {view === 'generator' ? <StructureGeneratorPanel components={components} groups={groups} lang={lang} onGenerated={addGenerated} /> : <>
    <div className="db-toolbar">
      <input type="search" placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} />
      <label><input type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)} /> {t.selectedOnly}</label>
      <span className="db-structure-source-label">{t.sources}</span>
      {Object.entries(SOURCE_LABELS).map(([id, label]) => <label key={id}><input type="checkbox" checked={enabledSources.has(id)} onChange={() => toggleSource(id)} /> {label}</label>)}
      <label className="db-structure-sort">{t.order}
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="dimensions">{t.dimensions}</option>
          <option value="variants">{t.variants}</option>
          <option value="selected">{t.selected}</option>
          <option value="name">{t.structure}</option>
        </select>
      </label>
      <span>{visibleCategories.reduce((total, [, items]) => total + items.length, 0)}/{groups.length}</span>
    </div>
    {message ? <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p> : null}
    {!visibleCategories.length ? <p>{t.empty}</p> : visibleCategories.map(([categoryId, categoryGroups]) => <section className="db-structure-category" key={categoryId}>
      <h3>{categoryLabel(categoryId)} <small>{categoryGroups.length}</small></h3>
      <div className="db-table-wrap"><table className="db-table db-structure-groups"><thead><tr><th>{t.subcategory}</th><th>{t.structure}</th><th>{t.dimensions}</th><th>{t.variantCount}</th><th>{t.selectedCount}</th></tr></thead>
        <tbody>{categoryGroups.map((group) => {
          const isOpen = openGroup === group.key;
          return <Fragment key={group.key}>
            <tr className={isOpen ? 'is-open' : ''} onClick={() => setOpenGroup(isOpen ? null : group.key)}>
              <td>{group.subcategoryLabel}</td>
              <td><button type="button" className="db-structure-open" aria-expanded={isOpen}>{group.supportNames || t.unidentified}</button></td>
              <td>{group.supportLayers.length ? group.supportLayers.map((layer) => dimensionText(layer) || '—').join(' + ') : '—'}</td>
              <td>{group.variants.length}</td><td>{group.selectedCount}/{group.variants.length}</td>
            </tr>
            {isOpen ? <tr className="db-structure-detail-row"><td colSpan="5"><div className="db-structure-variants">
              <div className="db-structure-variant-head"><span></span><strong>{t.component}</strong><strong>{t.above}</strong><strong>{t.within}</strong><strong>{t.below}</strong></div>
              {group.variants.map((item) => {
                const layers = splitLayersAroundStructure(item);
                const source = sourceId(item);
                const isLignum = source === 'lignum';
                const isSelected = !isLignum || selected.has(String(item.id));
                return <div className={isSelected ? 'db-structure-variant is-selected' : 'db-structure-variant'} key={`${source}:${item.id}`}>
                  <label title={isLignum ? '' : t.alwaysActive}><input type="checkbox" checked={isSelected} disabled={!isLignum} onChange={() => isLignum && toggle(item.id)} aria-label={`Sélection ${item.serialNo || item.id}`} /></label>
                  <div className="db-variant-name"><span className={`db-source-badge source-${source}`}>{SOURCE_LABELS[source] || source}</span><strong>{item.serialNo || item.source?.externalId || '—'} · {labelOf(item, lang)}</strong><code>{item.id}</code></div>
                  <LayerList layers={layers.above} lang={lang} />
                  <div><LayerList layers={layers.support} lang={lang} />{layers.within.length ? <><span className="db-within-label">Intégré</span><LayerList layers={layers.within} lang={lang} /></> : null}</div>
                  <LayerList layers={layers.below} lang={lang} />
                  <button type="button" className="db-identify-button" onClick={(event) => { event.stopPropagation(); setEditingIdentification(editingIdentification === `${source}:${item.id}` ? null : `${source}:${item.id}`); }}>Identifier les couches</button>
                  {editingIdentification === `${source}:${item.id}` ? <LayerIdentificationEditor component={item} source={source} lang={lang} onClose={() => setEditingIdentification(null)} onSaved={replaceComponent} /> : null}
                </div>;
              })}
            </div></td></tr> : null}
          </Fragment>;
        })}</tbody>
      </table></div>
    </section>)}
    </>}
  </section>;
}
