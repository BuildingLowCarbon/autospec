import {
  groupComponentsByStructure,
  isSupportStructureLayer,
  layerRole,
} from '../page/dashboard/structureGrouping';

export const UNKNOWN_STRUCTURE_MATERIAL = '__unknown_structure_material__';
export const NO_INSULATION_MATERIAL = '__no_insulation_material__';
export const NO_SCREED_MATERIAL = '__no_screed_material__';

const localizedLayerName = (layer, lang = 'fr') => layer?.translations?.[lang]?.name
  || layer?.translations?.[lang]?.description
  || layer?.translations?.fr?.name
  || layer?.translations?.fr?.description
  || layer?.translations?.de?.name
  || layer?.translations?.de?.description
  || layer?.productName
  || layer?.name
  || layer?.productId
  || layer?.materialId
  || layer?.materialcategoryId
  || null;

const localizedCatalogName = (item, lang = 'fr') => item?.translations?.[lang]?.name
  || item?.translations?.fr?.name
  || item?.translations?.de?.name
  || item?.translations?.en?.name
  || item?.translations?.it?.name
  || item?.workingtitle
  || item?.name
  || null;

const catalogName = (layer, lang, catalog) => {
  const key = materialKey(layer);
  if (!key) return null;
  const material = catalog?.materialById?.get(key);
  const product = catalog?.productById?.get(key);
  return localizedCatalogName(material || product, lang);
};

const materialKey = (layer) => String(
  layer?.productId || layer?.materialId || layer?.materialcategoryId || '',
).trim() || null;

const uniqueReferences = (references) => [...new Map(
  references.map((reference) => [reference.value, reference]),
).values()];

export const getStructureMaterialReferences = (component, lang = 'fr', catalog = null) => {
  const layers = component?.structure?.layers || [];
  const references = layers.filter(isSupportStructureLayer).map((layer) => ({
    value: materialKey(layer) || UNKNOWN_STRUCTURE_MATERIAL,
    label: catalogName(layer, lang, catalog) || localizedLayerName(layer, lang) || 'Matériau non identifié',
  }));
  return references.length
    ? uniqueReferences(references)
    : [{ value: UNKNOWN_STRUCTURE_MATERIAL, label: 'Matériau non identifié' }];
};

export const getInsulationMaterialReferences = (component, lang = 'fr', catalog = null) => {
  const layers = component?.structure?.layers || [];
  const references = layers.filter((layer) => layerRole(layer) === 'insulation').map((layer) => ({
    value: materialKey(layer) || layer?.insulationTypeId || NO_INSULATION_MATERIAL,
    label: catalogName(layer, lang, catalog) || localizedLayerName(layer, lang) || layer?.insulationTypeId || 'Isolant non identifié',
  }));
  return references.length
    ? uniqueReferences(references)
    : [{ value: NO_INSULATION_MATERIAL, label: 'Sans isolant identifié' }];
};

export const getScreedMaterialReferences = (component, lang = 'fr', catalog = null) => {
  if (component?.categoryId !== 'floor_assembly') return [];
  const references = (component?.structure?.layers || [])
    .filter((layer) => layerRole(layer) === 'screed')
    .map((layer) => ({
      value: materialKey(layer) || NO_SCREED_MATERIAL,
      label: catalogName(layer, lang, catalog) || localizedLayerName(layer, lang) || 'Chape non identifiée',
    }));
  return references.length
    ? uniqueReferences(references)
    : [{ value: NO_SCREED_MATERIAL, label: 'Sans chape identifiée' }];
};

const optionsFor = (components, getter, lang, catalog) => [...new Map(
  components.flatMap((component) => getter(component, lang, catalog)).map((reference) => [reference.value, reference]),
).values()].sort((a, b) => a.label.localeCompare(b.label, lang, { sensitivity: 'base', numeric: true }));

export const getStructureMaterialOptions = (components, lang = 'fr', catalog = null) =>
  optionsFor(components, getStructureMaterialReferences, lang, catalog);

export const getInsulationMaterialOptions = (components, lang = 'fr', catalog = null) =>
  optionsFor(components, getInsulationMaterialReferences, lang, catalog);

export const getScreedMaterialOptions = (components, lang = 'fr', catalog = null) =>
  optionsFor(components, getScreedMaterialReferences, lang, catalog);

const matchesReferences = (component, selected, getter) => {
  if (!Array.isArray(selected) || !selected.length) return true;
  return getter(component).some((reference) => selected.includes(reference.value));
};

export const matchesMaterialFilters = (component, structureMaterials, insulationMaterials, screedMaterials) =>
  matchesReferences(component, structureMaterials, getStructureMaterialReferences)
  && matchesReferences(component, insulationMaterials, getInsulationMaterialReferences)
  && (component?.categoryId !== 'floor_assembly' || matchesReferences(component, screedMaterials, getScreedMaterialReferences));

const componentName = (component, lang) => component?.translations?.[lang]?.name
  || component?.translations?.fr?.name
  || component?.translations?.de?.name
  || component?.translations?.en?.name
  || component?.serialNo
  || component?.source?.externalId
  || component?.id
  || 'Composant';

const structureDescription = (group, lang) => {
  const layers = group.supportLayers || [];
  if (!layers.length) return 'Structure non identifiée';
  return layers.map((layer) => {
    const name = localizedLayerName(layer, lang) || 'Structure';
    const dimensions = [
      layer?.thickness_mm != null ? `h ${Number(layer.thickness_mm)} mm` : null,
      layer?.width_mm != null ? `b ${Number(layer.width_mm)} mm` : null,
      layer?.spacing_mm != null ? `e ${Number(layer.spacing_mm)} mm` : null,
    ].filter(Boolean).join(' · ');
    return dimensions ? `${name} — ${dimensions}` : name;
  }).join(' + ');
};

// A group keeps the taxonomy of its representative so the building summary can
// associate it with the correct building part.
export const structureGroupSelectionId = (groupKey, members = []) =>
  `structure-group:${groupKey}:members:${JSON.stringify([...new Set(members.map((member) => String(member.id)))].sort())}`;

export const selectableItemIdentity = (item) => item?.__isComponentGroup
  ? structureGroupSelectionId(item.__groupKey, item.__groupMembers || [])
  : item?.id;

export const toSelectableStructureGroup = (group, lang = 'fr') => {
  const variants = group?.variants || [];
  const representative = [...variants].sort((a, b) =>
    (a?.structure?.layers?.length || 0) - (b?.structure?.layers?.length || 0))[0] || null;
  if (!representative) return null;
  const id = structureGroupSelectionId(group.key, variants);
  const title = structureDescription(group, lang);
  return {
    ...representative,
    id,
    __isComponentGroup: true,
    __groupKey: group.key,
    __groupMembers: variants,
    __representative: representative,
    translations: {
      ...(representative.translations || {}),
      [lang]: {
        ...(representative.translations?.[lang] || {}),
        name: title,
        description: `${variants.length} variante${variants.length > 1 ? 's' : ''}`,
      },
    },
    __groupTitle: title,
    __groupFallbackName: componentName(representative, lang),
  };
};

export const groupBuildingComponents = (components, lang = 'fr') =>
  groupComponentsByStructure(components)
    .map((group) => toSelectableStructureGroup(group, lang))
    .filter(Boolean);

