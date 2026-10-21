import { inferInsulationTypeId, isSupportStructureLayer, layerRole, splitLayersAroundStructure, structureSignature } from './structureGrouping';

const rounded = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : null;
};

export const layerCompositionKey = (layer) => JSON.stringify({
  productId: layer?.productId || null,
  materialId: layer?.materialId || null,
  thickness_mm: rounded(layer?.thickness_mm),
  width_mm: rounded(layer?.width_mm),
  spacing_mm: rounded(layer?.spacing_mm),
  structure: layer?.structure || 'on-lying',
  fiberDirection: layer?.fiberDirection || null,
  protectsSupportSidesFromFire: Boolean(layer?.protectsSupportSidesFromFire),
});

export const layerGroupSignature = (layers = []) => layers.map(layerCompositionKey).join('|');

export const componentCompositionSignature = (component) => JSON.stringify({
  categoryId: component?.categoryId || null,
  layers: (component?.structure?.layers || []).map(layerCompositionKey),
});

const explicitRole = (layer) => layer?.layerFunctionId || layerRole(layer);
const metadataValue = (value) => value === undefined || value === '' ? null : value;

export const layerMetadataChanges = (existingComponent, proposedComponent) => {
  const existingLayers = existingComponent?.structure?.layers || [];
  const proposedLayers = proposedComponent?.structure?.layers || [];
  return proposedLayers.flatMap((layer, index) => {
    const existing = existingLayers[index] || {};
    const fromRole = explicitRole(existing);
    const toRole = explicitRole(layer);
    const fromEcccId = metadataValue(existing.ecccId);
    const toEcccId = metadataValue(layer.ecccId);
    if (fromRole === toRole && fromEcccId === toEcccId) return [];
    return [{
      layerIndex: index,
      layerName: labelFromLayers([layer]),
      fromRole,
      toRole,
      fromEcccId,
      toEcccId,
    }];
  });
};

const labelFromLayers = (layers, lang = 'fr') => layers.map((layer) => (
  layer?.translations?.[lang]?.name
  || layer?.translations?.[lang]?.description
  || layer?.translations?.fr?.name
  || layer?.translations?.fr?.description
  || layer?.productName
  || layer?.productId
  || layer?.materialId
  || 'Couche'
)).join(' + ');

export const deriveLayerGroups = (components = [], lang = 'fr') => {
  const groups = new Map();
  components.forEach((component) => {
    const split = splitLayersAroundStructure(component);
    ['above', 'below'].forEach((position) => {
      const layers = split[position];
      if (!layers.length) return;
      const signature = layerGroupSignature(layers);
      const key = `${component.categoryId}::${position}::${signature}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          categoryId: component.categoryId,
          position,
          name: labelFromLayers(layers, lang),
          layers,
          signature,
          sourceComponentIds: [],
          manual: false,
        });
      }
      groups.get(key).sourceComponentIds.push(String(component.id));
    });
  });
  return [...groups.values()];
};

const cloneLayers = (layers = []) => layers.map((layer) => {
  const role = layer.layerFunctionId || layerRole(layer);
  const { variants, ...baseLayer } = layer;
  return {
    ...baseLayer,
    layerFunctionId: role,
    isSupportStructure: role === 'structure',
    insulationTypeId: role === 'insulation' ? inferInsulationTypeId(layer) : null,
  };
});

const layerOptions = (layer) => {
  const base = cloneLayers([layer])[0];
  const alternatives = Array.isArray(layer?.variants) ? layer.variants : [];
  return [base, ...alternatives.map((variant) => {
    const merged = {
      ...base,
      ...variant,
      productId: variant.productId || base.productId || null,
      materialId: variant.materialId || base.materialId || null,
      thickness_mm: variant.thickness_mm === null || variant.thickness_mm === undefined || variant.thickness_mm === ''
        ? base.thickness_mm
        : Number(variant.thickness_mm),
      width_mm: variant.width_mm === null || variant.width_mm === undefined || variant.width_mm === ''
        ? base.width_mm
        : Number(variant.width_mm),
      spacing_mm: variant.spacing_mm === null || variant.spacing_mm === undefined || variant.spacing_mm === ''
        ? base.spacing_mm
        : Number(variant.spacing_mm),
      layerFunctionId: variant.layerFunctionId || base.layerFunctionId || layerRole(base),
      ecccId: variant.ecccId === undefined || variant.ecccId === '' ? (base.ecccId || null) : variant.ecccId,
      ecccDescription: variant.ecccId === undefined || variant.ecccId === '' ? (base.ecccDescription || null) : (variant.ecccDescription || null),
    };
    for (const key of ['thickness_mm', 'width_mm', 'spacing_mm', 'structure', 'fiberDirection', 'reactionToFire', 'time_burning_min', 'time_fire_start_min', 'protectsSupportSidesFromFire', 'ecccId']) {
      if (variant.overrides?.includes(key)) merged[key] = variant[key] === '' ? null : variant[key];
      else if (variant[key] === null || variant[key] === undefined || variant[key] === '') merged[key] = base[key];
    }
    merged.translations = { ...base.translations };
    Object.entries(variant.translations || {}).forEach(([lang, translation]) => {
      merged.translations[lang] = { ...base.translations?.[lang], ...translation };
    });
    merged.isSupportStructure = merged.layerFunctionId === 'structure';
    merged.insulationTypeId = merged.layerFunctionId === 'insulation'
      ? (variant.insulationTypeId || base.insulationTypeId || inferInsulationTypeId(merged))
      : null;
    delete merged.id;
    delete merged.overrides;
    return merged;
  })];
};

export const expandLayerGroupVariants = (group) => {
  const layers = group?.layers || [];
  if (!layers.length) return [group];
  const combinations = layers.reduce((current, layer) => (
    current.flatMap((combination) => layerOptions(layer).map((option) => [...combination, option]))
  ), [[]]);
  if (combinations.length === 1) return [{ ...group, layers: combinations[0] }];
  return combinations.map((combination, index) => ({
    ...group,
    id: `${group.id}::configuration-${index + 1}`,
    parentGroupId: group.id,
    name: `${group.name} · configuration ${index + 1}/${combinations.length}`,
    layers: combination.map((layer, order) => ({ ...layer, order })),
  }));
};

export const expandStructureGroupVariants = (structureGroup) => {
  if (structureGroup.structureVariantConfigs?.length) {
    const cores = new Map();
    structureGroup.variants.forEach((component) => {
      const signature = layerGroupSignature(splitLayersAroundStructure(component).core);
      if (!cores.has(signature)) cores.set(signature, component);
    });
    return [...cores.entries()].flatMap(([signature, component], index) => expandStructureGroupVariants({
      ...structureGroup, key: `${structureGroup.key}::core-${index + 1}`, variants: [component], structureVariantConfigs: null,
      structureVariantConfig: structureGroup.structureVariantConfigs.find((config) => config.targetCoreSignature === signature)
        || (index === 0 ? structureGroup.structureVariantConfigs.find((config) => !config.targetCoreSignature) : null),
    }));
  }
  const config = structureGroup?.structureVariantConfig;
  if (!config?.layers?.length) {
    const cores = new Map();
    (structureGroup.variants || []).forEach((component) => {
      const core = splitLayersAroundStructure(component).core;
      const key = layerGroupSignature(core);
      if (!cores.has(key)) cores.set(key, component);
    });
    return [...cores.values()].map((component, index) => ({ ...structureGroup,
      key: `${structureGroup.key}::core-${index + 1}`, parentStructureKey: structureGroup.key,
      variants: [component],
    }));
  }
  const configurations = expandLayerGroupVariants(config);
  const template = structureGroup.variants?.[0];
  if (!template) return [structureGroup];
  return configurations.map((configuration, configurationIndex) => {
    let supportIndex = 0;
    const split = splitLayersAroundStructure(template);
    const core = config.includesIntegratedLayers ? configuration.layers : split.core.map((layer) => {
      if (!isSupportStructureLayer(layer)) return { ...layer };
      const replacement = configuration.layers[supportIndex++] || layer;
      const role = replacement.layerFunctionId || layer.layerFunctionId || 'structure';
      return { ...layer, ...replacement, isSupportStructure: role === 'structure', layerFunctionId: role };
    });
    const layers = [...split.above, ...core, ...split.below];
    return {
      ...structureGroup,
      key: `${structureGroup.key}::structure-configuration-${configurationIndex + 1}`,
      label: configurations.length > 1
        ? `${structureGroup.label} · structure ${configurationIndex + 1}/${configurations.length}`
        : structureGroup.label,
      variants: [{ ...template, structure: { ...template.structure, layers } }],
      parentStructureKey: structureGroup.key,
    };
  });
};

export const buildVariantCandidates = ({
  categoryId,
  structures = [],
  upperGroups = [],
  lowerGroups = [],
  existingComponents = [],
}) => {
  const uppers = upperGroups.length ? upperGroups.flatMap(expandLayerGroupVariants) : [{ id: 'none-above', layers: [] }];
  const lowers = lowerGroups.length ? lowerGroups.flatMap(expandLayerGroupVariants) : [{ id: 'none-below', layers: [] }];
  const existingBySignature = new Map();
  existingComponents.forEach((component) => {
    const signature = componentCompositionSignature(component);
    if (!existingBySignature.has(signature)) existingBySignature.set(signature, []);
    const duplicateKey = `${String(component?.source?.databaseId || '')}:${String(component?.id || '')}`;
    if (!existingBySignature.get(signature).some((entry) => entry.duplicateKey === duplicateKey)) {
      existingBySignature.get(signature).push({ component, duplicateKey });
    }
  });
  const candidateSignatures = new Set();
  const candidates = [];

  structures.flatMap(expandStructureGroupVariants).forEach((structureGroup) => {
    const template = structureGroup.variants?.[0];
    if (!template) return;
    const split = splitLayersAroundStructure(template);
    uppers.forEach((upper) => lowers.forEach((lower) => {
      const layers = [
        ...cloneLayers(upper.layers),
        ...cloneLayers(split.core),
        ...cloneLayers(lower.layers),
      ].map((layer, order) => ({ ...layer, order }));
      const component = {
        ...template,
        id: null,
        serialNo: '',
        categoryId,
        translations: {
          fr: { name: `${upper.name || 'Sans couche'} — ${structureGroup.label || 'Structure'} — ${lower.name || 'Sans couche'}`, description: 'Variante générée' },
          de: { name: '', description: '' },
          en: { name: '', description: '' },
          it: { name: '', description: '' },
        },
        structure: { ...template.structure, layers },
        fire_resistance: {},
        sound_insulation: {
          airborneSound: { Rw_dB: null, c100_3150_dB: null, c50_3150_dB: null, ctr100_3150_dB: null },
          impactSound: { Lnw_dB: null, ci100_2500_dB: null, ci50_2500_dB: null },
        },
        source: { name: 'AutoSpec – variantes générées', databaseId: 'generated', externalId: null },
        generated: true,
        generatedFrom: {
          structureSignature: structureSignature(template),
          structureComponentId: template.id,
          upperGroupId: upper.id,
          lowerGroupId: lower.id,
        },
      };
      const signature = componentCompositionSignature(component);
      const existingMatches = (existingBySignature.get(signature) || []).map((entry) => entry.component);
      const metadataUpdates = existingMatches.map((existingComponent) => ({
        component: existingComponent,
        changes: layerMetadataChanges(existingComponent, component),
      })).filter((update) => update.changes.length > 0);
      const duplicateCandidate = candidateSignatures.has(signature);
      const exists = existingMatches.length > 0 || duplicateCandidate;
      const updateRequired = metadataUpdates.length > 0;
      candidateSignatures.add(signature);
      candidates.push({ component, signature, exists, updateRequired, metadataUpdates, selected: !exists || updateRequired });
    }));
  });
  return candidates;
};
