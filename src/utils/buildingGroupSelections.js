import { groupComponentsByStructure } from '../page/dashboard/structureGrouping';
import { structureGroupSelectionId, toSelectableStructureGroup } from './buildingComponentGroups';

export const groupDescriptorIdentity = (group) => structureGroupSelectionId(group.key, (group.memberIds || []).map((id) => ({ id })));

export const serializeGroupSelection = (item) => ({
  id: item.id,
  key: item.__groupKey,
  selectionNumber: item.__groupSelectionNumber || 1,
  memberIds: (item.__groupMembers || []).map((member) => member.id),
  filterSummary: item.__filterSummary || [],
  ...(item.__isGroupCollection ? { children: item.__childGroups.map(serializeGroupSelection) } : {}),
});

export const restoreGroupSelection = (saved, components, lang = 'fr') => {
  if (saved.children) {
    const children = saved.children.map((child) => restoreGroupSelection(child, components, lang)).filter(Boolean);
    return children.length ? makeGroupCollection(children, saved.id) : null;
  }
  const byId = new Map(components.map((item) => [String(item.id), item]));
  const members = (saved.memberIds || []).map((id) => byId.get(String(id))).filter(Boolean);
  const groups = groupComponentsByStructure(members);
  const group = groups.find((entry) => entry.key === saved.key) || groups[0];
  if (!group) return null;
  // A history edit can change the dimensions of only part of a saved selection.
  // Keep all selected component IDs and the common surface rather than silently
  // dropping variants that now belong to another structure group.
  if (groups.length > 1) {
    return makeGroupCollection(groups.map((entry) => toSelectableStructureGroup(entry, lang)), saved.id);
  }
  const restored = toSelectableStructureGroup(group, lang);
  return { ...restored, id: saved.id || restored.id, __groupSelectionNumber: saved.selectionNumber || 1, __filterSummary: saved.filterSummary || [] };
};

export const makeGroupCollection = (children, id = `group-collection:${globalThis.crypto.randomUUID()}`) => {
  const members = [...new Map(children.flatMap((child) => child.__groupMembers).map((member) => [String(member.id), member])).values()];
  const title = `Groupes filtrés (${children.length} groupes, ${members.length} variantes)`;
  return {
    ...children[0], id,
    __isGroupCollection: true,
    __childGroups: children,
    __groupMembers: members,
    __groupTitle: title,
    translations: Object.fromEntries(['fr', 'de', 'en', 'it'].map((lang) => [lang, { name: title }])),
  };
};

export const hasSelectedGroup = (state, descriptor) => (state.selectedGroups || []).some((selection) =>
  (selection.children || [selection]).some((child) => groupDescriptorIdentity(child) === groupDescriptorIdentity(descriptor)));

const removeFromSelections = (selections, identity) => selections.flatMap((selection) => {
  if (!selection.children) return groupDescriptorIdentity(selection) === identity ? [] : [selection];
  const children = selection.children.filter((child) => groupDescriptorIdentity(child) !== identity);
  if (!children.length) return [];
  return [{ ...selection, children, memberIds: [...new Set(children.flatMap((child) => child.memberIds))] }];
});

export const setGroupSelected = (state, descriptor, selected) => {
  const identity = groupDescriptorIdentity(descriptor);
  const selections = state.selectedGroups || [];
  const next = selected
    ? hasSelectedGroup(state, descriptor) ? selections : [...selections, {
      ...descriptor,
      selectionNumber: 1 + Math.max(0, ...selections.filter((group) => group.key === descriptor.key).map((group) => group.selectionNumber || 1)),
    }]
    : removeFromSelections(selections, identity);
  return { ...state, selectedGroups: next, ignoredGroupIds: selected ? (state.ignoredGroupIds || []).filter((id) => id !== identity) : state.ignoredGroupIds || [] };
};

export const setGroupIgnored = (state, descriptor, ignored) => {
  const identity = groupDescriptorIdentity(descriptor);
  const next = ignored ? setGroupSelected(state, descriptor, false) : state;
  const ignoredIds = new Set(state.ignoredGroupIds || []);
  if (ignored) ignoredIds.add(identity); else ignoredIds.delete(identity);
  return { ...next, ignoredGroupIds: [...ignoredIds] };
};

// Temporary drafts also preserve unsaved edits when visiting a group or component.
export const readBuildingDraft = (key) => {
  try { return key ? JSON.parse(sessionStorage.getItem(key) || 'null') : null; } catch { return null; }
};
export const writeBuildingDraft = (key, draft) => {
  try { if (key) sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* The editor remains usable without session storage. */ }
};
