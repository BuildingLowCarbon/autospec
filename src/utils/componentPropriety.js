const LAMBDA_AIR_W_MK = 0.025;
const DEFAULT_RSI = 0.13;
const DEFAULT_RSE = 0.04;
const DEFAULT_COMPONENT_SERVICE_LIFE_YEARS = 60;

const SURFACE_RULE_BY_CATEGORY = {
  outer_wall: 'Rsi_Rse',
  steep_roof: 'Rsi_Rse',
  flat_roof_shed_roof: 'Rsi_Rse',
  floor_assembly: 'Rsi_Rse',
  partition_wall_single_shell: '2xRsi',
  partition_wall_double_shell: '2xRsi',
};

const safeFloat = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const mmToM = (value) => {
  const parsed = safeFloat(value);
  return parsed === null ? 0 : parsed / 1000;
};

const areaFractionFromWidthSpacing = (width_mm, spacing_mm) => {
  const width = safeFloat(width_mm);
  const spacing = safeFloat(spacing_mm);
  if (width === null || spacing === null || spacing <= 0) return null;
  if (spacing <= width) return 1;
  return clamp(width / spacing, 0, 1);
};

const getFirstPresent = (object, keys) => {
  for (const key of keys) {
    const value = safeFloat(object?.[key]);
    if (value !== null) return value;
  }
  return null;
};

const isPresentId = (value) => value !== null && value !== undefined && value !== '';

const buildMaps = (materials = [], products = [], kbob = []) => ({
  materialsById: new Map(materials.map((item) => [String(item.id), item])),
  productsById: new Map(products.map((item) => [String(item.id), item])),
  kbobById: new Map(
    kbob
      .filter((item) => isPresentId(item?.kbobId))
      .map((item) => [String(item.kbobId), item]),
  ),
});

const resolveLayerProperties = (layer, productsById, materialsById) => {
  const productId = layer?.productId;
  if (!productId) {
    return {
      density_kg_m3: null,
      thermalConductivity_W_mK: null,
      gwp_kgco2e_m3: null,
      gwp_kgco2e_kg: null,
      kbobId: layer?.kbobId ?? null,
    };
  }

  const key = String(productId);
  const product = productsById.get(key);
  if (product) {
    const declared = product.declaredProperties ?? {};
    const calculated = product.calculatedProperties ?? {};
    return {
      density_kg_m3: getFirstPresent(declared, ['density_kg_m3']) ?? getFirstPresent(calculated, ['density_kg_m3']),
      thermalConductivity_W_mK:
        getFirstPresent(declared, ['thermalConductivity_W_mK']) ??
        getFirstPresent(calculated, ['thermalConductivity_W_mK']),
      gwp_kgco2e_m3: getFirstPresent(declared, ['gwp_kgco2e_m3']) ?? getFirstPresent(calculated, ['gwp_kgco2e_m3']),
      gwp_kgco2e_kg: getFirstPresent(declared, ['gwp_kgco2e_kg']) ?? getFirstPresent(calculated, ['gwp_kgco2e_kg']),
      kbobId: layer?.kbobId ?? product.kbobId ?? null,
    };
  }

  const material = materialsById.get(key);
  if (material) {
    return {
      density_kg_m3: safeFloat(material.density_kg_m3),
      thermalConductivity_W_mK: safeFloat(material.thermalConductivity_W_mK),
      gwp_kgco2e_m3: safeFloat(material.gwp_kgco2e_m3),
      gwp_kgco2e_kg: safeFloat(material.gwp_kgco2e_kg),
      kbobId: layer?.kbobId ?? material.kbobId ?? null,
    };
  }

  return {
    density_kg_m3: null,
    thermalConductivity_W_mK: null,
    gwp_kgco2e_m3: null,
    gwp_kgco2e_kg: null,
    kbobId: layer?.kbobId ?? null,
  };
};

const resolveKbobGwp = (kbobId, kbobById) => {
  if (!kbobId) return { gwp: null, ref: null };
  const item = kbobById.get(String(kbobId));
  if (!item) return { gwp: null, ref: null };
  return {
    gwp: safeFloat(item.gwp),
    ref: typeof item.ref === 'string' ? item.ref.trim() : null,
  };
};

const resolveLayerServiceLifeYears = (layer, component, categories = []) => {
  const ecccId = layer?.ecccId;
  if (!ecccId) return null;

  const componentCategory = categories.find((item) => item?.id === component?.categoryId);
  const categoryMatch = componentCategory?.eccc?.find((item) => item?.ecccId === ecccId);
  const serviceLife = safeFloat(categoryMatch?.serviceLife);
  if (serviceLife !== null) return serviceLife;

  for (const category of categories) {
    const match = category?.eccc?.find((item) => item?.ecccId === ecccId);
    const fallbackServiceLife = safeFloat(match?.serviceLife);
    if (fallbackServiceLife !== null) return fallbackServiceLife;
  }

  return null;
};

const replacementFactorForServiceLife = (serviceLifeYears, componentServiceLifeYears) => {
  const serviceLife = safeFloat(serviceLifeYears);
  const componentServiceLife = safeFloat(componentServiceLifeYears) ?? DEFAULT_COMPONENT_SERVICE_LIFE_YEARS;
  if (serviceLife === null || serviceLife <= 0 || componentServiceLife <= 0) return 1;
  return Math.max(1, Math.ceil(componentServiceLife / serviceLife));
};

const surfaceResistanceForCategory = (categoryId, rsi, rse) => {
  const mode = SURFACE_RULE_BY_CATEGORY[categoryId] ?? 'none';
  if (mode === 'Rsi_Rse') return rsi + rse;
  if (mode === '2xRsi') return 2 * rsi;
  if (mode === 'Rsi_only') return rsi;
  if (mode === 'Rse_only') return rse;
  return 0;
};

const computeLayerEffectiveGeometry = (layer, previousLayer) => {
  const structure = layer?.structure ?? '';
  const layerThickness_m = mmToM(layer?.thickness_mm);
  const layerFraction = areaFractionFromWidthSpacing(layer?.width_mm, layer?.spacing_mm) ?? 1;

  if (structure !== 'in-lying') {
    return {
      t_eff_m: layerThickness_m,
      f_eff: layerFraction,
    };
  }

  if (!previousLayer) {
    return {
      t_eff_m: layerThickness_m,
      f_eff: 1,
    };
  }

  const hostThickness_m = mmToM(previousLayer?.thickness_mm);
  const hostFraction = areaFractionFromWidthSpacing(previousLayer?.width_mm, previousLayer?.spacing_mm);
  const voidFraction = hostFraction === null ? 1 : clamp(1 - hostFraction, 0, 1);

  return {
    t_eff_m: Math.max(0, Math.min(layerThickness_m, hostThickness_m)),
    f_eff: Math.max(0, voidFraction),
  };
};

const computeLayerProperties = (
  layer,
  previousLayer,
  component,
  productsById,
  materialsById,
  kbobById,
  categories,
  componentServiceLifeYears,
) => {
  const { t_eff_m, f_eff } = computeLayerEffectiveGeometry(layer, previousLayer);
  const material = resolveLayerProperties(layer, productsById, materialsById);
  const volume_m3_m2 = t_eff_m * f_eff;

  const weight_kg_m2 =
    material.density_kg_m3 === null ? 0 : material.density_kg_m3 * volume_m3_m2;

  const thermalResistance_m2K_W =
    material.thermalConductivity_W_mK === null || t_eff_m <= 0
      ? null
      : t_eff_m / material.thermalConductivity_W_mK;

  let baseGwp_kgco2e_m2 = 0;
  if (material.gwp_kgco2e_m3 !== null) {
    baseGwp_kgco2e_m2 = volume_m3_m2 * material.gwp_kgco2e_m3;
  } else if (material.gwp_kgco2e_kg !== null) {
    baseGwp_kgco2e_m2 = weight_kg_m2 * material.gwp_kgco2e_kg;
  } else {
    const kbob = resolveKbobGwp(material.kbobId, kbobById);
    if (kbob.gwp !== null && kbob.ref === 'm3') {
      baseGwp_kgco2e_m2 = volume_m3_m2 * kbob.gwp;
    } else if (kbob.gwp !== null && kbob.ref === 'kg') {
      baseGwp_kgco2e_m2 = weight_kg_m2 * kbob.gwp;
    } else if (kbob.gwp !== null && kbob.ref === 'm2') {
      baseGwp_kgco2e_m2 = kbob.gwp;
    }
  }

  const serviceLife_years = resolveLayerServiceLifeYears(layer, component, categories);
  const replacementFactor = replacementFactorForServiceLife(serviceLife_years, componentServiceLifeYears);
  const gwp_kgco2e_m2 = baseGwp_kgco2e_m2 * replacementFactor;

  return {
    t_eff_m,
    f_eff,
    weight_kg_m2,
    thermalResistance_m2K_W,
    gwp_kgco2e_m2,
    baseGwp_kgco2e_m2,
    serviceLife_years,
    replacementFactor,
  };
};

const computeComponentUValue = (
  component,
  layers,
  productsById,
  materialsById,
  {
    rsi = DEFAULT_RSI,
    rse = DEFAULT_RSE,
    useLambdaAir = false,
  } = {},
) => {
  let totalResistance = surfaceResistanceForCategory(component?.categoryId ?? '', rsi, rse);
  const sortedLayers = [...layers].sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0));

  let index = 0;
  while (index < sortedLayers.length) {
    const layer = sortedLayers[index];
    const structure = layer?.structure ?? '';
    if (structure === 'overlaying centered') {
      index += 1;
      continue;
    }

    const nextLayer = sortedLayers[index + 1] ?? null;
    const canPair = nextLayer && nextLayer.structure === 'in-lying' && structure !== 'in-lying';
    const hostFraction = areaFractionFromWidthSpacing(layer?.width_mm, layer?.spacing_mm);
    const hostThickness_m = mmToM(layer?.thickness_mm);

    if (!canPair || hostFraction === null) {
      const material = resolveLayerProperties(layer, productsById, materialsById);
      if (material.thermalConductivity_W_mK !== null && hostThickness_m > 0) {
        totalResistance += hostThickness_m / material.thermalConductivity_W_mK;
      }
      index += 1;
      continue;
    }

    const hostMaterial = resolveLayerProperties(layer, productsById, materialsById);
    const fillMaterial = resolveLayerProperties(nextLayer, productsById, materialsById);
    if (
      hostMaterial.thermalConductivity_W_mK === null ||
      fillMaterial.thermalConductivity_W_mK === null ||
      hostThickness_m <= 0
    ) {
      if (hostMaterial.thermalConductivity_W_mK !== null && hostThickness_m > 0) {
        totalResistance += hostThickness_m / hostMaterial.thermalConductivity_W_mK;
      }
      index += 2;
      continue;
    }

    const fHost = clamp(hostFraction, 0, 1);
    const fVoid = 1 - fHost;
    const fillThickness_m = Math.min(mmToM(nextLayer?.thickness_mm), hostThickness_m);
    const hostResistance = hostThickness_m / hostMaterial.thermalConductivity_W_mK;
    let fillResistance = fillThickness_m > 0 ? fillThickness_m / fillMaterial.thermalConductivity_W_mK : 0;
    if (useLambdaAir && hostThickness_m > fillThickness_m) {
      fillResistance += (hostThickness_m - fillThickness_m) / LAMBDA_AIR_W_MK;
    }

    let equivalentU = 0;
    if (hostResistance > 0) equivalentU += fHost / hostResistance;
    if (fVoid > 0 && fillResistance > 0) equivalentU += fVoid / fillResistance;
    if (equivalentU > 0) totalResistance += 1 / equivalentU;

    index += 2;
  }

  return totalResistance > 0 ? 1 / totalResistance : null;
};

export const calculateComponentProperties = (
  component,
  materials = [],
  products = [],
  kbob = [],
  options = {},
) => {
  if (!component || !Array.isArray(component?.structure?.layers)) return component;

  const { materialsById, productsById, kbobById } = buildMaps(materials, products, kbob);
  const categories = options.categories ?? [];
  const componentServiceLifeYears = options.componentServiceLifeYears ?? DEFAULT_COMPONENT_SERVICE_LIFE_YEARS;
  const layers = [...component.structure.layers]
    .sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0))
    .map((layer) => ({ ...layer }));

  let totalThickness_mm = 0;
  let totalWeight_kg_m2 = 0;
  let totalGwp_kgco2e_m2 = 0;
  let previousLayer = null;

  const calculatedLayers = layers.map((layer) => {
    const calc = computeLayerProperties(
      layer,
      previousLayer,
      component,
      productsById,
      materialsById,
      kbobById,
      categories,
      componentServiceLifeYears,
    );
    const nextLayer = {
      ...layer,
      weight_kg_m2: calc.weight_kg_m2,
      gwp_kgco2e_m2: calc.gwp_kgco2e_m2,
      baseGwp_kgco2e_m2: calc.baseGwp_kgco2e_m2,
      thermalResistance_m2K_W: calc.thermalResistance_m2K_W,
      serviceLife_years: calc.serviceLife_years,
      replacementFactor: calc.replacementFactor,
    };

    if ((layer.structure ?? '') === 'on-lying') {
      totalThickness_mm += mmToM(layer.thickness_mm) * 1000;
    }
    totalWeight_kg_m2 += calc.weight_kg_m2;
    totalGwp_kgco2e_m2 += calc.gwp_kgco2e_m2;
    previousLayer = nextLayer;
    return nextLayer;
  });

  const uValue_W_m2K = computeComponentUValue(
    component,
    calculatedLayers,
    productsById,
    materialsById,
    options,
  );

  return {
    ...component,
    thickness_mm: totalThickness_mm,
    weight_kg_m2: totalWeight_kg_m2,
    gwp_kgco2e_m2: totalGwp_kgco2e_m2,
    uValue_W_m2K,
    structure: {
      ...(component.structure ?? {}),
      layers: calculatedLayers.map((layer, order) => ({ ...layer, order })),
    },
  };
};

export default calculateComponentProperties;
