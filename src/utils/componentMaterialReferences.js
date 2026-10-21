// Only explicit catalogue correspondences are used: a KBOB code alone is not
// enough to choose between materials with different physical properties.
export const createMaterialReferenceResolver = (materials = [], products = [], mappings = []) => {
  const catalog = new Map([...materials, ...products].map((item) => [String(item.id), item]));
  const mappedIds = new Map(mappings.filter((item) => item.lignumId && item.tbzId)
    .map((item) => [String(item.lignumId), String(item.tbzId)]));
  const layer = (source) => {
    const reference = source.productId || source.materialId;
    const mapped = reference && !catalog.has(String(reference)) ? mappedIds.get(String(reference)) : null;
    const target = reference && catalog.get(mapped || String(reference));
    const result = target ? {
      ...source,
      ...(mapped ? { sourceProductId: source.sourceProductId || reference } : {}),
      productId: target.id,
      ...(source.materialId ? { materialId: target.id } : {}),
      kbobId: target.kbobId || null,
    } : { ...source };
    if (source.variants) result.variants = source.variants.map(layer);
    return result;
  };
  const component = (source) => ({
    ...source,
    structure: { ...source.structure, layers: (source.structure?.layers || []).map(layer) },
  });
  return { catalog, layer, component };
};
