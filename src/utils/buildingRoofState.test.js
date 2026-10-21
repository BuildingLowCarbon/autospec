import { describe, expect, it } from 'vitest';
import { separateUndergroundRoofState } from './buildingRoofState';

describe('anciens brouillons de toiture souterraine', () => {
  it('conserve la sélection, les filtres et les surfaces lors de la séparation', () => {
    const state = { selectedPart: 'roof', roofType: 'underground', structureTypesByPart: { roof: ['concrete'] }, surfaces: {
      'range:roof': { value: 45, auto: false, partId: 'roof' },
      'component:saved': { value: 12, auto: false, partId: 'roof' },
    }, selectedGroups: [{ id: 'saved' }] };
    const migrated = separateUndergroundRoofState(state);
    expect(migrated.selectedPart).toBe('underground_roofs');
    expect(migrated.roofType).toBe('flat');
    expect(migrated.structureTypesByPart.underground_roofs).toEqual(['concrete']);
    expect(migrated.surfaces['range:underground_roofs']).toEqual({ value: 45, auto: false, partId: 'underground_roofs' });
    expect(migrated.surfaces['component:saved'].value).toBe(12);
    expect(migrated.selectedGroups).toBe(state.selectedGroups);
    expect(state.selectedPart).toBe('roof');
    expect(separateUndergroundRoofState(migrated)).toBe(migrated);
  });

  it('ne change pas les bâtiments utilisant déjà des toits hors-sol', () => {
    const state = { roofType: 'pitched', selectedPart: 'floors' };
    expect(separateUndergroundRoofState(state)).toBe(state);
  });
});
