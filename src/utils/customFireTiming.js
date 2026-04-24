import { calculateWoodBeamSpan } from './fireResistance';
import { calcBurnThroughTime_min } from './fireResistance';

const SUPPORT_DESCRIPTION_FR = 'Structure support';

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundTo2 = (value) => Math.round(value * 100) / 100;

const isContinuousLayer = (layer) => {
  const width = toNumberOrNull(layer?.width_mm);
  const spacing = toNumberOrNull(layer?.spacing_mm);
  return width === null && spacing === null;
};

const resolveLayerMaterialCategory = (layer, materialById, productById) => {
  const targetId = layer?.productId;
  if (!targetId) return null;
  const key = String(targetId);

  const directMaterial = materialById.get(key);
  if (directMaterial?.materialcategoryId) {
    return directMaterial.materialcategoryId;
  }

  const product = productById.get(key);
  if (!product || !Array.isArray(product.composition)) return null;

  const categories = product.composition
    .map((entry) => entry?.material?.id)
    .filter(Boolean)
    .map((materialId) => materialById.get(String(materialId))?.materialcategoryId)
    .filter(Boolean);

  if (categories.includes('gips')) return 'gips';
  if (categories.includes('holz')) return 'holz';
  return categories[0] ?? null;
};

const computeLayerBurningTimeMin = (layer, materialCategory) => {
  if (layer?.structure === 'in-lying') return 0;
  if (!isContinuousLayer(layer)) return 0;

  const thickness = toNumberOrNull(layer?.thickness_mm);
  if (thickness === null || thickness <= 0) return 0;

  if (materialCategory === 'gips') {
    return 15;
  }

  if (materialCategory === 'holz') {
    const result = calcBurnThroughTime_min({
      thickness_mm: thickness,
      woodFamily: 'solid_softwood'
    });
    
    return result.burnThroughTime_min;
  }

  return 0;
};

const buildLayerMaps = (materials = [], products = []) => ({
  materialById: new Map(materials.map((item) => [String(item.id), item])),
  productById: new Map(products.map((item) => [String(item.id), item])),
});

const findSupportLayerIndex = (layers) =>
  layers.findIndex((layer) => layer?.translations?.fr?.description === SUPPORT_DESCRIPTION_FR);

export const applyCustomFireTimingToComponent = (component, materials = [], products = []) => {
  if (!component || !Array.isArray(component?.structure?.layers)) return component;

  const { materialById, productById } = buildLayerMaps(materials, products);
  const layers = component.structure.layers.map((layer) => ({ ...layer }));
  const supportIndex = findSupportLayerIndex(layers);
  const firstIndexToProcess = supportIndex >= 0 ? supportIndex : 0;

  let accumulatedStart = 0;
  for (let index = layers.length - 1; index >= firstIndexToProcess; index -= 1) {
    const layer = layers[index];
    const materialCategory = resolveLayerMaterialCategory(layer, materialById, productById);
    const burningMin = computeLayerBurningTimeMin(layer, materialCategory);

    layer.time_fire_start_min = roundTo2(accumulatedStart);
    layer.time_burning_min = roundTo2(burningMin);
    accumulatedStart += burningMin;
  }

  for (let index = firstIndexToProcess - 1; index >= 0; index -= 1) {
    layers[index].time_fire_start_min = null;
    layers[index].time_burning_min = null;
  }

  let woodBeamSpanResult = null;
  if (supportIndex >= 0) {
    const supportLayer = layers[supportIndex];
    const b_mm = toNumberOrNull(supportLayer?.width_mm);
    const h_mm = toNumberOrNull(supportLayer?.thickness_mm);
    const spacing_mm = toNumberOrNull(supportLayer?.spacing_mm);
    const t_protection_min = toNumberOrNull(supportLayer?.time_fire_start_min) ?? 0;

    if (b_mm > 0 && h_mm > 0 && spacing_mm > 0) {
      try {
        woodBeamSpanResult = calculateWoodBeamSpan({
          b_mm,
          h_mm,
          spacing_mm,
          permanentLoad_kN_m2: 1.57,
          occupancyKey: 'A1_habitation',
          woodFamily: 'solid_softwood',
          woodClass: 'C24',
          fireExposureFaces: 3,
          fireRatings_min: [30, 60],
          t_protection_min,
          deflectionCriterionKey: 'comfort',
          density_kN_m3: 5.0,
        });
      } catch (error) {
        woodBeamSpanResult = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    ...component,
    structure: {
      ...(component.structure ?? {}),
      layers,
    },
    fire_resistance: {
      ...(component.fire_resistance ?? {}),
      wood_beam_span: woodBeamSpanResult,
    },
  };
};

