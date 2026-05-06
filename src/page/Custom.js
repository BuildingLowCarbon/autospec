import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
import { ViewSVG, DEFAULT_PX_PER_MM_X } from '../components/Graphic';
import LangContext from '../context/LangContext';
import translations from '../language/translations';
import categoriesData from '../data/categories.json';
import kbobData from '../data/KBOB_mat_db.json';
import loadComponents, { invalidateComponentsCache } from '../utils/loadComponents';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import { calculateComponentProperties } from '../utils/componentPropriety';
import { applyCustomFireTimingToComponent } from '../utils/customFireTiming';
import {
  mergeById,
  readLocalCustomComponents,
  writeFileCustomComponent,
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

const formatCapacityCell = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return 'N/A';
  return `${formatNumber(cell.value, 2)} ${cell.unit ?? ''}`.trim();
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
  };

  const saveCurrent = async () => {
    if (!componentWithFireTiming) return;
    setStatus('Enregistrement...');
    const payload = {
      ...componentWithFireTiming,
      ...summary,
      source: {
        ...(componentWithFireTiming.source ?? {}),
        name: 'Custom',
        databaseId: 'custom',
      },
    };
    try {
      await persistComponent(payload);
      setComponent(cloneComponent(payload));
      setStatus('Modifications enregistrees dans components_custom.json.');
    } catch (error) {
      setStatus(`Sauvegarde fichier impossible. Copie locale conservee. ${error.message}`);
    }
  };

  const createNew = async () => {
    if (!component || !componentWithFireTiming) return;
    setStatus('Enregistrement...');
    const newId = makeUuid();
    const payload = {
      ...componentWithFireTiming,
      ...summary,
      id: newId,
      parent: component.id ?? null,
      source: {
        ...(componentWithFireTiming.source ?? {}),
        name: 'Custom',
        databaseId: 'custom',
      },
    };
    try {
      await persistComponent(payload);
      setComponent(cloneComponent(payload));
      setStatus(`Nouveau composant cree dans components_custom.json (${newId}).`);
    } catch (error) {
      setStatus(`Sauvegarde fichier impossible. Copie locale conservee (${newId}). ${error.message}`);
    }
  };

  if (!component) {
    return (
      <>
        <Header lang={lang} setLang={setLang} />
        <div style={{ padding: '20px' }}>Chargement...</div>
      </>
    );
  }

  const layers = componentWithFireTiming?.structure?.layers ?? [];
  const woodBeamSpanResult = componentWithFireTiming?.fire_resistance?.wood_beam_span ?? null;
  const woodStudCompressionResult = componentWithFireTiming?.fire_resistance?.wood_stud_compression ?? null;
  const woodCapacityTable = componentWithFireTiming?.fire_resistance?.wood_capacity_table ?? null;
  const pxPerMmY = 1;
  const pxPerMmX = DEFAULT_PX_PER_MM_X;
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
          <button type="button" onClick={addLayer}>Ajouter une ligne</button>
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
        <div style={{ marginTop: '16px' }}>
          <h3>Resistance bois</h3>
          {woodCapacityTable ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
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
          ) : (
            <div style={{ background: '#f6f6f6', border: '1px solid #ddd', padding: '10px' }}>
              {woodBeamSpanResult?.error || woodStudCompressionResult?.error || 'N/A'}
            </div>
          )}
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
      </div>
    </>
  );
}

export default Custom;
