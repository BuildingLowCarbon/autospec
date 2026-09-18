import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import LangContext from '../../context/LangContext';
import categoriesData from '../../data/categories.json';
import constructionSystemsData from '../../data/construction_systems.json';
import dataTranslations from '../../language/dataTranslations';
import loadComponents from '../../utils/loadComponents';
import { getComponentStructureTypeId } from '../../utils/componentStructureType';
import { isSupportStructureLayer } from '../../utils/supportStructure';
import { localizedName } from './dashboardI18n';
import './componentCompleteness.css';

const LOAD_BEARING_CATEGORIES = new Set([
  'foundation', 'floor_assembly', 'outer_wall', 'inner_wall',
  'flat_roof_shed_roof', 'steep_roof', 'underground_roof', 'balcony',
]);

const TEXT = {
  fr: {
    title: 'Contrôle des composants incomplets',
    intro: 'Cochez les caractéristiques à contrôler. Un composant apparaît s’il ne respecte pas au moins un des contrôles sélectionnés.',
    category: 'Catégorie', subcategory: 'Sous-catégorie', systemType: 'Système constructif', layers: 'Couches', layerReference: 'Matériau / produit des couches', eccc: 'eCCC des couches', support: 'Structure porteuse',
    all: 'Tout sélectionner', characteristics: 'Caractéristiques', search: 'Rechercher un composant…', loading: 'Chargement…', none: 'Aucun composant incomplet pour les contrôles sélectionnés.', noCheck: 'Sélectionnez au moins une caractéristique.', results: 'composants incomplets', open: 'Ouvrir dans Custom', missing: 'Manque', unknownCategory: 'Catégorie inconnue', source: 'Source', loadError: 'Impossible de charger les composants.',
  },
  de: {
    title: 'Prüfung unvollständiger Bauteile', intro: 'Wählen Sie die zu prüfenden Merkmale. Ein Bauteil erscheint, sobald mindestens eine gewählte Prüfung fehlschlägt.',
    category: 'Kategorie', subcategory: 'Unterkategorie', systemType: 'Konstruktionssystem', layers: 'Schichten', layerReference: 'Material / Produkt der Schichten', eccc: 'eCCC der Schichten', support: 'Tragstruktur',
    all: 'Alle auswählen', characteristics: 'Merkmale', search: 'Bauteil suchen…', loading: 'Laden…', none: 'Keine unvollständigen Bauteile für die gewählten Prüfungen.', noCheck: 'Mindestens ein Merkmal auswählen.', results: 'unvollständige Bauteile', open: 'In Custom öffnen', missing: 'Fehlt', unknownCategory: 'Unbekannte Kategorie', source: 'Quelle', loadError: 'Bauteile konnten nicht geladen werden.',
  },
  en: {
    title: 'Incomplete component check', intro: 'Select the characteristics to check. A component is shown when it fails at least one selected check.',
    category: 'Category', subcategory: 'Subcategory', systemType: 'Construction system', layers: 'Layers', layerReference: 'Layer material / product', eccc: 'Layer eCCC', support: 'Load-bearing structure',
    all: 'Select all', characteristics: 'Characteristics', search: 'Search components…', loading: 'Loading…', none: 'No incomplete components for the selected checks.', noCheck: 'Select at least one characteristic.', results: 'incomplete components', open: 'Open in Custom', missing: 'Missing', unknownCategory: 'Unknown category', source: 'Source', loadError: 'Unable to load components.',
  },
};

const CHECK_KEYS = ['category', 'subcategory', 'systemType', 'layers', 'layerReference', 'eccc', 'support'];
const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const getIssues = (component, selected, categoryById, systemIds) => {
  const issues = [];
  const layers = Array.isArray(component?.structure?.layers) ? component.structure.layers : [];
  const category = categoryById.get(component?.categoryId);
  if (selected.category && !category) issues.push('category');
  if (selected.subcategory && category?.subcategories?.length && !hasText(component?.subcategoryId)) issues.push('subcategory');
  if (selected.systemType && (!hasText(getComponentStructureTypeId(component)) || !systemIds.has(getComponentStructureTypeId(component)))) issues.push('systemType');
  if (selected.layers && layers.length === 0) issues.push('layers');
  if (selected.layerReference && layers.length > 0 && layers.some((layer) => !hasText(layer?.productId))) issues.push('layerReference');
  if (selected.eccc && layers.length > 0 && layers.some((layer) => !hasText(layer?.ecccId))) issues.push('eccc');
  if (selected.support && LOAD_BEARING_CATEGORIES.has(component?.categoryId) && !layers.some(isSupportStructureLayer)) issues.push('support');
  return issues;
};

export default function ComponentCompletenessPage() {
  const { lang } = useContext(LangContext);
  const t = TEXT[lang] ?? TEXT.fr;
  const [components, setComponents] = useState([]);
  const [selected, setSelected] = useState(() => Object.fromEntries(CHECK_KEYS.map((key) => [key, true])));
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const categoryById = useMemo(() => new Map((categoriesData?.categories ?? []).map((category) => [category.id, category])), []);
  const systemIds = useMemo(() => new Set((constructionSystemsData?.systems ?? []).map((system) => system.id)), []);

  useEffect(() => {
    let active = true;
    loadComponents()
      .then((items) => { if (active) setComponents(items); })
      .catch(() => { if (active) setError(t.loadError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t.loadError]);

  const allSelected = CHECK_KEYS.every((key) => selected[key]);
  const hasSelectedCheck = CHECK_KEYS.some((key) => selected[key]);
  const incomplete = useMemo(() => {
    if (!hasSelectedCheck) return [];
    const needle = query.trim().toLocaleLowerCase(lang);
    return components
      .map((component) => ({ component, issues: getIssues(component, selected, categoryById, systemIds) }))
      .filter(({ component, issues }) => issues.length > 0 && (!needle || `${localizedName(component, lang)} ${component.serialNo ?? ''} ${component.id ?? ''}`.toLocaleLowerCase(lang).includes(needle)))
      .sort((a, b) => localizedName(a.component, lang).localeCompare(localizedName(b.component, lang), lang, { sensitivity: 'base' }));
  }, [categoryById, components, hasSelectedCheck, lang, query, selected, systemIds]);

  const categoryLabel = (categoryId) => categoryById.get(categoryId)?.label?.[lang]
    ?? categoryById.get(categoryId)?.label?.fr
    ?? dataTranslations.categories?.[categoryId]?.[lang]
    ?? dataTranslations.categories?.[categoryId]?.fr
    ?? categoryId
    ?? t.unknownCategory;

  return (
    <section className="db-card db-completeness">
      <div className="db-title-row">
        <div><h2>{t.title}</h2><p>{t.intro}</p></div>
        <strong>{incomplete.length} {t.results}</strong>
      </div>
      <fieldset className="db-check-grid">
        <legend>{t.characteristics}</legend>
        <label className="db-check-all">
          <input type="checkbox" checked={allSelected} onChange={(event) => setSelected(Object.fromEntries(CHECK_KEYS.map((key) => [key, event.target.checked])))} />
          <strong>{t.all}</strong>
        </label>
        {CHECK_KEYS.map((key) => (
          <label key={key}>
            <input type="checkbox" checked={selected[key]} onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.checked }))} />
            {t[key]}
          </label>
        ))}
      </fieldset>
      <input className="db-completeness-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
      {loading && <p>{t.loading}</p>}
      {error && <p className="db-error">{error}</p>}
      {!loading && !error && !hasSelectedCheck && <p>{t.noCheck}</p>}
      {!loading && !error && hasSelectedCheck && incomplete.length === 0 && <p>{t.none}</p>}
      <div className="db-incomplete-list">
        {incomplete.map(({ component, issues }) => (
          <Link key={component.id} to={`/custom/${component.id}`} className="db-incomplete-component">
            <span>
              <strong>{localizedName(component, lang)}</strong>
              <small>{component.serialNo ? `${component.serialNo} · ` : ''}{categoryLabel(component.categoryId)}</small>
              <small>{t.source}: {component.__sourceFile ?? component.source?.name ?? '—'}</small>
            </span>
            <span className="db-missing-tags">
              {issues.map((issue) => <em key={issue}>{t.missing}: {t[issue]}</em>)}
            </span>
            <b>{t.open} →</b>
          </Link>
        ))}
      </div>
    </section>
  );
}
