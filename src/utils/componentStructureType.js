import constructionSystemsData from '../data/construction_systems.json';

const STRUCTURE_TYPE_LABELS = Object.fromEntries(
  (constructionSystemsData?.systems ?? []).map((system) => [system.id, system.label ?? {}]),
);

export const COMPONENT_STRUCTURE_SYSTEM_IDS = Object.keys(STRUCTURE_TYPE_LABELS);

export const getComponentStructureTypeId = (item) =>
  item?.structure?.systemTypeId ?? item?.structure?.typeId ?? null;

export const getComponentStructureTypeLabel = (systemTypeId, lang = 'fr') => {
  const labels = STRUCTURE_TYPE_LABELS[systemTypeId];
  if (labels) return labels[lang] ?? labels.fr ?? labels.en;
  return String(systemTypeId ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export const normalizeComponentStructureType = (component) => {
  if (!component?.structure || component.structure.systemTypeId !== undefined) return component;
  if (component.structure.typeId === undefined) return component;
  const structure = { ...component.structure, systemTypeId: component.structure.typeId };
  delete structure.typeId;
  return { ...component, structure };
};

export const getComponentStructureTypeOptions = (items, lang = 'fr') =>
  [...new Set((items ?? []).map(getComponentStructureTypeId).filter(Boolean))]
    .map((systemTypeId) => ({ value: systemTypeId, label: getComponentStructureTypeLabel(systemTypeId, lang) }))
    .sort((a, b) => a.label.localeCompare(b.label, lang, { sensitivity: 'base' }));

export const getAllComponentStructureTypeOptions = (lang = 'fr') =>
  COMPONENT_STRUCTURE_SYSTEM_IDS
    .map((systemTypeId) => ({ value: systemTypeId, label: getComponentStructureTypeLabel(systemTypeId, lang) }))
    .sort((a, b) => a.label.localeCompare(b.label, lang, { sensitivity: 'base' }));
