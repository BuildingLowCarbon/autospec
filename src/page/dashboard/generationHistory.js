import { splitLayersAroundStructure } from './structureGrouping';

export const generationLayerKey = (layer) => JSON.stringify({
  productId: layer.productId || layer.materialId || null,
  thickness_mm: layer.thickness_mm ?? null,
  width_mm: layer.width_mm ?? null,
  spacing_mm: layer.spacing_mm ?? null,
  structure: layer.structure || 'on-lying',
  role: layer.layerFunctionId || (layer.isSupportStructure ? 'structure' : 'other'),
  ecccId: layer.ecccId || null,
  fiberDirection: layer.fiberDirection || null,
  protectsSupportSidesFromFire: Boolean(layer.protectsSupportSidesFromFire),
  reactionToFire: layer.reactionToFire || null,
  time_burning_min: layer.time_burning_min ?? null,
  time_fire_start_min: layer.time_fire_start_min ?? null,
});

export const generationBlocks = (components) => {
  const groups = { structure: new Map(), above: new Map(), below: new Map() };
  components.forEach((component) => {
    const split = splitLayersAroundStructure(component);
    Object.entries({ structure: split.core, above: split.above, below: split.below }).forEach(([position, layers]) => {
      const key = `${position}:${JSON.stringify(layers.map(generationLayerKey))}`;
      if (!groups[position].has(key)) groups[position].set(key, { id: key, position, layers, componentIds: [] });
      groups[position].get(key).componentIds.push(component.id);
    });
  });
  return Object.fromEntries(Object.entries(groups).map(([position, entries]) => [position, [...entries.values()]]));
};

export const replaceGenerationBlocks = (components, blocks, edits, selectedBlocks) => components.flatMap((component) => {
  const zones = {};
  let changed = false;
  for (const position of ['above', 'structure', 'below']) {
    const block = blocks[position].find((entry) => entry.componentIds.includes(component.id));
    const edit = selectedBlocks.has(block.id) ? edits[block.id] : null;
    zones[position] = edit ? edit.layers : block.layers;
    if (edit) changed = true;
  }
  if (!changed) return [];
  const layers = [...zones.above, ...zones.structure, ...zones.below].map((layer, order) => ({ ...layer, order }));
  if (JSON.stringify(layers) === JSON.stringify(component.structure.layers)) return [];
  return [{ id: component.id, layers }];
});
