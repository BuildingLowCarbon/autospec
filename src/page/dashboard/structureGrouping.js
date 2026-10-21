import { normalizeComponentTaxonomy } from '../../utils/componentTaxonomy.js';

const SUPPORT_DESCRIPTIONS = new Set([
  'structure support',
  'support',
  'support côté droit',
  'supporting structure',
  'support rightside',
  'tragkonstruktion',
]);

const text = (value) => String(value ?? '').trim().toLowerCase();
const searchableText = (layer) => Object.values(layer?.translations || {})
  .flatMap((translation) => [translation?.name, translation?.description])
  .concat([layer?.productName, layer?.name])
  .filter(Boolean)
  .join(' ')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const numberKey = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(3)) : null;
};

export const isSupportStructureLayer = (layer) => {
  if (layer?.isSupportStructure === true) return true;
  if (layer?.isSupportStructure === false) return false;
  return Object.values(layer?.translations || {}).some((translation) =>
    SUPPORT_DESCRIPTIONS.has(text(translation?.description)));
};

export const inferInsulationTypeId = (layer) => {
  if (layer?.insulationTypeId) return layer.insulationTypeId;
  const value = searchableText(layer);
  const category = text(layer?.materialcategoryId);
  if (category === 'mineralische_fasern') return 'mineral_wool';
  if (category === 'holzwerkstoff') return 'wood_fibre';
  if (/\bxps\b|extrud/.test(value)) return 'xps';
  if (/\beps\b|expans/.test(value)) return 'eps';
  if (/\bpur\b|\bpir\b|polyureth/.test(value)) return 'pur_pir';
  if (/cellul/.test(value)) return 'cellulose';
  if (/fibre de bois|wood.?fibre|holzfaser/.test(value)) return 'wood_fibre';
  if (/laine de verre|laine de roche|mineral wool|glass wool|rock wool|glaswolle|steinwolle|mineralwolle/.test(value)) return 'mineral_wool';
  if (/verre cellulaire|foam glass|schaumglas/.test(value)) return 'foam_glass';
  if (/chanvre|hemp|lin|flax|paille|straw|fibre vegetale|plant fibre/.test(value)) return 'plant_fibre';
  return null;
};

export const layerRole = (layer) => {
  if (isSupportStructureLayer(layer)) return 'structure';
  if (layer?.layerFunctionId) return layer.layerFunctionId;
  const value = searchableText(layer);
  if (/isol|daemm|damm|wool|laine|fibre/.test(value)) return 'insulation';
  if (/chape|screed|estrich/.test(value)) return 'screed';
  if (/contrevent|sheathing|beplank|aussteif/.test(value)) return 'bracing';
  if (/masse|dampening|beschwer/.test(value)) return 'mass';
  if (/etanch|waterproof|abdicht|pare-vapeur|vapor|dampf/.test(value)) return 'sealing';
  if (/latte|profil|batten/.test(value)) return 'battens';
  if (/adher|bond|verbund|coupl|coupling/.test(value)) return 'connection';
  if (/revet|parement|cover|cladding|belag|bekleid|plaque|board|panel/.test(value)) return 'covering';
  if (/traitement|surface treatment|oberflach/.test(value)) return 'finish';
  return 'other';
};

export const LAYER_FUNCTION_IDS = [
  'structure',
  'insulation',
  'screed',
  'bracing',
  'mass',
  'sealing',
  'battens',
  'connection',
  'covering',
  'finish',
  'other',
];

export const withExplicitLayerIdentification = (layer) => ({
  ...layer,
  layerFunctionId: layerRole(layer),
  isSupportStructure: isSupportStructureLayer(layer),
  insulationTypeId: layerRole(layer) === 'insulation' ? inferInsulationTypeId(layer) : null,
});

const supportLayerKey = (layer) => {
  const width_mm = numberKey(layer?.width_mm);
  const spacing_mm = numberKey(layer?.spacing_mm);
  const continuous = width_mm === 1000 && spacing_mm === 1000;
  return {
    thickness_mm: numberKey(layer?.thickness_mm),
    width_mm: continuous ? null : width_mm,
    spacing_mm: continuous ? null : spacing_mm,
  };
};

export const structureSignature = (component) => {
  const supportLayers = (component?.structure?.layers || []).filter(isSupportStructureLayer);
  return supportLayers.length ? JSON.stringify(supportLayers.map(supportLayerKey)) : null;
};

export const splitLayersAroundStructure = (component) => {
  const layers = component?.structure?.layers || [];
  const supportIndexes = layers
    .map((layer, index) => (isSupportStructureLayer(layer) ? index : -1))
    .filter((index) => index >= 0);
  if (!supportIndexes.length) return { above: layers, support: [], within: [], below: [], core: [] };
  const supportSet = new Set(supportIndexes);
  const first = supportIndexes[0];
  const last = supportIndexes[supportIndexes.length - 1];
  const result = { above: [], support: [], within: [], below: [], core: [] };
  layers.forEach((layer, index) => {
    // An in-lying layer belongs to its host (for example façade battens), not
    // automatically to the load-bearing structure elsewhere in the assembly.
    let hostIndex = index - 1;
    while (hostIndex >= 0 && ['in-lying', 'overlaying centered'].includes(text(layers[hostIndex]?.structure))) hostIndex -= 1;
    const host = layers[hostIndex];
    const hasStructuralCavity = supportSet.has(hostIndex)
      && Number(host?.width_mm) > 0 && Number(host?.spacing_mm) > Number(host?.width_mm);
    if (supportSet.has(index)) { result.support.push(layer); result.core.push(layer); }
    else if (text(layer?.structure) === 'in-lying' && hasStructuralCavity) { result.within.push(layer); result.core.push(layer); }
    else if (index < first) result.above.push(layer);
    else if (index > last) result.below.push(layer);
    else { result.within.push(layer); result.core.push(layer); }
  });
  return result;
};

export const groupComponentsByStructure = (components = [], { separateSubcategories = false } = {}) => {
  const groups = new Map();
  components.forEach((source) => {
    const component = normalizeComponentTaxonomy(source);
    const signature = structureSignature(component);
    const taxonomyKey = separateSubcategories
      ? `${component.categoryId}::${component.subcategoryId || 'none'}`
      : component.categoryId;
    const key = `${taxonomyKey}::${signature || `unidentified:${component.id}`}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        categoryId: component.categoryId || 'uncategorized',
        subcategoryId: component.subcategoryId || null,
        signature,
        supportLayers: splitLayersAroundStructure(component).support,
        variants: [],
      });
    }
    groups.get(key).variants.push(component);
  });
  return [...groups.values()];
};

