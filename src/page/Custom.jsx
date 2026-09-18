import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import { ViewSVG, DEFAULT_PX_PER_MM_X } from '../components/Graphic';
import LangContext from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import translations from '../language/translations';
import dataTranslations from '../language/dataTranslations';
import categoriesData from '../data/categories.json';
import kbobData from '../data/KBOB_mat_db.json';
import loadComponents, { invalidateComponentsCache } from '../utils/loadComponents';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import { calculateComponentProperties, calculateComponentThermalDetails } from '../utils/componentPropriety';
import { applyCustomFireTimingToComponent } from '../utils/customFireTiming';
import { DEFAULT_SUBCATEGORY_BY_CATEGORY, getSubcategoryLabel } from '../utils/componentTaxonomy';
import { getAllComponentStructureTypeOptions } from '../utils/componentStructureType';
import {
  createCustomComponentId,
  mergeById,
  readLocalCustomComponents,
  writeFileCustomComponent,
  writeFileSourceComponent,
  withCustomSource,
  writeLocalCustomComponents,
} from '../utils/customComponentsStore';

const DEFAULT_LAYER = (order = 0) => ({
  order,
  productId: '',
  structure: 'on-lying',
  thickness_mm: 0,
  width_mm: null,
  spacing_mm: null,
  fiberDirection: null,
  reactionToFire: null,
  time_burning_min: null,
  time_fire_start_min: null,
  isSupportStructure: false,
  protectsSupportSidesFromFire: false,
  kbobId: null,
  ecccId: '',
  ecccDescription: '',
  translations: {
    fr: { description: '' },
    de: { description: '' },
    it: { description: '' },
    en: { description: '' },
  },
  weight_kg_m2: null,
  gwp_kgco2e_m2: null,
  thermalResistance_m2K_W: null,
});

const newComponent = () => ({
  __isNew: true,
  id: createCustomComponentId(),
  serialNo: '',
  categoryId: '',
  subcategoryId: '',
  translations: {
    fr: { name: '', description: '' },
    de: { name: '', description: '' },
    it: { name: '', description: '' },
    en: { name: '', description: '' },
  },
  structure: {
    systemTypeId: null,
    layers: [DEFAULT_LAYER(0)],
  },
});

const getText = (value, fallback = '') => (value === null || value === undefined ? fallback : String(value));

const parseNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const safeClone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const formatNumber = (value, decimals) => {
  const num = Number(value);
  if (Number.isNaN(num)) return 'N/A';
  return num.toFixed(decimals);
};

const formatCapacityCell = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return 'N/A';
  return `${formatNumber(cell.value, 2)} ${cell.unit ?? ''}`.trim();
};

const buttonStyle = {
  border: '1px solid #777',
  background: '#f7f7f7',
  borderRadius: '4px',
  padding: '7px 12px',
  color: '#222',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1.2,
};

const smallButtonStyle = {
  ...buttonStyle,
  padding: '5px 8px',
};

const ensureLangTranslations = (layer) => ({
  ...(layer ?? {}),
  translations: {
    fr: { description: layer?.translations?.fr?.description ?? '' },
    de: { description: layer?.translations?.de?.description ?? '' },
    it: { description: layer?.translations?.it?.description ?? '' },
    en: { description: layer?.translations?.en?.description ?? '' },
  },
});

const cloneComponent = (component) => {
  const clone = safeClone(component);
  clone.structure = clone.structure ?? {};
  clone.structure.layers = (clone.structure.layers ?? []).map((layer) => ensureLangTranslations(layer));
  return clone;
};

function Custom() {
  const { id } = useParams();
  const isCreating = id === 'new';
  const navigate = useNavigate();
  const { lang, setLang } = useContext(LangContext);
  const { user, can, request } = useAuth();
  const t = translations[lang];

  const [component, setComponent] = useState(null);
  const [loadingComponent, setLoadingComponent] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('');
  const [focusedEcccIndex, setFocusedEcccIndex] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [visibility, setVisibility] = useState('private');
  const [organizationId, setOrganizationId] = useState('');
  const canModifyComponent = useMemo(() => {
    if (!component) return false;
    if (component.__isNew) return true;
    if (!component.__contentId) return can('dashboard');
    if (user?.role === 'admin' || component.__ownerId === user?.id) return true;
    return Boolean(component.__organizationId && organizations.some((organization) => (
      organization.id === component.__organizationId && organization.membershipRole === 'organization_admin'
    )));
  }, [can, component, organizations, user]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoadingComponent(true);
      setLoadError('');
      try {
        const [allComponents, materialsJson, productsJson, organizationPayload] = await Promise.all([
          loadComponents({ forceRefresh: true }),
          loadMaterials({ forceRefresh: true }),
          loadProducts(),
          request('/api/organizations').catch(() => ({ organizations: [] })),
        ]);
        if (!active) return;
        let found = isCreating ? newComponent() : allComponents.find((item) => String(item.id) === String(id));
        if (!found && !isCreating) {
          const directPayload = await request(`/api/content/components/item/${encodeURIComponent(id)}`)
            .catch((error) => (error.status === 404 ? null : Promise.reject(error)));
          found = directPayload?.item || null;
        }
        setComponent(found ? cloneComponent(found) : null);
        setVisibility(found?.__visibility || 'private');
        setOrganizationId(found?.__organizationId || '');
        setOrganizations(organizationPayload.organizations || []);
        setMaterials(materialsJson);
        setProducts(productsJson);
        if (!found) setLoadError('Composant introuvable ou non accessible avec ce compte.');
      } catch (error) {
        if (active) setLoadError(`Chargement impossible : ${error.message}`);
      } finally {
        if (active) setLoadingComponent(false);
      }
    };
    fetchData();
    return () => { active = false; };
  }, [id, isCreating, request]);

  const allComponentOptions = useMemo(() => {
    const productOptions = products.map((item) => ({
      id: String(item.id),
      label: item.workingtitle || item.translations?.[lang]?.name || item.id,
      type: 'product',
    }));
    const materialOptions = materials.map((item) => ({
      id: String(item.id),
      label: item.workingtitle || item.translations?.[lang]?.name || item.id,
      type: 'material',
    }));
    return [...productOptions, ...materialOptions];
  }, [materials, products, lang]);

  const category = useMemo(() => {
    const categoryId = component?.categoryId;
    return categoriesData?.categories?.find((item) => item.id === categoryId) ?? null;
  }, [component?.categoryId]);

  const categoryOptions = useMemo(
    () => [...(categoriesData?.categories ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [],
  );
  const subcategoryOptions = category?.subcategories ?? [];
  const systemTypeOptions = useMemo(() => getAllComponentStructureTypeOptions(lang), [lang]);
  const categoryLabel = (option) =>
    option?.label?.[lang] ??
    option?.label?.fr ??
    dataTranslations.categories?.[option.id]?.[lang] ??
    dataTranslations.categories?.[option.id]?.fr ??
    option.id;

  const handleCategoryChange = (categoryId) => {
    const nextCategory = categoryOptions.find((item) => item.id === categoryId);
    const defaultSubcategoryId = DEFAULT_SUBCATEGORY_BY_CATEGORY[categoryId] ?? '';
    setComponent((prev) => prev ? ({
      ...prev,
      categoryId,
      subcategoryId: nextCategory?.subcategories?.some((item) => item.id === defaultSubcategoryId)
        ? defaultSubcategoryId
        : '',
    }) : prev);
  };

  const handleSystemTypeChange = (systemTypeId) => {
    setComponent((prev) => prev ? ({
      ...prev,
      structure: {
        ...(prev.structure ?? {}),
        systemTypeId: systemTypeId || null,
      },
    }) : prev);
  };

  const ecccOptions = category?.eccc ?? [];
  const databaseSummary = useMemo(() => {
    if (!component) return null;
    return {
      thickness_mm: parseNullableNumber(component.thickness_mm),
      weight_kg_m2: parseNullableNumber(component.weight_kg_m2),
      gwp_kgco2e_m2: parseNullableNumber(component.gwp_kgco2e_m2),
      uValue_W_m2K: parseNullableNumber(component.uValue_W_m2K),
    };
  }, [component]);
  const componentWithProperties = useMemo(
    () =>
      component
        ? calculateComponentProperties(component, materials, products, kbobData, {
            categories: categoriesData?.categories ?? [],
            componentServiceLifeYears: 60,
          })
        : null,
    [component, materials, products],
  );
  const thermalDetails = useMemo(
    () => calculateComponentThermalDetails(component, materials, products),
    [component, materials, products],
  );
  const summary = useMemo(() => {
    if (!componentWithProperties) return null;
    return {
      thickness_mm: componentWithProperties.thickness_mm,
      weight_kg_m2: componentWithProperties.weight_kg_m2,
      gwp_kgco2e_m2: componentWithProperties.gwp_kgco2e_m2,
      uValue_W_m2K: componentWithProperties.uValue_W_m2K,
    };
  }, [componentWithProperties]);
  const componentWithFireTiming = useMemo(
    () => (componentWithProperties ? applyCustomFireTimingToComponent(componentWithProperties, materials, products) : null),
    [componentWithProperties, materials, products],
  );

  const handleComponentFieldChange = (field, value) => {
    setComponent((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  };

  const handleFireResistanceFieldChange = (field, value) => {
    setComponent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fire_resistance: {
          ...(prev.fire_resistance ?? {}),
          [field]: value,
        },
      };
    });
  };

  const handleTranslationChange = (locale, field, value) => {
    setComponent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        translations: {
          ...(prev.translations ?? {}),
          [locale]: {
            ...(prev.translations?.[locale] ?? {}),
            [field]: value,
          },
        },
      };
    });
  };

  const handleLayerChange = (index, updater) => {
    setComponent((prev) => {
      if (!prev) return prev;
      const layers = [...(prev.structure?.layers ?? [])];
      layers[index] = updater(ensureLangTranslations(layers[index]));
      return {
        ...prev,
        structure: {
          ...(prev.structure ?? {}),
          layers: layers.map((layer, order) => ({ ...layer, order })),
        },
      };
    });
  };

  const handleLayerNumberChange = (index, key, value) => {
    handleLayerChange(index, (layer) => ({ ...layer, [key]: parseNullableNumber(value) }));
  };

  const handleLayerTextChange = (index, key, value) => {
    handleLayerChange(index, (layer) => ({ ...layer, [key]: getText(value, '') }));
  };

  const handleSupportStructureChange = (index, checked) => {
    setComponent((prev) => {
      if (!prev) return prev;
      const layers = (prev.structure?.layers ?? []).map((layer, layerIndex) => ({
        ...layer,
        isSupportStructure: checked ? layerIndex === index : (
          layerIndex === index ? false : layer?.isSupportStructure === true
        ),
      }));
      return {
        ...prev,
        structure: { ...(prev.structure ?? {}), layers },
      };
    });
  };

  const handleEcccChange = (index, ecccId) => {
    const selected = ecccOptions.find((item) => item.ecccId === ecccId) ?? null;
    handleLayerChange(index, (layer) => ({
      ...layer,
      ecccId: selected?.ecccId ?? '',
      ecccDescription: selected?.name ?? '',
    }));
  };

  const addLayer = () => {
    setComponent((prev) => {
      if (!prev) return prev;
      const layers = [...(prev.structure?.layers ?? []), DEFAULT_LAYER((prev.structure?.layers ?? []).length)];
      return {
        ...prev,
        structure: {
          ...(prev.structure ?? {}),
          layers,
        },
      };
    });
  };

  const removeLayer = (index) => {
    setComponent((prev) => {
      if (!prev) return prev;
      const layers = (prev.structure?.layers ?? []).filter((_, layerIndex) => layerIndex !== index);
      return {
        ...prev,
        structure: {
          ...(prev.structure ?? {}),
          layers: layers.map((layer, order) => ({ ...layer, order })),
        },
      };
    });
  };

  const moveLayer = (index, direction) => {
    setComponent((prev) => {
      if (!prev) return prev;
      const layers = [...(prev.structure?.layers ?? [])];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= layers.length) return prev;
      [layers[index], layers[nextIndex]] = [layers[nextIndex], layers[index]];
      return {
        ...prev,
        structure: {
          ...(prev.structure ?? {}),
          layers: layers.map((layer, order) => ({ ...layer, order })),
        },
      };
    });
  };

  const persistComponent = async (payload) => {
    const existing = readLocalCustomComponents();
    const customPayload = withCustomSource(payload);
    const merged = mergeById([...existing, customPayload]);
    writeLocalCustomComponents(merged);
    try {
      await writeFileCustomComponent(customPayload);
    } finally {
      invalidateComponentsCache();
    }
    return customPayload;
  };

  const persistUserComponent = async (payload, contentId = null) => {
    if (visibility === 'organization' && !organizationId) throw new Error('Sélectionnez une organisation.');
    const response = await request(
      contentId ? `/api/content/components/${encodeURIComponent(contentId)}` : '/api/content/components',
      {
        method: contentId ? 'PATCH' : 'POST',
        body: JSON.stringify({ item: payload, visibility, organizationId: visibility === 'organization' ? organizationId : null }),
      },
    );
    invalidateComponentsCache();
    return response.item;
  };

  const saveCurrent = async () => {
    if (!componentWithFireTiming) return;
    setStatus('Enregistrement...');
    const payload = {
      ...componentWithFireTiming,
      ...summary,
    };
    const sourceFile = component.__sourceFile ?? 'components_custom.json';
    try {
      if (component.__isNew) {
        const saved = await persistUserComponent(payload);
        setComponent(cloneComponent(saved));
        navigate(`/custom/${saved.id}`, { replace: true });
        setStatus('Nouveau composant utilisateur créé dans MongoDB.');
      } else if (component.__contentId) {
        const saved = await persistUserComponent(payload, component.__contentId);
        setComponent(cloneComponent(saved));
        setStatus('Composant utilisateur enregistré dans MongoDB.');
      } else if (sourceFile === 'components_custom.json') {
        const saved = await persistComponent(payload);
        setComponent(cloneComponent(saved));
        setStatus('Modifications enregistrees dans components_custom.json.');
      } else {
        await writeFileSourceComponent(sourceFile, payload);
        invalidateComponentsCache();
        setComponent(cloneComponent({ ...payload, __sourceFile: sourceFile }));
        setStatus(`Modifications enregistrees dans ${sourceFile}.`);
      }
    } catch (error) {
      setStatus(`Sauvegarde impossible. ${error.message}`);
    }
  };

  const createNew = async () => {
    if (!component || !componentWithFireTiming) return;
    setStatus('Enregistrement...');
    const newId = createCustomComponentId();
    const payload = {
      ...componentWithFireTiming,
      ...summary,
      id: newId,
      parent: component.id ?? null,
    };
    try {
      const saved = await persistUserComponent(payload);
      setComponent(cloneComponent(saved));
      navigate(`/custom/${newId}`, { replace: true });
      setStatus(`Nouveau composant utilisateur créé dans MongoDB (${newId}).`);
    } catch (error) {
      setStatus(`Sauvegarde MongoDB impossible. ${error.message}`);
    }
  };

  if (loadingComponent) {
    return (
      <>
        <Header lang={lang} setLang={setLang} />
        <div style={{ padding: '20px' }}>Chargement...</div>
      </>
    );
  }

  if (!component) {
    return (
      <>
        <Header lang={lang} setLang={setLang} />
        <div style={{ padding: '20px' }}>
          <p style={{ color: '#9b2c2c', fontWeight: 700 }}>{loadError || 'Composant introuvable.'}</p>
          <Link to="/organizations">Retour aux organisations</Link>
        </div>
      </>
    );
  }

  const layers = componentWithFireTiming?.structure?.layers ?? [];
  const woodBeamSpanResult = componentWithFireTiming?.fire_resistance?.wood_beam_span ?? null;
  const woodStudCompressionResult = componentWithFireTiming?.fire_resistance?.wood_stud_compression ?? null;
  const woodCapacityTable = componentWithFireTiming?.fire_resistance?.wood_capacity_table ?? null;
  const vibrationLimitFrequencyInput = component?.fire_resistance?.vibration_f_min_Hz ?? 8;
  const getEcccName = (layer) => {
    const selected = ecccOptions.find((item) => item.ecccId === layer?.ecccId);
    return selected?.name ?? layer?.ecccDescription ?? '';
  };
  const getLayerName = (layer, index) =>
    layer?.translations?.[lang]?.description ||
    allComponentOptions.find((option) => option.id === String(layer?.productId ?? ''))?.label ||
    layer?.productId ||
    `Couche ${index + 1}`;
  const pxPerMmY = 1;
  const pxPerMmX = DEFAULT_PX_PER_MM_X;
  const title = component?.translations?.[lang]?.name || component?.serialNo || (isCreating ? '' : component?.id) || '';
  const description = component?.translations?.[lang]?.description || '';

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <div style={{ padding: '20px' }}>
        <h2>{isCreating ? 'Créer un composant' : `Custom ${t.component_details}`}</h2>
        {!isCreating && <p>
          <Link to={`/element/${component.id}`} style={buttonStyle}>Retour a la page element</Link>
        </p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          <label>
            ID
            <input type="text" value={component.id ?? ''} disabled style={{ width: '100%' }} />
          </label>
          <label>
            {t.category}
            <select
              value={component.categoryId ?? ''}
              onChange={(event) => handleCategoryChange(event.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">—</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>{categoryLabel(option)}</option>
              ))}
            </select>
          </label>
          <label>
            Sous-catégorie
            <select
              value={component.subcategoryId ?? ''}
              onChange={(event) => handleComponentFieldChange('subcategoryId', event.target.value)}
              disabled={!subcategoryOptions.length}
              style={{ width: '100%' }}
            >
              <option value="">{subcategoryOptions.length ? 'À définir' : 'Aucune'}</option>
              {subcategoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {getSubcategoryLabel(category, option.id, lang)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Système constructif
            <select
              value={component.structure?.systemTypeId ?? ''}
              onChange={(event) => handleSystemTypeChange(event.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">À définir</option>
              {systemTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Nom ({lang})
            <input
              type="text"
              value={title}
              onChange={(event) => handleTranslationChange(lang, 'name', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            {t.description} ({lang})
            <input
              type="text"
              value={description}
              onChange={(event) => handleTranslationChange(lang, 'description', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            {t.serial_no}
            <input
              type="text"
              value={component.serialNo ?? ''}
              onChange={(event) => handleComponentFieldChange('serialNo', event.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Source ref
            <input
              type="text"
              value={component?.source?.externalId ?? ''}
              onChange={(event) =>
                setComponent((prev) => ({
                  ...prev,
                  source: {
                    ...(prev?.source ?? {}),
                    externalId: event.target.value,
                  },
                }))
              }
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
          <label>Visibilité
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)} style={{ display: 'block', minWidth: '170px', padding: '6px' }}>
              <option value="private">Privé</option>
              <option value="organization" disabled={!organizations.length}>Organisation</option>
              <option value="public">Public</option>
            </select>
          </label>
          {visibility === 'organization' && <label>Organisation
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} style={{ display: 'block', minWidth: '200px', padding: '6px' }}>
              <option value="">Sélectionner…</option>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>}
        </div>

        <div style={{ marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {canModifyComponent && <button type="button" onClick={saveCurrent} style={buttonStyle}>{isCreating ? 'Créer le composant' : 'Enregistrer'}</button>}
          {!isCreating && <button type="button" onClick={createNew} style={buttonStyle}>Dupliquer composant</button>}
          {status ? <span>{status}</span> : null}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div>
            <strong>Valeurs base:</strong>{' '}
            {t.thickness}: {databaseSummary?.thickness_mm === null ? 'N/A' : `${formatNumber(databaseSummary?.thickness_mm, 0)} mm`} |{' '}
            {t.surface_mass}: {databaseSummary?.weight_kg_m2 === null ? 'N/A' : `${formatNumber(databaseSummary?.weight_kg_m2, 1)} kg/m2`} |{' '}
            {t.gwp}: {databaseSummary?.gwp_kgco2e_m2 === null ? 'N/A' : `${formatNumber(databaseSummary?.gwp_kgco2e_m2, 1)} kgCO2e/m2`} |{' '}
            {t.uValue}: {databaseSummary?.uValue_W_m2K === null ? 'N/A' : `${formatNumber(databaseSummary?.uValue_W_m2K, 3)} W/m2K`}
          </div>
          <div>
            <strong>Valeurs recalculees:</strong>{' '}
            {t.thickness}: {formatNumber(summary?.thickness_mm ?? 0, 0)} mm |{' '}
            {t.surface_mass}: {formatNumber(summary?.weight_kg_m2 ?? 0, 1)} kg/m2 |{' '}
            {t.gwp}: {formatNumber(summary?.gwp_kgco2e_m2 ?? 0, 1)} kgCO2e/m2 |{' '}
            {t.uValue}: {summary?.uValue_W_m2K === null ? 'N/A' : `${formatNumber(summary?.uValue_W_m2K, 3)} W/m2K`}
          </div>
        </div>

        <h2>{t.structure}</h2>
        <div style={{ marginBottom: '10px' }}>
          <button type="button" onClick={addLayer} style={buttonStyle}>Ajouter une ligne</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
            <thead>
              <tr style={{ backgroundColor: '#eee' }}>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>ecccId</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.layer_type}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.layer}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.name}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.thickness}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.width}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.spacing}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.layer}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.fiberDirection}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.surface_mass}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>Resistance thermique</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>GWP</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>Duree de vie</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.reactionToFire}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.time_burning_min}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.time_fire_start_min}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>Structure porteuse</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>Protection latérale feu</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer, index) => (
                <tr
                  key={`${layer.order}-${index}`}
                  style={layer?.isSupportStructure ? {
                    fontWeight: 700,
                    outline: '3px solid #222',
                    outlineOffset: '-3px',
                  } : undefined}
                >
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <select
                      value={layer?.ecccId ?? ''}
                      onChange={(event) => handleEcccChange(index, event.target.value)}
                      onFocus={() => setFocusedEcccIndex(index)}
                      onBlur={() => setFocusedEcccIndex(null)}
                      style={{ width: '150px' }}
                    >
                      <option value="">--</option>
                      {ecccOptions.map((option) => (
                        <option key={option.ecccId} value={option.ecccId}>
                          {focusedEcccIndex === index
                            ? `${option.ecccId} ${option.name}`
                            : option.ecccId}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <span style={{ display: 'inline-block', minWidth: '240px' }}>
                      {getEcccName(layer) || 'N/A'}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="text"
                      value={layer?.translations?.[lang]?.description ?? ''}
                      onChange={(event) =>
                        handleLayerChange(index, (current) => ({
                          ...current,
                          translations: {
                            ...(current.translations ?? {}),
                            [lang]: {
                              ...(current.translations?.[lang] ?? {}),
                              description: event.target.value,
                            },
                          },
                        }))
                      }
                      style={{ width: '180px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <select
                      value={layer?.productId ?? ''}
                      onChange={(event) => handleLayerTextChange(index, 'productId', event.target.value)}
                      style={{ width: '220px' }}
                    >
                      <option value="">--</option>
                      {allComponentOptions.map((option) => (
                        <option key={`${option.type}-${option.id}`} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="number"
                      value={layer?.thickness_mm ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'thickness_mm', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="number"
                      value={layer?.width_mm ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'width_mm', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="number"
                      value={layer?.spacing_mm ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'spacing_mm', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <select
                      value={layer?.structure ?? ''}
                      onChange={(event) => handleLayerTextChange(index, 'structure', event.target.value)}
                      style={{ width: '120px' }}
                    >
                      <option value="">--</option>
                      <option value="on-lying">on-lying</option>
                      <option value="in-lying">in-lying</option>
                      <option value="overlaying centered">overlaying centered</option>
                    </select>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <select
                      value={layer?.fiberDirection ?? ''}
                      onChange={(event) => handleLayerTextChange(index, 'fiberDirection', event.target.value)}
                      style={{ width: '120px' }}
                    >
                      <option value ="" >--</option>
                      <option value="quer">quer</option>
                      <option value="lengthwise">lengthwise</option>
                    </select>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {layer?.weight_kg_m2 === null ? 'N/A' : formatNumber(layer?.weight_kg_m2, 2)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {layer?.thermalResistance_m2K_W === null ? 'N/A' : formatNumber(layer?.thermalResistance_m2K_W, 3)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {layer?.gwp_kgco2e_m2 === null ? 'N/A' : formatNumber(layer?.gwp_kgco2e_m2, 2)}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {layer?.serviceLife_years === null || layer?.serviceLife_years === undefined
                      ? 'N/A'
                      : `${formatNumber(layer.serviceLife_years, 0)} ans`}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="text"
                      value={layer?.reactionToFire ?? ''}
                      onChange={(event) => handleLayerTextChange(index, 'reactionToFire', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="number"
                      value={layer?.time_burning_min ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'time_burning_min', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="number"
                      value={layer?.time_fire_start_min ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'time_fire_start_min', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={layer?.isSupportStructure === true}
                      onChange={(event) => handleSupportStructureChange(index, event.target.checked)}
                      aria-label={`Définir la couche ${index + 1} comme structure porteuse`}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={layer?.protectsSupportSidesFromFire === true}
                      disabled={layer?.structure !== 'in-lying'}
                      onChange={(event) => handleLayerChange(index, (current) => ({
                        ...current,
                        protectsSupportSidesFromFire: event.target.checked,
                      }))}
                      aria-label={`La couche ${index + 1} protège les côtés de la structure au feu`}
                      title="À cocher uniquement si la couche in-lying reste fixée et protège durablement les côtés de la structure au feu"
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => moveLayer(index, -1)} disabled={index === 0} style={smallButtonStyle}>Up</button>{' '}
                    <button type="button" onClick={() => moveLayer(index, 1)} disabled={index === layers.length - 1} style={smallButtonStyle}>Down</button>{' '}
                    <button type="button" onClick={() => removeLayer(index)} style={smallButtonStyle}>Suppr.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
        </div>
        <div style={{ marginTop: '16px' }}>
          <h3>Resistance bois</h3>
          {component.categoryId === 'floor_assembly' ? (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              Fréquence limite de vibration
              <input
                type="number"
                min="0"
                step="0.1"
                value={vibrationLimitFrequencyInput}
                onChange={(event) =>
                  handleFireResistanceFieldChange(
                    'vibration_f_min_Hz',
                    event.target.value === '' ? '' : parseNullableNumber(event.target.value)
                  )
                }
                style={{ width: '90px', border: '1px solid #222',padding: '4px' }}
              />
              Hz
            </label>
          ) : null}
          {woodCapacityTable ? (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: 'auto', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
              <thead>
                <tr style={{ backgroundColor: '#eee' }}>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Verification</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>Temperature normale</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>R30</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>R60</th>
                </tr>
              </thead>
              <tbody>
                {woodCapacityTable.rows.map((row) => (
                  <tr key={row.label}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{row.label}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                      {formatCapacityCell(row.normal_temperature)}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                      {formatCapacityCell(row.R30)}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                      {formatCapacityCell(row.R60)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div style={{ background: '#f6f6f6', border: '1px solid #ddd', padding: '10px' }}>
              {woodBeamSpanResult?.error || woodStudCompressionResult?.error || 'N/A'}
            </div>
          )}
          {woodBeamSpanResult && !woodBeamSpanResult.error ? (
            <div style={{ marginTop: '12px', display: 'inline-block', maxWidth: '900px', padding: '12px 14px', border: '1px solid #ddd', borderRadius: '6px', background: '#fafafa' }}>
              <strong>Hypothèses du calcul des portées</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: 1.55 }}>
                <li>Calcul appliqué uniquement à une structure en bois (`holz` ou `holzwerkstoff`). Catégorie détectée : {(woodBeamSpanResult.input?.materialCategoryIds ?? []).join(', ') || 'N/A'}.</li>
                <li>Poutre simplement appuyée sur deux appuis, sous charge uniformément répartie.</li>
                <li>
                  Section : b = {formatNumber(woodBeamSpanResult.section?.b_mm, 0)} mm, h = {formatNumber(woodBeamSpanResult.section?.h_mm, 0)} mm,
                  entraxe = {formatNumber(woodBeamSpanResult.section?.spacing_mm, 0)} mm.
                  {woodBeamSpanResult.input?.isContinuousSupport ? ' Structure continue calculée comme une bande porteuse de 1 m.' : ''}
                </li>
                <li>
                  Bois : {woodBeamSpanResult.material?.woodFamily} / {woodBeamSpanResult.material?.woodClass},
                  fm,d = {formatNumber(woodBeamSpanResult.material?.fm_d_N_mm2, 2)} N/mm²,
                  fv,d = {formatNumber(woodBeamSpanResult.material?.fv_d_N_mm2, 2)} N/mm²,
                  Emean = {formatNumber(woodBeamSpanResult.material?.Em_mean_N_mm2, 0)} N/mm².
                </li>
                <li>
                  Charges : Gk surfacique = {formatNumber(woodBeamSpanResult.loads?.permanentLoad_kN_m2, 2)} kN/m²,
                  poids propre de la poutre = {formatNumber(woodBeamSpanResult.loads?.selfWeight_kN_m, 3)} kN/m,
                  Qk = {formatNumber(woodBeamSpanResult.loads?.qk_live_kN_m2, 2)} kN/m².
                </li>
                <li>
                  Combinaison à température normale : {woodBeamSpanResult.assumptions?.ambientLoadCombination},
                  soit qd = {formatNumber(woodBeamSpanResult.loads?.qdAmbient_kN_m, 3)} kN/m.
                </li>
                <li>
                  Flèche : critère {woodBeamSpanResult.assumptions?.deflectionCriterionKey}, limite L/{formatNumber(woodBeamSpanResult.assumptions?.deflectionRatio, 0)}.
                  Vibration : fmin = {woodBeamSpanResult.ambient?.f_min_Hz == null ? 'N/A' : `${formatNumber(woodBeamSpanResult.ambient.f_min_Hz, 1)} Hz`},
                  masse linéique = {woodBeamSpanResult.ambient?.m_line_kg_m == null ? 'N/A' : `${formatNumber(woodBeamSpanResult.ambient.m_line_kg_m, 1)} kg/m`}.
                </li>
                <li>
                  Incendie : exposition sur {woodBeamSpanResult.input?.fireExposureFaces} faces,
                  βn = {formatNumber(woodBeamSpanResult.material?.beta_n_mm_min, 2)} mm/min,
                  couche résiduelle dred = {formatNumber(woodBeamSpanResult.assumptions?.residualLayer_mm, 0)} mm,
                  protection = {formatNumber(woodBeamSpanResult.input?.t_protection_min ?? 0, 1)} min,
                  Ed,fi = {formatNumber(woodBeamSpanResult.assumptions?.fireEffectFactor, 2)} × Ed.
                </li>
                <li>La portée retenue est la plus petite valeur issue des vérifications applicables : flexion, cisaillement, flèche, vibration et incendie.</li>
              </ul>
              <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                Calcul de prédimensionnement simplifié selon SIA 260 / 261 / 265 ; les assemblages, appuis locaux, entailles, trous et la stabilité globale ne sont pas vérifiés.
              </small>
            </div>
          ) : null}
          {woodStudCompressionResult && !woodStudCompressionResult.error ? (
            <div style={{ marginTop: '12px', display: 'inline-block', maxWidth: '900px', padding: '12px 14px', border: '1px solid #ddd', borderRadius: '6px', background: '#fafafa' }}>
              <strong>Hypothèses du calcul de résistance des parois porteuses</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: '20px', lineHeight: 1.55 }}>
                <li>Calcul appliqué uniquement à une structure en bois (`holz` ou `holzwerkstoff`). Catégorie détectée : {(woodStudCompressionResult.input?.materialCategoryIds ?? []).join(', ') || 'N/A'}.</li>
                <li>Montant modélisé comme une barre comprimée de section rectangulaire pleine ; flambage vérifié uniquement dans le sens de l’épaisseur du mur (dimension h).</li>
                <li>Dans l’autre sens, le montant est supposé maintenu par un panneau de contreventement continu ; le flambage dans cette direction n’est donc pas vérifié.</li>
                <li>
                  Section : b = {formatNumber(woodStudCompressionResult.input?.b_mm, 0)} mm,
                  h = {formatNumber(woodStudCompressionResult.input?.h_mm, 0)} mm,
                  entraxe = {formatNumber(woodStudCompressionResult.input?.spacing_mm, 0)} mm.
                  {woodStudCompressionResult.input?.isContinuousSupport ? ' Structure continue calculée comme une bande porteuse de 1 m.' : ''}
                </li>
                <li>
                  Bois : {woodStudCompressionResult.input?.woodFamily} / {woodStudCompressionResult.input?.woodClass}.
                  Longueur de flambage = {formatNumber(woodStudCompressionResult.input?.bucklingLength_mm, 0)} mm.
                </li>
                <li>
                  Excentricités appliquées : {formatNumber(woodStudCompressionResult.input?.eccentricity_along_h_mm ?? 0, 0)} mm selon h et {formatNumber(woodStudCompressionResult.input?.eccentricity_along_b_mm ?? 0, 0)} mm selon b.
                  La résistance retenue est la plus faible entre le flambage et l’interaction compression-flexion.
                </li>
                <li>
                  À température normale : élancement relatif λrel = {formatNumber(woodStudCompressionResult.normalTemperature?.buckling?.lambda_rel, 2)} et facteur de réduction kc = {formatNumber(woodStudCompressionResult.normalTemperature?.buckling?.kc, 2)}.
                </li>
                <li>
                  Incendie : exposition sur {woodStudCompressionResult.input?.fireExposureFaces} face{woodStudCompressionResult.input?.fireExposureFaces === 1 ? '' : 's'},
                  protection = {formatNumber(woodStudCompressionResult.input?.t_protection_min ?? 0, 1)} min.
                  {woodStudCompressionResult.input?.hasLateralFireProtection ? ' Les côtés de la structure sont considérés protégés.' : ''}
                </li>
                {(woodStudCompressionResult.fire ?? []).map((fireResult) => (
                  <li key={fireResult.fireMinutes}>
                    R{fireResult.fireMinutes} : profondeur fictive consommée d’eff = {formatNumber(fireResult.d_eff_mm, 1)} mm ;
                    section résiduelle {fireResult.valid ? `${formatNumber(fireResult.bfi_mm, 0)} × ${formatNumber(fireResult.hfi_mm, 0)} mm` : 'insuffisante'}.
                  </li>
                ))}
                <li>La force maximale par mètre de mur est obtenue à partir de la résistance d’un montant divisée par son entraxe.</li>
              </ul>
              <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                Prédimensionnement simplifié selon SIA 265 ; les assemblages, les appuis locaux, le cisaillement, les effets de second ordre détaillés et la stabilité globale ne sont pas vérifiés.
              </small>
            </div>
          ) : null}
        </div>
        {layers.length > 0 && (
          <div style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
            <ViewSVG
              title="Coupe transverse"
              layers={layers}
              view="transverse"
              pxPerMmY={pxPerMmY}
              pxPerMmX={pxPerMmX}
            />
            <ViewSVG
              title="Coupe longitudinale"
              layers={layers}
              view="longitudinal"
              pxPerMmY={pxPerMmY}
              pxPerMmX={pxPerMmX}
            />
          </div>
        )}
        {thermalDetails && (
          <section style={{ marginTop: '28px', border: '1px solid #ccc', borderRadius: '8px', padding: '16px', background: '#fff' }}>
            <h3 style={{ marginTop: 0 }}>Détail du calcul de la valeur U</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', marginBottom: '14px' }}>
              <div>
                <strong>hi</strong> = {formatNumber(thermalDetails.surface.hi_W_m2K, 2)} W/m²K<br />
                Rsi = 1 / hi = {formatNumber(1 / thermalDetails.surface.hi_W_m2K, 3)} m²K/W
              </div>
              <div>
                <strong>he</strong> = {formatNumber(thermalDetails.surface.he_W_m2K, 2)} W/m²K<br />
                Rse = 1 / he = {formatNumber(1 / thermalDetails.surface.he_W_m2K, 3)} m²K/W
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#eee' }}>
                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Type</th>
                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Couche / chemin</th>
                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Calcul</th>
                    <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>R [m²K/W]</th>
                  </tr>
                </thead>
                <tbody>
                  {thermalDetails.surface.terms.map((term) => (
                    <tr key={term.label}>
                      <td style={{ border: '1px solid #ccc', padding: '8px' }}>Surface</td>
                      <td style={{ border: '1px solid #ccc', padding: '8px' }}>{term.label}</td>
                      <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                        {term.coefficient} = {formatNumber(term.coefficient_W_m2K, 2)} W/m²K → R = 1 / {term.coefficient}
                      </td>
                      <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>{formatNumber(term.resistance_m2K_W, 3)}</td>
                    </tr>
                  ))}
                  {thermalDetails.resistanceTerms.map((term, index) => {
                    if (term.type === 'ignored') {
                      return (
                        <tr key={`ignored-${index}`}>
                          <td style={{ border: '1px solid #ccc', padding: '8px' }}>Non incluse</td>
                          <td style={{ border: '1px solid #ccc', padding: '8px' }}>{getLayerName(term.layer, index)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '8px' }}>Couche « {term.reason} »</td>
                          <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>—</td>
                        </tr>
                      );
                    }
                    if (term.type === 'series') {
                      return (
                        <tr key={`series-${index}`}>
                          <td style={{ border: '1px solid #ccc', padding: '8px' }}>Série</td>
                          <td style={{ border: '1px solid #ccc', padding: '8px' }}>{getLayerName(term.layer, index)}</td>
                          <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                            {term.isAirLayer
                              ? 'Rair = 0,180 m²K/W (valeur conventionnelle)'
                              : term.included
                              ? `R = e / λ = ${formatNumber(term.thickness_m, 3)} / ${formatNumber(term.conductivity_W_mK, 3)}`
                              : 'Non incluse : épaisseur ou conductivité λ manquante'}
                          </td>
                          <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                            {term.resistance_m2K_W === null ? 'N/A' : formatNumber(term.resistance_m2K_W, 3)}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`parallel-${index}`}>
                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>Parallèle</td>
                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                          {term.paths.map((path, pathIndex) => (
                            <div key={pathIndex}>
                              {path.label || getLayerName(path.layer, pathIndex)} — f{pathIndex + 1} = {formatNumber(path.fraction, 3)}, λ{pathIndex + 1} = {path.conductivity_W_mK === null
                                ? path.isAirLayer ? '— (air)' : 'N/A'
                                : `${formatNumber(path.conductivity_W_mK, 3)} W/mK`},{' '}
                              {path.airResistance_m2K_W > 0 && path.materialResistance_m2K_W > 0
                                ? `R${pathIndex + 1} = Rmat + Rair = ${formatNumber(path.materialResistance_m2K_W, 3)} + ${formatNumber(path.airResistance_m2K_W, 3)} = ${formatNumber(path.resistance_m2K_W, 3)}`
                                : path.airResistance_m2K_W > 0
                                  ? `R${pathIndex + 1} = Rair = ${formatNumber(path.airResistance_m2K_W, 3)}`
                                  : `R${pathIndex + 1} = ${path.resistance_m2K_W === null ? 'N/A' : formatNumber(path.resistance_m2K_W, 3)}`}
                            </div>
                          ))}
                        </td>
                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                          {term.complete ? 'Req = 1 / (f1 / R1 + f2 / R2)' : 'Calcul parallèle incomplet : λ manquant'}
                        </td>
                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>
                          {term.equivalentResistance_m2K_W === null ? 'N/A' : formatNumber(term.equivalentResistance_m2K_W, 3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: '14px', padding: '12px', background: '#f6f6f6', borderRadius: '6px' }}>
              <div><strong>R total en série</strong> = résistances superficielles + Σ R couches + Σ R équivalentes parallèles = {thermalDetails.totalResistance_m2K_W === null ? 'N/A' : `${formatNumber(thermalDetails.totalResistance_m2K_W, 3)} m²K/W`}</div>
              <div style={{ marginTop: '5px' }}><strong>U = 1 / R total</strong> = {thermalDetails.uValue_W_m2K === null ? 'N/A' : `${formatNumber(thermalDetails.uValue_W_m2K, 3)} W/m²K`}</div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export default Custom;
