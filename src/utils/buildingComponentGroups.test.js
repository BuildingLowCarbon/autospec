import { describe, expect, it } from 'vitest';
import {
  getInsulationMaterialOptions,
  getScreedMaterialOptions,
  NO_SCREED_MATERIAL,
  getStructureMaterialOptions,
  groupBuildingComponents,
  matchesMaterialFilters,
  selectableItemIdentity,
} from './buildingComponentGroups';

const component = (id, structureProduct, insulationProduct, thickness, layerCount = 2) => ({
  id,
  categoryId: 'floor_assembly',
  thickness_mm: thickness,
  structure: {
    layers: [
      {
        productId: structureProduct,
        isSupportStructure: true,
        thickness_mm: 200,
        width_mm: 80,
        spacing_mm: 600,
        translations: { fr: { name: structureProduct } },
      },
      {
        productId: insulationProduct,
        layerFunctionId: 'insulation',
        thickness_mm: 180,
        translations: { fr: { name: insulationProduct } },
      },
      ...Array.from({ length: Math.max(0, layerCount - 2) }, (_, index) => ({ productId: `finish-${index}` })),
    ],
  },
});

describe('groupes de composants My Buildings', () => {
  it('distingue deux sélections de la même structure selon les composants inclus', () => {
    const first = component('a', 'bois-a', 'laine', 250);
    const second = component('b', 'bois-b', 'cellulose', 600);
    const all = groupBuildingComponents([first, second])[0];
    const reversed = groupBuildingComponents([second, first])[0];
    const subset = groupBuildingComponents([first])[0];
    expect(all.__groupKey).toBe(subset.__groupKey);
    expect(all.id).not.toBe(subset.id);
    expect(all.id).toBe(reversed.id);
    expect(selectableItemIdentity({ ...all, id: 'legacy-saved-id' })).toBe(all.id);
  });

  it('regroupe par dimensions de structure sans tenir compte du matériau', () => {
    const short = component('a', 'bois-a', 'laine', 250, 2);
    const long = component('b', 'bois-b', 'cellulose', 600, 4);
    const groups = groupBuildingComponents([long, short]);
    expect(groups).toHaveLength(1);
    expect(groups[0].__groupMembers).toHaveLength(2);
    expect(groups[0].__representative.id).toBe('a');
  });

  it('expose et applique les matériaux de structure et d’isolation', () => {
    const first = component('a', 'bois-a', 'laine', 250);
    const second = component('b', 'bois-b', 'cellulose', 600);
    expect(getStructureMaterialOptions([first, second]).map((option) => option.value)).toEqual(['bois-a', 'bois-b']);
    expect(getInsulationMaterialOptions([first, second]).map((option) => option.value)).toEqual(['cellulose', 'laine']);
    expect(matchesMaterialFilters(first, ['bois-a'], ['laine'])).toBe(true);
    expect(matchesMaterialFilters(second, ['bois-a'], ['laine'])).toBe(false);
  });

  it('affiche le nom du catalogue plutôt que le nom de la couche', () => {
    const item = component('a', 'bois-a', 'laine', 250);
    item.structure.layers[0].translations.fr.name = 'Couche porteuse';
    item.structure.layers[1].translations.fr.name = 'Isolation entre montants';
    const catalog = {
      materialById: new Map([
        ['bois-a', { id: 'bois-a', translations: { fr: { name: 'Bois massif' } } }],
        ['laine', { id: 'laine', workingtitle: 'Laine minérale' }],
      ]),
      productById: new Map(),
    };
    expect(getStructureMaterialOptions([item], 'fr', catalog)[0].label).toBe('Bois massif');
    expect(getInsulationMaterialOptions([item], 'fr', catalog)[0].label).toBe('Laine minérale');
  });

  it('propose les matériaux de chape pour les planchers et les chapes supplémentaires, avec les noms du catalogue', () => {
    const floor = component('floor', 'bois', 'laine', 300);
    floor.structure.layers.push({ materialId: 'cement', layerFunctionId: 'screed', name: 'Chape' });
    const wall = { ...floor, id: 'wall', categoryId: 'outer_wall' };
    const extraScreed = { ...floor, id: 'extra-screed', categoryId: 'floor_screed' };
    const catalog = { materialById: new Map([['cement', { name: 'Mortier de ciment' }]]) };
    expect(getScreedMaterialOptions([floor, wall], 'fr', catalog))
      .toEqual([{ value: 'cement', label: 'Mortier de ciment' }]);
    expect(getScreedMaterialOptions([wall])).toEqual([]);
    expect(getScreedMaterialOptions([extraScreed], 'fr', catalog))
      .toEqual([{ value: 'cement', label: 'Mortier de ciment' }]);
    expect(matchesMaterialFilters(floor, [], [], ['cement'])).toBe(true);
    expect(matchesMaterialFilters(floor, [], [], ['gypsum'])).toBe(false);
    expect(matchesMaterialFilters(wall, [], [], ['gypsum'])).toBe(true);
    expect(matchesMaterialFilters(extraScreed, [], [], ['cement'])).toBe(true);
    expect(matchesMaterialFilters(extraScreed, [], [], ['gypsum'])).toBe(false);
    expect(matchesMaterialFilters({ ...extraScreed, categoryId: 'floor_covering' }, [], [], ['gypsum'])).toBe(true);
  });

  it('filtre les chapes supplémentaires sans modifier la sélection des matériaux des planchers', () => {
    const screed = (id, material) => ({ id, categoryId: 'floor_screed', structure: { layers: [{ productId: material, layerFunctionId: 'screed' }] } });
    const cement = screed('cement-screed', 'cement');
    const gypsum = screed('gypsum-screed', 'gypsum');
    const byPart = { floors: ['cement'], floor_screed: ['gypsum'] };
    expect([cement, gypsum].filter((item) => matchesMaterialFilters(item, [], [], byPart.floor_screed)).map((item) => item.id)).toEqual(['gypsum-screed']);
    expect(matchesMaterialFilters({ ...cement, categoryId: 'floor_assembly' }, [], [], byPart.floors)).toBe(true);
    expect(getScreedMaterialOptions([{ ...cement, structure: { layers: [] } }])[0].value).toBe(NO_SCREED_MATERIAL);
  });

  it('permet de sélectionner les planchers sans chape et ajuste les plages du groupe', () => {
    const bare = component('bare', 'bois', 'laine', 250);
    const screed = component('screed', 'bois', 'laine', 400);
    screed.structure.layers.push({ materialId: 'cement', layerFunctionId: 'screed' });
    expect(getScreedMaterialOptions([bare]).map((option) => option.value)).toEqual([NO_SCREED_MATERIAL]);
    expect(matchesMaterialFilters(bare, [], [], [NO_SCREED_MATERIAL])).toBe(true);
    expect(matchesMaterialFilters(screed, [], [], [NO_SCREED_MATERIAL])).toBe(false);
    const filtered = [bare, screed].filter((item) => matchesMaterialFilters(item, [], [], ['cement']));
    expect(groupBuildingComponents(filtered)[0].__groupMembers.map((item) => item.id)).toEqual(['screed']);
    expect(matchesMaterialFilters(bare, [], [], [])).toBe(true);
  });
});
