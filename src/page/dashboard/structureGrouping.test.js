import { describe, expect, it } from 'vitest';
import { groupComponentsByStructure, isSupportStructureLayer, layerRole, splitLayersAroundStructure } from './structureGrouping';

const layer = (description, dimensions = {}, productId = description) => ({
  productId,
  translations: { fr: { name: productId, description } },
  ...dimensions,
});

const component = (id, categoryId, supportDimensions, extraLayers = []) => ({
  id,
  categoryId,
  structure: { layers: [
    layer('Couche posée dessus', { thickness_mm: 20 }, `top-${id}`),
    layer('Structure support', supportDimensions, 'joist'),
    ...extraLayers,
  ] },
});

describe('regroupement des structures', () => {
  it('regroupe uniquement par catégorie et dimensions sans tenir compte des produits ni des couches périphériques', () => {
    const groups = groupComponentsByStructure([
      component('a', 'floor_assembly', { thickness_mm: 240, width_mm: 80, spacing_mm: 625 }),
      {
        ...component('b', 'floor_assembly', { thickness_mm: 240, width_mm: 80, spacing_mm: 625 }, [layer('Isolation', { thickness_mm: 200 }, 'wool')]),
        structure: { layers: [
          layer('Couche posée dessus', { thickness_mm: 20 }, 'different-top'),
          layer('Structure support', { thickness_mm: 240, width_mm: 80, spacing_mm: 625 }, 'different-structural-product'),
          layer('Isolation', { thickness_mm: 200 }, 'wool'),
        ] },
      },
      component('c', 'floor_assembly', { thickness_mm: 280, width_mm: 80, spacing_mm: 625 }),
      component('d', 'steep_roof', { thickness_mm: 240, width_mm: 80, spacing_mm: 625 }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.variants.some((item) => item.id === 'a')).variants.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('reconnaît la structure explicite et sépare les couches autour et dans celle-ci', () => {
    const item = component('a', 'floor_assembly', { thickness_mm: 240, width_mm: 80, spacing_mm: 600 }, [
      { ...layer('Amortissement de la cavité', { thickness_mm: 200 }, 'wool'), structure: 'in-lying' },
      layer('Parement de plafond', { thickness_mm: 15 }, 'board'),
    ]);
    const split = splitLayersAroundStructure(item);
    expect(isSupportStructureLayer(split.support[0])).toBe(true);
    expect(split.above).toHaveLength(1);
    expect(split.within).toHaveLength(1);
    expect(split.below).toHaveLength(1);
    expect(layerRole(split.within[0])).toBe('insulation');
  });

  it('garde le remplissage des lattes de façade au-dessus de la paroi pleine', () => {
    const item = { structure: { layers: [
      layer('Lattes', { width_mm: 60, spacing_mm: 600 }),
      layer('Isolation', { structure: 'in-lying', thickness_mm: 80 }),
      layer('Structure support', { thickness_mm: 200 }),
    ] } };
    const split = splitLayersAroundStructure(item);
    expect(split.above).toHaveLength(2);
    expect(split.within).toHaveLength(0);
    expect(split.core).toHaveLength(1);
  });

  it('normalise les anciennes catégories de cloisons avant le regroupement', () => {
    const [group] = groupComponentsByStructure([
      component('a', 'partition_wall_double_shell', { thickness_mm: 100 }),
    ]);
    expect(group.categoryId).toBe('partition_wall');
    expect(group.variants[0].subcategoryId).toBe('double_shell');
  });

  it('regroupe une couche 1000/1000 avec la même couche continue', () => {
    const continuous = component('continuous', 'floor_assembly', { thickness_mm: 200, width_mm: null, spacing_mm: null });
    const legacy = component('legacy', 'floor_assembly', { thickness_mm: 200, width_mm: 1000, spacing_mm: 1000 });
    const groups = groupComponentsByStructure([continuous, legacy]);
    expect(groups).toHaveLength(1);
    expect(groups[0].variants).toHaveLength(2);
  });

  it('sépare les structures identiques par sous-catégorie lorsque demandé', () => {
    const standard = { ...component('standard', 'floor_assembly', { thickness_mm: 200 }), subcategoryId: 'standard' };
    const unheated = { ...component('unheated', 'floor_assembly', { thickness_mm: 200 }), subcategoryId: 'against_unheated' };
    const groups = groupComponentsByStructure([standard, unheated], { separateSubcategories: true });
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.subcategoryId).sort()).toEqual(['against_unheated', 'standard']);
  });

  it('respecte une exclusion explicite malgré l’ancien libellé Structure support', () => {
    const legacy = layer('Structure support', { thickness_mm: 200 });
    expect(isSupportStructureLayer(legacy)).toBe(true);
    expect(isSupportStructureLayer({ ...legacy, isSupportStructure: false })).toBe(false);
  });
});
