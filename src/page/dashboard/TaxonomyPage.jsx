import React, { useContext, useEffect, useMemo, useState } from 'react';
import LangContext from '../../context/LangContext';
import categoriesData from '../../data/categories.json';
import constructionSystemsData from '../../data/construction_systems.json';
import dataTranslations from '../../language/dataTranslations';
import loadComponents from '../../utils/loadComponents';
import { getComponentStructureTypeId } from '../../utils/componentStructureType';
import { apiJson } from './dashboardApi';
import './taxonomy.css';

const LANGUAGES = ['fr', 'de', 'en', 'it'];
const EMPTY_LABEL = () => Object.fromEntries(LANGUAGES.map((language) => [language, '']));
const clone = (value) => JSON.parse(JSON.stringify(value));

const TEXT = {
  fr: { title: 'Gestion des catégories', intro: 'Ajoutez, modifiez ou supprimez les catégories, leurs sous-catégories et les systèmes constructifs.', categories: 'Catégories', subcategories: 'Sous-catégories', systems: 'Systèmes constructifs', add: 'Ajouter', edit: 'Modifier', save: 'Enregistrer', cancel: 'Annuler', remove: 'Supprimer', identifier: 'Identifiant', labels: 'Libellés', category: 'Catégorie parente', orientation: 'Orientation', order: 'Ordre', vertical: 'Verticale', horizontal: 'Horizontale', usedBy: 'composant(s)', choose: 'Sélectionnez une entrée ou ajoutez-en une.', saved: 'Taxonomies enregistrées.', loading: 'Chargement…', required: 'Un identifiant et au moins un libellé sont obligatoires.', confirmDelete: 'Supprimer cette entrée ?', referencedDelete: 'Cette entrée est utilisée par {count} composant(s). Sa suppression laissera ces composants avec une référence inconnue. Continuer ?', immutableId: 'L’identifiant est verrouillé après la création afin de ne pas casser les références existantes.', apiUnavailable: 'API des taxonomies indisponible. Redémarrez le serveur de développement pour pouvoir enregistrer.' },
  de: { title: 'Kategorien verwalten', intro: 'Kategorien, Unterkategorien und Konstruktionssysteme hinzufügen, bearbeiten oder löschen.', categories: 'Kategorien', subcategories: 'Unterkategorien', systems: 'Konstruktionssysteme', add: 'Hinzufügen', edit: 'Bearbeiten', save: 'Speichern', cancel: 'Abbrechen', remove: 'Löschen', identifier: 'Kennung', labels: 'Bezeichnungen', category: 'Übergeordnete Kategorie', orientation: 'Ausrichtung', order: 'Reihenfolge', vertical: 'Vertikal', horizontal: 'Horizontal', usedBy: 'Bauteil(e)', choose: 'Eintrag auswählen oder hinzufügen.', saved: 'Taxonomien gespeichert.', loading: 'Laden…', required: 'Eine Kennung und mindestens eine Bezeichnung sind erforderlich.', confirmDelete: 'Diesen Eintrag löschen?', referencedDelete: 'Dieser Eintrag wird von {count} Bauteil(en) verwendet. Nach dem Löschen bleibt eine unbekannte Referenz bestehen. Fortfahren?', immutableId: 'Die Kennung ist nach dem Erstellen gesperrt, damit bestehende Referenzen nicht beschädigt werden.', apiUnavailable: 'Die Taxonomie-API ist nicht verfügbar. Starten Sie den Entwicklungsserver neu, um speichern zu können.' },
  en: { title: 'Manage categories', intro: 'Add, edit, or delete categories, their subcategories, and construction systems.', categories: 'Categories', subcategories: 'Subcategories', systems: 'Construction systems', add: 'Add', edit: 'Edit', save: 'Save', cancel: 'Cancel', remove: 'Delete', identifier: 'Identifier', labels: 'Labels', category: 'Parent category', orientation: 'Orientation', order: 'Order', vertical: 'Vertical', horizontal: 'Horizontal', usedBy: 'component(s)', choose: 'Select an entry or add one.', saved: 'Taxonomies saved.', loading: 'Loading…', required: 'An identifier and at least one label are required.', confirmDelete: 'Delete this entry?', referencedDelete: 'This entry is used by {count} component(s). Deleting it will leave those components with an unknown reference. Continue?', immutableId: 'The identifier is locked after creation to preserve existing references.', apiUnavailable: 'The taxonomy API is unavailable. Restart the development server to enable saving.' },
};

const normalizedId = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
const itemLabel = (item, lang) => item?.label?.[lang] || item?.label?.fr || item?.label?.de || item?.label?.en || item?.id || '—';
const withCategoryLabels = (categories) => (categories ?? []).map((category) => ({
  ...category,
  label: { ...(dataTranslations.categories?.[category.id] ?? {}), ...(category.label ?? {}) },
}));
const initialCategories = withCategoryLabels(categoriesData?.categories ?? []);
const formatApiError = (error, text) => String(error?.message ?? error).includes('404') ? text.apiUnavailable : String(error?.message ?? error);

export default function TaxonomyPage() {
  const { lang } = useContext(LangContext);
  const t = TEXT[lang] ?? TEXT.fr;
  const [categories, setCategories] = useState(initialCategories);
  const [systems, setSystems] = useState(constructionSystemsData?.systems ?? []);
  const [components, setComponents] = useState([]);
  const [kind, setKind] = useState('categories');
  const [parentCategoryId, setParentCategoryId] = useState(initialCategories[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([apiJson('/api/taxonomies'), loadComponents()]).then(([taxonomyResult, componentResult]) => {
      if (!active) return;
      if (taxonomyResult.status === 'fulfilled') {
        const loadedCategories = withCategoryLabels(taxonomyResult.value.categories);
        setCategories(loadedCategories);
        setSystems(taxonomyResult.value.systems ?? []);
        setParentCategoryId((current) => loadedCategories.some((category) => category.id === current) ? current : loadedCategories[0]?.id ?? '');
      } else {
        setMessage(`Erreur : ${formatApiError(taxonomyResult.reason, t)}`);
      }
      if (componentResult.status === 'fulfilled') setComponents(componentResult.value);
      setLoading(false);
    });
    return () => { active = false; };
  }, [t]);

  const currentCategory = categories.find((category) => category.id === parentCategoryId) ?? null;
  const sortedItems = useMemo(() => {
    const items = kind === 'categories' ? categories : kind === 'systems' ? systems : currentCategory?.subcategories ?? [];
    return [...items].sort((a, b) => itemLabel(a, lang).localeCompare(itemLabel(b, lang), lang, { sensitivity: 'base' }));
  }, [categories, currentCategory, kind, lang, systems]);

  const usageCount = (item) => {
    if (!item) return 0;
    if (kind === 'categories') return components.filter((component) => component.categoryId === item.id).length;
    if (kind === 'subcategories') return components.filter((component) => component.categoryId === parentCategoryId && component.subcategoryId === item.id).length;
    return components.filter((component) => getComponentStructureTypeId(component) === item.id).length;
  };

  const selectKind = (nextKind) => {
    setKind(nextKind);
    setSelectedId('');
    setDraft(null);
    setIsNew(false);
    setMessage('');
  };

  const selectItem = (item) => {
    setSelectedId(item.id);
    setDraft(clone({ ...item, label: { ...EMPTY_LABEL(), ...(item.label ?? {}) } }));
    setIsNew(false);
    setMessage('');
  };

  const addItem = () => {
    const next = { id: '', label: EMPTY_LABEL() };
    if (kind === 'categories') Object.assign(next, { type: 'vertical', order: categories.length, properties: ['thickness', 'weight', 'uValue', 'gwp'], subcategories: [], layerTypes: [], eccc: [] });
    setSelectedId('');
    setDraft(next);
    setIsNew(true);
    setMessage('');
  };

  const persist = async (nextCategories, nextSystems, successMessage = t.saved) => {
    const result = await apiJson('/api/taxonomies', { method: 'PUT', body: JSON.stringify({ categories: nextCategories, systems: nextSystems }) });
    setCategories(nextCategories);
    setSystems(nextSystems);
    setMessage(successMessage);
    return result;
  };

  const saveDraft = async () => {
    if (!draft) return;
    const id = normalizedId(draft.id);
    if (!id || !LANGUAGES.some((language) => String(draft.label?.[language] ?? '').trim())) {
      setMessage(`Erreur : ${t.required}`);
      return;
    }
    const item = { ...draft, id, label: { ...EMPTY_LABEL(), ...(draft.label ?? {}) } };
    let nextCategories = categories;
    let nextSystems = systems;
    if (kind === 'categories') {
      nextCategories = isNew ? [...categories, item] : categories.map((entry) => entry.id === selectedId ? item : entry);
    } else if (kind === 'subcategories') {
      nextCategories = categories.map((category) => category.id === parentCategoryId ? {
        ...category,
        subcategories: isNew ? [...(category.subcategories ?? []), item] : (category.subcategories ?? []).map((entry) => entry.id === selectedId ? item : entry),
      } : category);
    } else {
      nextSystems = isNew ? [...systems, item] : systems.map((entry) => entry.id === selectedId ? item : entry);
    }
    try {
      await persist(nextCategories, nextSystems);
      setSelectedId(id);
      setDraft(item);
      setIsNew(false);
    } catch (error) {
      setMessage(`Erreur : ${formatApiError(error, t)}`);
    }
  };

  const removeItem = async () => {
    if (!draft || isNew) return;
    const count = usageCount(draft);
    const prompt = count > 0 ? t.referencedDelete.replace('{count}', count) : t.confirmDelete;
    if (!window.confirm(prompt)) return;
    let nextCategories = categories;
    let nextSystems = systems;
    if (kind === 'categories') nextCategories = categories.filter((entry) => entry.id !== selectedId);
    if (kind === 'subcategories') nextCategories = categories.map((category) => category.id === parentCategoryId ? { ...category, subcategories: (category.subcategories ?? []).filter((entry) => entry.id !== selectedId) } : category);
    if (kind === 'systems') nextSystems = systems.filter((entry) => entry.id !== selectedId);
    try {
      await persist(nextCategories, nextSystems);
      setSelectedId('');
      setDraft(null);
      if (kind === 'categories' && parentCategoryId === selectedId) setParentCategoryId(nextCategories[0]?.id ?? '');
    } catch (error) {
      setMessage(`Erreur : ${formatApiError(error, t)}`);
    }
  };

  if (loading) return <section className="db-card"><p>{t.loading}</p></section>;

  return (
    <section className="db-card db-taxonomy">
      <div className="db-title-row"><div><h2>{t.title}</h2><p>{t.intro}</p></div></div>
      <div className="db-taxonomy-tabs">
        {['categories', 'subcategories', 'systems'].map((tab) => <button key={tab} className={kind === tab ? 'active' : ''} onClick={() => selectKind(tab)}>{t[tab]}</button>)}
      </div>
      {kind === 'subcategories' && (
        <label className="db-taxonomy-parent">{t.category}
          <select value={parentCategoryId} onChange={(event) => { setParentCategoryId(event.target.value); setDraft(null); setSelectedId(''); }}>
            {categories.map((category) => <option key={category.id} value={category.id}>{itemLabel(category, lang)}</option>)}
          </select>
        </label>
      )}
      <div className="db-taxonomy-layout">
        <div className="db-taxonomy-list">
          <button className="db-primary" onClick={addItem} disabled={kind === 'subcategories' && !parentCategoryId}>+ {t.add}</button>
          {sortedItems.map((item) => <button key={item.id} className={selectedId === item.id ? 'active' : ''} onClick={() => selectItem(item)}><strong>{itemLabel(item, lang)}</strong><small><code>{item.id}</code> · {usageCount(item)} {t.usedBy}</small></button>)}
        </div>
        <div className="db-taxonomy-editor">
          {!draft ? <p>{t.choose}</p> : <>
            <label>{t.identifier}<input value={draft.id} disabled={!isNew} onChange={(event) => setDraft((current) => ({ ...current, id: normalizedId(event.target.value) }))} /></label>
            {!isNew && <small className="db-taxonomy-hint">{t.immutableId}</small>}
            {kind === 'categories' && <div className="db-taxonomy-category-fields">
              <label>{t.orientation}<select value={draft.type ?? 'vertical'} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}><option value="vertical">{t.vertical}</option><option value="horizontal">{t.horizontal}</option></select></label>
              <label>{t.order}<input type="number" value={draft.order ?? 0} onChange={(event) => setDraft((current) => ({ ...current, order: Number(event.target.value) }))} /></label>
            </div>}
            <fieldset><legend>{t.labels}</legend>{LANGUAGES.map((language) => <label key={language}>{language.toUpperCase()}<input value={draft.label?.[language] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, label: { ...(current.label ?? {}), [language]: event.target.value } }))} /></label>)}</fieldset>
            <div className="db-taxonomy-actions"><button className="db-primary" onClick={saveDraft}>{t.save}</button><button onClick={() => { setDraft(null); setSelectedId(''); setIsNew(false); }}>{t.cancel}</button>{!isNew && <button className="db-danger" onClick={removeItem}>{t.remove}</button>}</div>
          </>}
          {message && <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p>}
        </div>
      </div>
    </section>
  );
}
