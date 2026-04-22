import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import translations from '../language/translations';
import categoriesData from '../data/categories.json';
import loadComponents, { invalidateComponentsCache } from '../utils/loadComponents';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import {
  mergeById,
  readLocalCustomComponents,
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

const getText = (value, fallback = '') => (value === null || value === undefined ? fallback : String(value));

const parseNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const makeUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  clone.source = {
    ...(clone.source ?? {}),
    name: 'Custom',
    databaseId: 'custom',
  };
  return clone;
};

const computeSummary = (component) => {
  const layers = component?.structure?.layers ?? [];
  const thickness = layers.reduce((acc, layer) => acc + (parseNullableNumber(layer?.thickness_mm) ?? 0), 0);
  const weight = layers.reduce((acc, layer) => acc + (parseNullableNumber(layer?.weight_kg_m2) ?? 0), 0);
  const gwp = layers.reduce((acc, layer) => acc + (parseNullableNumber(layer?.gwp_kgco2e_m2) ?? 0), 0);
  const totalResistance = layers.reduce((acc, layer) => acc + (parseNullableNumber(layer?.thermalResistance_m2K_W) ?? 0), 0);
  return {
    thickness_mm: thickness,
    weight_kg_m2: weight,
    gwp_kgco2e_m2: gwp,
    uValue_W_m2K: totalResistance > 0 ? 1 / totalResistance : null,
  };
};

function Custom() {
  const { id } = useParams();
  const { lang, setLang } = useContext(LangContext);
  const t = translations[lang];

  const [component, setComponent] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const [allComponents, materialsJson, productsJson] = await Promise.all([
        loadComponents(),
        loadMaterials(),
        loadProducts(),
      ]);
      const found = allComponents.find((item) => String(item.id) === String(id));
      setComponent(found ? cloneComponent(found) : null);
      setMaterials(materialsJson);
      setProducts(productsJson);
    };
    fetchData();
  }, [id]);

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

  const ecccOptions = category?.eccc ?? [];
  const summary = useMemo(() => (component ? computeSummary(component) : null), [component]);

  const handleComponentFieldChange = (field, value) => {
    setComponent((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
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

  const handleEcccChange = (index, ecccId) => {
    const selected = ecccOptions.find((item) => item.ecccId === ecccId) ?? null;
    handleLayerChange(index, (layer) => ({
      ...layer,
      ecccId: selected?.ecccId ?? '',
      ecccDescription: selected?.description ?? '',
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

  const persistComponent = (payload) => {
    const existing = readLocalCustomComponents();
    const merged = mergeById([...existing, withCustomSource(payload)]);
    writeLocalCustomComponents(merged);
    invalidateComponentsCache();
  };

  const saveCurrent = () => {
    if (!component) return;
    const payload = {
      ...component,
      ...summary,
      source: {
        ...(component.source ?? {}),
        name: 'Custom',
        databaseId: 'custom',
      },
    };
    persistComponent(payload);
    setStatus('Modifications enregistrees dans components_custom.');
  };

  const createNew = () => {
    if (!component) return;
    const newId = makeUuid();
    const payload = {
      ...component,
      ...summary,
      id: newId,
      parent: component.id ?? null,
      source: {
        ...(component.source ?? {}),
        name: 'Custom',
        databaseId: 'custom',
      },
    };
    persistComponent(payload);
    setComponent(cloneComponent(payload));
    setStatus(`Nouveau composant cree (${newId}).`);
  };

  if (!component) {
    return (
      <>
        <Header lang={lang} setLang={setLang} />
        <div style={{ padding: '20px' }}>Chargement...</div>
      </>
    );
  }

  const layers = component?.structure?.layers ?? [];
  const title = component?.translations?.[lang]?.name || component?.serialNo || component?.id || '';
  const description = component?.translations?.[lang]?.description || '';

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <div style={{ padding: '20px' }}>
        <h2>Custom {t.component_details}</h2>
        <p>
          <Link to={`/element/${component.id}`}>Retour a la page element</Link>
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          <label>
            ID
            <input type="text" value={component.id ?? ''} disabled style={{ width: '100%' }} />
          </label>
          <label>
            {t.category}
            <input
              type="text"
              value={component.categoryId ?? ''}
              onChange={(event) => handleComponentFieldChange('categoryId', event.target.value)}
              style={{ width: '100%' }}
            />
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

        <div style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
          <button type="button" onClick={saveCurrent}>Enregistrer</button>
          <button type="button" onClick={createNew}>Creer nouveau composant</button>
          {status ? <span>{status}</span> : null}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <strong>{t.thickness}:</strong> {formatNumber(summary?.thickness_mm ?? 0, 0)} mm | <strong>{t.surface_mass}:</strong>{' '}
          {formatNumber(summary?.weight_kg_m2 ?? 0, 1)} kg/m2 | <strong>{t.gwp}:</strong> {formatNumber(summary?.gwp_kgco2e_m2 ?? 0, 1)} kgCO2e/m2 |{' '}
          <strong>{t.uValue}:</strong>{' '}
          {summary?.uValue_W_m2K === null ? 'N/A' : `${formatNumber(summary?.uValue_W_m2K, 3)} W/m2K`}
        </div>

        <h2>{t.structure}</h2>
        <div style={{ marginBottom: '10px' }}>
          <button type="button" onClick={addLayer}>Ajouter une ligne</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
            <thead>
              <tr style={{ backgroundColor: '#eee' }}>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>ecccId</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.description}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.layer}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.name}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.thickness}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.width}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.spacing}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.surface_mass}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.gwp}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.thermal_resistance}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.reactionToFire}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.kbobId}</th>
                <th style={{ border: '1px solid #ccc', padding: '8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer, index) => (
                <tr key={`${layer.order}-${index}`}>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <select
                      value={layer?.ecccId ?? ''}
                      onChange={(event) => handleEcccChange(index, event.target.value)}
                      style={{ width: '120px' }}
                    >
                      <option value="">--</option>
                      {ecccOptions.map((option) => (
                        <option key={option.ecccId} value={option.ecccId}>
                          {option.ecccId}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="text"
                      value={layer?.ecccDescription ?? ''}
                      onChange={(event) => handleLayerTextChange(index, 'ecccDescription', event.target.value)}
                      style={{ width: '240px' }}
                    />
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
                    <input
                      type="number"
                      value={layer?.weight_kg_m2 ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'weight_kg_m2', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="number"
                      value={layer?.gwp_kgco2e_m2 ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'gwp_kgco2e_m2', event.target.value)}
                      style={{ width: '90px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <input
                      type="number"
                      value={layer?.thermalResistance_m2K_W ?? ''}
                      onChange={(event) => handleLayerNumberChange(index, 'thermalResistance_m2K_W', event.target.value)}
                      style={{ width: '90px' }}
                    />
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
                      type="text"
                      value={layer?.kbobId ?? ''}
                      onChange={(event) => handleLayerTextChange(index, 'kbobId', event.target.value)}
                      style={{ width: '110px' }}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '8px', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => moveLayer(index, -1)} disabled={index === 0}>Up</button>{' '}
                    <button type="button" onClick={() => moveLayer(index, 1)} disabled={index === layers.length - 1}>Down</button>{' '}
                    <button type="button" onClick={() => removeLayer(index)}>Suppr.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default Custom;
