const normalizeLabel = (value) => String(value ?? '').trim().toLocaleLowerCase('fr');

export const hasLegacySupportLabel = (layer) =>
  normalizeLabel(layer?.translations?.fr?.description) === 'structure support';

export const isSupportStructureLayer = (layer) =>
  layer?.isSupportStructure === true || (
    layer?.isSupportStructure == null && hasLegacySupportLabel(layer)
  );

export const normalizeSupportStructure = (component) => {
  if (!component || !Array.isArray(component?.structure?.layers)) return component;
  return {
    ...component,
    structure: {
      ...component.structure,
      layers: component.structure.layers.map((layer) => (
        isSupportStructureLayer(layer) ? { ...layer, isSupportStructure: true } : layer
      )),
    },
  };
};
