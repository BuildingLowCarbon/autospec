const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TAXONOMIES = {
  bauteilgruppe: 'categoryId',
  bauteiltyp: 'typeId',
  bekleidung: 'claddingId',
  beplankung: 'sheathingId',
  beschwerungkonstruktion: 'ballastInConstructionId',
  beschwerungtragschicht: 'ballastOnStructuralLayerId',
  daemmungkonstruktion: 'cavityInsulationInStructureId',
  fassadentyp: 'facadeTypeId',
  bauteilvariante: 'variantId',
  wandbekleidung: 'wallFinishId',
  estrich: 'screedId',
};

const readJson = (file, fallback = []) => {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const slug = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[’' ]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const localized = (de, en, fr, key) => ({
  fr: { name: fr?.[key] ?? null, description: fr?.beschreibung ?? null },
  en: { name: en?.[key] ?? null, description: en?.beschreibung ?? null },
  de: { name: de?.[key] ?? null, description: de?.beschreibung ?? null },
});

const buildLayer = (layer, enLayer, frLayer, order) => ({
  order,
  structure: layer?.aufbau ?? null,
  productId: layer?.produktid ?? null,
  translations: {
    fr: { name: frLayer?.produktname ?? null, description: frLayer?.schicht ?? null },
    en: { name: enLayer?.produktname ?? null, description: enLayer?.schicht ?? null },
    de: { name: layer?.produktname ?? null, description: layer?.schicht ?? null },
  },
  productName: layer?.produktname ?? null,
  thickness_mm: numberOrNull(layer?.dicke),
  weight_kg_m2: numberOrNull(layer?.gewicht),
  width_mm: numberOrNull(layer?.breite),
  spacing_mm: numberOrNull(layer?.achsabstand),
  reactionToFire: layer?.brandverhaltensgruppe ?? null,
  colorCode: layer?.grafikfarbcode ?? null,
  fiberDirection: layer?.faserrichtung === 'längs' ? 'lengthwise' : (layer?.faserrichtung ?? null),
  kbobId: layer?.kbob_id ?? null,
});

const buildUnifiedComponents = (deItems, enItems, frItems) => {
  const enById = new Map(enItems.map((item) => [String(item.id), item]));
  const frById = new Map(frItems.map((item) => [String(item.id), item]));
  const taxonomyMaps = Object.fromEntries(Object.keys(TAXONOMIES).map((key) => [key, new Map()]));
  deItems.forEach((de) => {
    const en = enById.get(String(de.id)) || {};
    const fr = frById.get(String(de.id)) || {};
    Object.keys(TAXONOMIES).forEach((key) => {
      const deItem = de[key] || {};
      const workingtitle = typeof deItem === 'object' ? String(deItem.workingtitle || '').trim() : '';
      if (!workingtitle || taxonomyMaps[key].has(workingtitle)) return;
      const enItem = en[key] || {};
      const frItem = fr[key] || {};
      const base = enItem.name || enItem.workingtitle || deItem.name || workingtitle || frItem.name;
      taxonomyMaps[key].set(workingtitle, slug(base) || slug(workingtitle));
    });
  });
  const taxonomyId = (record, key) => {
    const workingtitle = record?.[key]?.workingtitle;
    return workingtitle ? taxonomyMaps[key].get(String(workingtitle).trim()) || null : null;
  };
  return deItems.map((de) => {
    const en = enById.get(String(de.id)) || {};
    const fr = frById.get(String(de.id)) || {};
    const enLayers = new Map((en.aufbau || []).map((item) => [String(item.produktid), item]));
    const frLayers = new Map((fr.aufbau || []).map((item) => [String(item.produktid), item]));
    const layers = (de.aufbau || []).map((layer, index) => buildLayer(
      layer,
      enLayers.get(String(layer.produktid)) || en.aufbau?.[index],
      frLayers.get(String(layer.produktid)) || fr.aufbau?.[index],
      index,
    ));
    const gwp = de.oekobilanz?.gwp?.value;
    return {
      id: de.id,
      parent: null,
      serialNo: de.laufnummer,
      categoryId: taxonomyId(de, 'bauteilgruppe'),
      thickness_mm: numberOrNull(de.dicke),
      weight_kg_m2: numberOrNull(de.messwertsatz?.gewicht),
      uValue_W_m2K: numberOrNull(de.uwert),
      gwp_kgco2e_m2: numberOrNull(gwp),
      spanMax_m: null,
      claddingId: taxonomyId(de, 'bekleidung'),
      sheathingId: taxonomyId(de, 'beplankung'),
      ballastInConstructionId: taxonomyId(de, 'beschwerungkonstruktion'),
      ballastOnStructuralLayerId: taxonomyId(de, 'beschwerungtragschicht'),
      cavityInsulationInStructureId: taxonomyId(de, 'daemmungkonstruktion'),
      facadeTypeId: taxonomyId(de, 'fassadentyp'),
      wallFinishId: taxonomyId(de, 'wandbekleidung'),
      screedId: taxonomyId(de, 'estrich'),
      variantId: taxonomyId(de, 'bauteilvariante'),
      translations: localized(de, en, fr, 'bauteilname'),
      structure: { layers, typeId: taxonomyId(de, 'bauteiltyp') },
      fire_resistance: { REI_min: null, RF_internal_min: null, RF_external_min: null },
      sound_insulation: {
        airborneSound: {
          Rw_dB: de.daemmwerte?.luftschalldaemmwerte?.rw ?? null,
          c100_3150_dB: de.daemmwerte?.luftschalldaemmwerte?.c100_3150 ?? null,
          c50_3150_dB: de.daemmwerte?.luftschalldaemmwerte?.c50_3150 ?? null,
          ctr100_3150_dB: de.daemmwerte?.luftschalldaemmwerte?.ctr100_3150 ?? null,
        },
        impactSound: {
          Lnw_dB: de.daemmwerte?.trittschalldaemmwerte?.lnw ?? null,
          ci100_2500_dB: de.daemmwerte?.trittschalldaemmwerte?.ci100_2500 ?? null,
          ci50_2500_dB: de.daemmwerte?.trittschalldaemmwerte?.ci50_2500 ?? null,
        },
      },
      source: { name: 'Lignum', databaseId: 'lignum', externalId: de.id, url: de.media?.detail ?? null },
      _rawTaxo: Object.fromEntries(Object.keys(TAXONOMIES).map((key) => [key, de[key] || {}])),
    };
  });
};

const pad = (value) => String(value).padStart(2, '0');
const versionStamp = (date = new Date()) => `${String(date.getFullYear()).slice(-2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
const isoNow = () => new Date().toISOString();

const withoutAudit = (item) => {
  const clone = JSON.parse(JSON.stringify(item));
  delete clone.metadata;
  delete clone.updated_at;
  return clone;
};

const applyAudit = (items, previousItems = [], options = {}) => {
  const previous = new Map(previousItems.map((item) => [String(item.id), item]));
  const now = options.now || isoNow();
  return items.map((item) => {
    const old = previous.get(String(item.id));
    if (old && JSON.stringify(withoutAudit(old)) === JSON.stringify(withoutAudit(item))) return old;
    const oldMetadata = old?.metadata || {};
    return {
      ...item,
      metadata: {
        ...oldMetadata,
        created_at: oldMetadata.created_at || item.metadata?.created_at || now,
        updated_at: now,
        version: Number(oldMetadata.version || item.metadata?.version || 0) + 1,
      },
    };
  });
};

const uniqueVersionPath = (directory, baseName, date = new Date()) => {
  const stem = `${baseName}_${versionStamp(date)}`;
  let candidate = path.join(directory, `${stem}.json`);
  let counter = 2;
  while (fs.existsSync(candidate)) candidate = path.join(directory, `${stem}_${counter++}.json`);
  return candidate;
};

const saveVersioned = ({ activeFile, versionsDir, baseName, items, previousItems, audit = true }) => {
  const audited = audit ? applyAudit(items, previousItems ?? readJson(activeFile, [])) : items;
  const versionFile = uniqueVersionPath(versionsDir, baseName);
  writeJson(versionFile, audited);
  writeJson(activeFile, audited);
  return { items: audited, file: path.basename(versionFile), count: audited.length };
};

const deriveMappings = (unified, selected) => {
  const unifiedById = new Map(unified.map((item) => [String(item.id), item]));
  const mappings = new Map();
  selected.forEach((component) => {
    const sourceLayers = unifiedById.get(String(component.id))?.structure?.layers || [];
    (component.structure?.layers || []).forEach((layer, index) => {
      const lignumId = sourceLayers[index]?.productId;
      if (lignumId && layer.productId && String(lignumId) !== String(layer.productId)) {
        mappings.set(String(lignumId), String(layer.productId));
      }
    });
  });
  return Array.from(mappings, ([lignumId, tbzId]) => ({ lignumId, tbzId, updated_at: null }));
};

const applyMappings = (components, mappingItems, nullUnmapped = false) => {
  const mappings = new Map(mappingItems.filter((m) => m.lignumId && m.tbzId).map((m) => [String(m.lignumId), String(m.tbzId)]));
  return components.map((component) => ({
    ...component,
    structure: {
      ...(component.structure || {}),
      layers: (component.structure?.layers || []).map((layer) => ({
        ...layer,
        productId: layer.productId && mappings.has(String(layer.productId))
          ? mappings.get(String(layer.productId))
          : (layer.productId && nullUnmapped ? null : layer.productId),
      })),
    },
  }));
};

const calculationNeutral = (component) => {
  const clone = JSON.parse(JSON.stringify(component));
  delete clone.metadata;
  ['thickness_mm', 'weight_kg_m2', 'uValue_W_m2K', 'gwp_kgco2e_m2'].forEach((key) => delete clone[key]);
  (clone.structure?.layers || []).forEach((layer) => {
    ['weight_kg_m2', 'gwp_kgco2e_m2', 'baseGwp_kgco2e_m2', 'thermalResistance_m2K_W', 'serviceLife_years', 'replacementFactor'].forEach((key) => delete layer[key]);
  });
  return clone;
};

const preserveCalculatedIfUnchanged = (components, previousItems) => {
  const previous = new Map(previousItems.map((item) => [String(item.id), item]));
  return components.map((component) => {
    const old = previous.get(String(component.id));
    return old && JSON.stringify(calculationNeutral(old)) === JSON.stringify(calculationNeutral(component)) ? old : component;
  });
};

const validateComponents = (components, materials, products) => {
  const known = new Set([...materials, ...products].map((item) => String(item.id)));
  const byReference = new Map();
  const issues = [];
  const seen = new Set();
  components.forEach((component) => {
    const id = String(component.id || '');
    if (!id) issues.push({ severity: 'error', type: 'missing_component_id', componentId: null, message: 'Composant sans id.' });
    if (id && seen.has(id)) issues.push({ severity: 'error', type: 'duplicate_component_id', componentId: id, message: 'Id de composant dupliqué.' });
    seen.add(id);
    if (!component.serialNo) issues.push({ severity: 'warning', type: 'missing_serial', componentId: id, message: 'serialNo manquant.' });
    if (!component.translations?.fr?.name && !component.translations?.de?.name) issues.push({ severity: 'warning', type: 'missing_name', componentId: id, message: 'Nom manquant.' });
    const layers = component.structure?.layers || [];
    if (!layers.length) issues.push({ severity: 'warning', type: 'empty_structure', componentId: id, message: 'Aucune couche.' });
    layers.forEach((layer, index) => {
      if (!layer.productId) return;
      const reference = String(layer.productId);
      if (known.has(reference)) return;
      if (!byReference.has(reference)) byReference.set(reference, []);
      byReference.get(reference).push({ componentId: id, serialNo: component.serialNo, name: component.translations?.fr?.name || component.translations?.de?.name, translations: component.translations || {}, layer: index, layerName: layer.translations?.fr?.name || layer.productName, layerTranslations: layer.translations || {} });
    });
  });
  const unresolved = Array.from(byReference, ([referenceId, occurrences]) => ({ referenceId, occurrences }));
  return {
    summary: { components: components.length, errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length, unresolvedIds: unresolved.length, unresolvedOccurrences: unresolved.reduce((sum, item) => sum + item.occurrences.length, 0) },
    issues,
    unresolved,
  };
};

const newId = () => crypto.randomUUID().toUpperCase();

module.exports = {
  applyAudit,
  applyMappings,
  buildUnifiedComponents,
  deriveMappings,
  newId,
  preserveCalculatedIfUnchanged,
  readJson,
  saveVersioned,
  validateComponents,
  versionStamp,
  writeJson,
};
