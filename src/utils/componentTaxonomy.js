export const DEFAULT_SUBCATEGORY_BY_CATEGORY = {
  foundation: 'ground_contact',
  floor_assembly: 'standard',
  outer_wall: 'above_ground',
};

export const getComponentSubcategoryId = (component) =>
  component?.subcategoryId || DEFAULT_SUBCATEGORY_BY_CATEGORY[component?.categoryId] || null;

export const normalizeComponentTaxonomy = (component) => {
  if (!component || typeof component !== 'object') return component;
  const subcategoryId = getComponentSubcategoryId(component);
  return subcategoryId && !component.subcategoryId
    ? { ...component, subcategoryId }
    : component;
};

export const componentMatchesTaxonomy = (component, categories = [], subcategories = []) => {
  if (!categories.includes(component?.categoryId)) return false;
  if (!subcategories?.length) return true;
  return subcategories.includes(getComponentSubcategoryId(component));
};

export const getSubcategoryLabel = (category, subcategoryId, lang = 'fr') => {
  const subcategory = category?.subcategories?.find((item) => item.id === subcategoryId);
  return subcategory?.label?.[lang] ?? subcategory?.label?.fr ?? subcategory?.label?.en ?? subcategoryId ?? '';
};
