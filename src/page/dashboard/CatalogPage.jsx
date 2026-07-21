import React, { useContext, useEffect, useMemo, useState } from 'react';
import LangContext from '../../context/LangContext';
import { apiJson, fetchArray, normalize } from './dashboardApi';
import { dashboardFieldLabel, dashboardText, localizedName } from './dashboardI18n';

const PROPERTY_FIELDS = ['density_kg_m3', 'thermalConductivity_W_mK', 'specificHeat_Wh_kgK', 'specificHeat_J_kgK', 'waterVaporDiffusionResistanceCoefficientDry', 'waterVaporDiffusionResistanceCoefficientWet', 'fireClassification', 'reactionToFire'];
const MATERIAL_FIELDS = ['workingtitle', 'materialTypeId', 'materialcategoryId', 'functionId', 'kbobId', 'siaId', ...PROPERTY_FIELDS];
const PRODUCT_FIELDS = ['workingtitle', 'unit', 'productTypeId', 'productCategoryId', 'functionId', 'kbobId', 'siaId', ...PROPERTY_FIELDS];
const LANGUAGES = [['de', 'Deutsch'], ['en', 'English'], ['fr', 'Français']];
const emptyTranslations = () => ({ de: { name: '', description: '' }, en: { name: '', description: '' }, fr: { name: '', description: '' } });
const emptyMaterial = () => ({ workingtitle: '', materialTypeId: '', materialcategoryId: '', functionId: '', kbobId: '', siaId: '', density_kg_m3: null, thermalConductivity_W_mK: null, specificHeat_Wh_kgK: null, specificHeat_J_kgK: null, waterVaporDiffusionResistanceCoefficientDry: null, waterVaporDiffusionResistanceCoefficientWet: null, fireClassification: '', reactionToFire: '', translations: emptyTranslations(), source: { databaseId: 'tbz', externalId: null } });
const emptyProduct = () => ({ workingtitle: '', unit: 'm3', siaId: '', kbobId: '', productTypeId: '', productCategoryId: '', functionId: '', dimensions: { thickness_mm: null, width_mm: null, length_mm: null }, declaredProperties: {}, translations: emptyTranslations(), source: { databaseId: 'tbz', externalId: null }, composition: [], calculatedProperties: {}, metadata: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const withTranslationShape = (item) => ({ ...item, translations: { ...emptyTranslations(), ...(item.translations || {}) } });

export default function CatalogPage() {
  const { lang } = useContext(LangContext);
  const t = dashboardText(lang);
  const [kind, setKind] = useState('materials');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [mode, setMode] = useState('view');
  const [message, setMessage] = useState('');
  const sourceUrl = kind === 'materials' ? '/db/materials/tbz_materials.json' : '/db/products/tbz_products_composites.json';
  const fields = kind === 'materials' ? MATERIAL_FIELDS : PRODUCT_FIELDS;
  const isEditing = mode === 'edit' || mode === 'create';
  const noun = kind === 'materials' ? t.material : t.product;

  const load = async (selectedId) => {
    const loaded = await fetchArray(sourceUrl);
    setItems(loaded);
    if (selectedId) {
      const selected = loaded.find((item) => String(item.id) === String(selectedId));
      if (selected) setDraft(withTranslationShape(clone(selected)));
    }
  };

  useEffect(() => {
    setDraft(null);
    setMode('view');
    load().catch((error) => setMessage(`Erreur : ${error.message}`));
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const needle = normalize(query);
    return items.filter((item) => !needle || normalize(`${localizedName(item, lang)} ${item.workingtitle} ${item.id} ${item.kbobId}`).includes(needle));
  }, [items, lang, query]);

  const getValue = (field) => {
    if (!draft) return '';
    return kind === 'products' && PROPERTY_FIELDS.includes(field) ? draft.declaredProperties?.[field] ?? '' : draft[field] ?? '';
  };

  const setValue = (field, value) => {
    const numeric = field.includes('_kg_') || field.includes('_W_') || field.includes('Coefficient') || field.includes('_J_') || field.includes('_Wh_');
    const normalizedValue = numeric ? (value === '' ? null : Number(value)) : value;
    setDraft((current) => kind === 'products' && PROPERTY_FIELDS.includes(field)
      ? { ...current, declaredProperties: { ...(current.declaredProperties || {}), [field]: normalizedValue } }
      : { ...current, [field]: normalizedValue });
  };

  const setTranslation = (language, field, value) => setDraft((current) => ({
    ...current,
    translations: {
      ...(current.translations || {}),
      [language]: { ...(current.translations?.[language] || {}), [field]: value },
    },
  }));

  const choose = (item) => {
    setDraft(withTranslationShape(clone(item)));
    setMode('view');
    setMessage('');
  };

  const create = () => {
    setDraft(kind === 'materials' ? emptyMaterial() : emptyProduct());
    setMode('create');
    setMessage('');
  };

  const save = async () => {
    setMessage('Enregistrement…');
    try {
      const result = await apiJson(`/api/catalog/${kind}`, { method: 'POST', body: JSON.stringify({ item: draft }) });
      await load(result.item.id);
      setMode('view');
      setMessage(`${localizedName(result.item, lang) || result.item.workingtitle} — ${result.versionFile}`);
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    }
  };

  return <div className="db-catalog-layout">
    <section className="db-card">
      <div className="db-title-row"><div><h2>{t.materialsProducts}</h2><p>{t.languageFallback}</p></div><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="materials">{t.materials}</option><option value="products">{t.products}</option></select></div>
      <div className="db-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t.search} ${t.name.toLowerCase()}, ${t.id}, KBOB…`} /><button type="button" onClick={create}>{kind === 'materials' ? t.newMaterial : t.newProduct}</button></div>
      <div className="db-catalog-list">{visible.map((item) => <button type="button" key={item.id} className={draft?.id === item.id ? 'active' : ''} onClick={() => choose(item)}><strong>{localizedName(item, lang)}</strong>{localizedName(item, lang) !== item.workingtitle && <small>{t.workingtitle}: {item.workingtitle}</small>}<small><code>{item.id}</code> · KBOB {item.kbobId || '—'}</small></button>)}</div>
    </section>

    <section className="db-card db-editor">
      <div className="db-editor-title"><div><h3>{mode === 'create' ? (kind === 'materials' ? t.newMaterial : t.newProduct) : (draft ? localizedName(draft, lang) : `${t.select} ${noun}`)}</h3>{draft?.id && <code>{draft.id}</code>}</div><div>{draft && mode === 'view' && <button type="button" onClick={() => setMode('edit')}>{t.edit}</button>}{isEditing && mode !== 'create' && <button type="button" onClick={() => choose(items.find((item) => item.id === draft.id))}>{t.cancel}</button>}</div></div>
      {draft ? <>
        <label>{t.id}<input value={draft.id || 'Généré automatiquement'} disabled /></label>
        {fields.map((field) => <label key={field}>{dashboardFieldLabel(field, lang)}<small>{field}</small><input disabled={!isEditing} type={typeof getValue(field) === 'number' ? 'number' : 'text'} step="any" value={getValue(field)} onChange={(event) => setValue(field, event.target.value)} /></label>)}
        <fieldset className="db-translations"><legend>{t.translations}</legend>{LANGUAGES.map(([language, label]) => <div className="db-translation" key={language}><h4>{label}</h4><label>{t.name}<input disabled={!isEditing} value={draft.translations?.[language]?.name || ''} onChange={(event) => setTranslation(language, 'name', event.target.value)} /></label><label>Description<textarea disabled={!isEditing} value={draft.translations?.[language]?.description || ''} onChange={(event) => setTranslation(language, 'description', event.target.value)} /></label></div>)}</fieldset>
        {isEditing && <button className="db-primary" type="button" onClick={save}>{mode === 'create' ? (kind === 'materials' ? t.saveNewMaterial : t.saveNewProduct) : t.saveChanges}</button>}
      </> : <p>{t.select} {noun}.</p>}
      {message && <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p>}
    </section>
  </div>;
}
