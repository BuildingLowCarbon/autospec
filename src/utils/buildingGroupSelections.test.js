import { describe, expect, it } from 'vitest';
import { groupBuildingComponents } from './buildingComponentGroups';
import {
  makeGroupCollection, serializeGroupSelection, restoreGroupSelection,
  setGroupIgnored, setGroupSelected, hasSelectedGroup, groupDescriptorIdentity,
} from './buildingGroupSelections';

const component = (id, thickness, impact) => ({
  id, categoryId: 'floor_assembly', gwp_kgco2e_m2: impact,
  structure: { layers: [{ productId: 'wood', isSupportStructure: true, thickness_mm: thickness }] },
});
const components = [component('a', 100, 10), component('b', 100, 20), component('c', 200, 30)];

describe('sélections globales de groupes du bâtiment', () => {
  it('conserve tous les composants et la surface quand une structure change dans l’historique', () => {
    const group = groupBuildingComponents(components.slice(0, 2))[0];
    const saved = serializeGroupSelection(group);
    const updated = [components[0], component('b', 240, 25)];
    const restored = restoreGroupSelection(saved, updated);
    expect(restored.id).toBe(group.id);
    expect(restored.__groupMembers.map((item) => item.id)).toEqual(['a', 'b']);
    expect(restored.__childGroups).toHaveLength(2);
  });
  it('enregistre et restaure les groupes enfants, toutes les variantes et la clé de surface', () => {
    const groups = groupBuildingComponents(components);
    const collection = makeGroupCollection(groups, 'collection-surface-key');
    const restored = restoreGroupSelection(JSON.parse(JSON.stringify(serializeGroupSelection(collection))), components);
    expect(restored.id).toBe('collection-surface-key');
    expect(restored.__childGroups).toHaveLength(2);
    expect(restored.__groupMembers.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignore un enfant en conservant la surface de la collection et sans double comptage', () => {
    const groups = groupBuildingComponents(components);
    const collection = makeGroupCollection(groups, 'keep-this-surface');
    const state = { selectedGroups: [serializeGroupSelection(collection)] };
    const ignored = serializeGroupSelection(groups[0]);
    const next = setGroupIgnored(state, ignored, true);
    expect(next.selectedGroups[0].id).toBe('keep-this-surface');
    expect(next.selectedGroups[0].memberIds).toEqual(['c']);
    expect(next.ignoredGroupIds).toContain(groupDescriptorIdentity(ignored));
    expect(hasSelectedGroup(next, ignored)).toBe(false);
    expect(hasSelectedGroup(state, ignored)).toBe(true);
  });

  it('ne duplique pas un enfant déjà inclus et permet de le sélectionner après exclusion', () => {
    const groups = groupBuildingComponents(components);
    const child = serializeGroupSelection(groups[0]);
    const state = { selectedGroups: [serializeGroupSelection(makeGroupCollection(groups, 'all'))] };
    expect(setGroupSelected(state, child, true).selectedGroups).toHaveLength(1);
    const ignored = setGroupIgnored(state, child, true);
    const selected = setGroupSelected(ignored, child, true);
    expect(selected.selectedGroups).toHaveLength(2);
    expect(selected.ignoredGroupIds).toEqual([]);
  });

  it('supprime la collection lorsque son dernier groupe est ignoré', () => {
    const groups = groupBuildingComponents(components.slice(0, 2));
    const state = { selectedGroups: [serializeGroupSelection(makeGroupCollection(groups, 'one'))] };
    expect(setGroupIgnored(state, serializeGroupSelection(groups[0]), true).selectedGroups).toEqual([]);
  });
});
