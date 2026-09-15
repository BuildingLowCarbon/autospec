export const DEFAULT_SUBCATEGORY_BY_CATEGORY = {
  foundation: 'ground_contact',
  floor_assembly: 'standard',
  outer_wall: 'above_ground',
  partition_wall: 'single_shell',
};

const LEGACY_PARTITION_CATEGORIES = [
  'partition_wall_single_shell',
  'partition_wall_double_shell',
];

const legacyPartitionShell = (categoryId) =>
  categoryId === 'partition_wall_double_shell' ? 'double_shell' : 'single_shell';

export const getComponentSubcategoryId = (component) =>
  component?.subcategoryId || DEFAULT_SUBCATEGORY_BY_CATEGORY[component?.categoryId] || null;

export const normalizeComponentTaxonomy = (component) => {
  if (!component || typeof component !== 'object') return component;
  let categoryId = component.categoryId;
  let subcategoryId = component.subcategoryId || null;

  if (LEGACY_PARTITION_CATEGORIES.includes(categoryId)) {
    if (subcategoryId === 'load_bearing') {
      categoryId = 'inner_wall';
      subcategoryId = null;
    } else {
      subcategoryId = legacyPartitionShell(categoryId);
      categoryId = 'partition_wall';
    }
  } else if (categoryId === 'inner_wall') {
    if (subcategoryId === 'non_load_bearing') {
      categoryId = 'partition_wall';
      subcategoryId = 'single_shell';
    } else {
      subcategoryId = null;
    }
  }

  subcategoryId = subcategoryId || DEFAULT_SUBCATEGORY_BY_CATEGORY[categoryId] || null;
  const normalized = { ...component, categoryId };
  if (subcategoryId) normalized.subcategoryId = subcategoryId;
  else delete normalized.subcategoryId;
  return normalized;
};

export const getRequirementCategoryIds = (requirement) => {
  const categoryIds = new Set();
  (requirement?.applies_to ?? []).forEach((target) => {
    if (!LEGACY_PARTITION_CATEGORIES.includes(target?.categoryId)) {
      if (target?.categoryId) categoryIds.add(target.categoryId);
      return;
    }
    if (requirement?.bearing_id === 'bearing') categoryIds.add('inner_wall');
    else if (requirement?.bearing_id === 'non_bearing') categoryIds.add('partition_wall');
    else {
      categoryIds.add('inner_wall');
      categoryIds.add('partition_wall');
    }
  });
  return [...categoryIds];
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
