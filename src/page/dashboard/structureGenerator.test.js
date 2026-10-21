import { describe, expect, it } from 'vitest';
import { buildVariantCandidates, componentCompositionSignature, deriveLayerGroups, expandLayerGroupVariants, expandStructureGroupVariants } from './structureGenerator';

const support = { productId: 'concrete', thickness_mm: 250, isSupportStructure: true, layerFunctionId: 'structure' };
const insulation = { productId: 'xps', thickness_mm: 120, layerFunctionId: 'insulation', insulationTypeId: 'xps' };
const component = { id: 'a', categoryId: 'foundation', structure: { layers: [insulation, support] } };

describe('générateur de variantes structurelles', () => {
  it('garde les différentes couches intégrées comme variantes de la structure', () => {
    const timber = { ...support, productId: 'joist', width_mm: 80, spacing_mm: 600 };
    const variants = ['wool', 'cellulose'].map((id) => ({ id, categoryId: 'floor_assembly', structure: { layers: [timber, { productId: id, thickness_mm: 180, structure: 'in-lying' }] } }));
    const expanded = expandStructureGroupVariants({ key: 'floor', variants });
    expect(expanded).toHaveLength(2);
    const candidates = buildVariantCandidates({ categoryId: 'floor_assembly', structures: [{ key: 'floor', variants }] });
    expect(candidates.map((candidate) => candidate.component.structure.layers[1].productId)).toEqual(['wool', 'cellulose']);
  });

  it('permet de rendre une variante continue et de changer la disposition et les fibres', () => {
    const [base, variant] = expandLayerGroupVariants({ id: 'layer', layers: [{ ...support, width_mm: 80, spacing_mm: 600, fiberDirection: 'quer', variants: [{ width_mm: null, spacing_mm: null, fiberDirection: 'lengthwise', structure: 'in-lying', overrides: ['width_mm', 'spacing_mm', 'fiberDirection', 'structure'] }] }] });
    expect(base.layers[0].width_mm).toBe(80);
    expect(variant.layers[0]).toMatchObject({ width_mm: null, spacing_mm: null, fiberDirection: 'lengthwise', structure: 'in-lying' });
  });

  it('rend les groupes périphériques réutilisables par catégorie et position', () => {
    const groups = deriveLayerGroups([component]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ categoryId: 'foundation', position: 'above' });
  });

  it('détecte une composition qui existe déjà', () => {
    const structureGroup = { label: '250 mm', variants: [{ ...component, structure: { layers: [support] } }] };
    const upper = { id: 'upper', name: 'XPS', layers: [insulation] };
    const [candidate] = buildVariantCandidates({
      categoryId: 'foundation', structures: [structureGroup], upperGroups: [upper], existingComponents: [component],
    });
    expect(candidate.exists).toBe(true);
    expect(candidate.updateRequired).toBe(false);
    expect(componentCompositionSignature(candidate.component)).toBe(componentCompositionSignature(component));
  });

  it('propose une mise à jour sans recréer si seuls le rôle ou l’eCCC diffèrent', () => {
    const existing = {
      id: 'existing',
      categoryId: 'foundation',
      source: { databaseId: 'minergie' },
      structure: { layers: [{ ...support, layerFunctionId: 'other', isSupportStructure: false, ecccId: 'C01.01' }] },
    };
    const structureGroup = {
      label: '250 mm',
      variants: [{ ...component, structure: { layers: [{ ...support, layerFunctionId: 'structure', ecccId: 'C01.03' }] } }],
    };
    const [candidate] = buildVariantCandidates({
      categoryId: 'foundation', structures: [structureGroup], existingComponents: [existing],
    });
    expect(candidate.exists).toBe(true);
    expect(candidate.updateRequired).toBe(true);
    expect(candidate.metadataUpdates[0].changes[0]).toMatchObject({
      layerIndex: 0,
      fromRole: 'other',
      toRole: 'structure',
      fromEcccId: 'C01.01',
      toEcccId: 'C01.03',
    });
  });

  it('produit le produit cartésien des sélections', () => {
    const structures = [1, 2].map((value) => ({ label: String(value), variants: [{ id: String(value), categoryId: 'foundation', structure: { layers: [{ ...support, thickness_mm: value * 100 }] } }] }));
    const upperGroups = [1, 2].map((value) => ({ id: `u${value}`, name: `U${value}`, layers: [{ ...insulation, thickness_mm: value * 20 }] }));
    const lowerGroups = [{ id: 'l1', name: 'L1', layers: [{ productId: 'finish', thickness_mm: 10 }] }];
    expect(buildVariantCandidates({ categoryId: 'foundation', structures, upperGroups, lowerGroups })).toHaveLength(4);
  });

  it('développe les variantes de matériau et d’épaisseur de chaque couche', () => {
    const group = {
      id: 'upper', name: 'Complexe supérieur', layers: [
        { productId: 'insulation-a', thickness_mm: 100, variants: [{ productId: 'insulation-b' }, { thickness_mm: 140 }] },
        { productId: 'screed-a', thickness_mm: 50, variants: [{ thickness_mm: 70 }] },
      ],
    };
    const expanded = expandLayerGroupVariants(group);
    expect(expanded).toHaveLength(6);
    expect(expanded.every((item) => item.layers.every((itemLayer) => itemLayer.variants === undefined))).toBe(true);
  });

  it('applique aussi les variantes de rôle et d’eCCC', () => {
    const group = {
      id: 'upper',
      name: 'Couche',
      layers: [{
        productId: 'board', thickness_mm: 20, layerFunctionId: 'covering', ecccId: 'G03.01',
        variants: [{ layerFunctionId: 'bracing', ecccId: 'C02.01', ecccDescription: 'Paroi' }],
      }],
    };
    const expanded = expandLayerGroupVariants(group);
    expect(expanded[1].layers[0]).toMatchObject({ layerFunctionId: 'bracing', ecccId: 'C02.01', ecccDescription: 'Paroi' });
  });

  it('développe aussi les variantes de la structure porteuse', () => {
    const structureGroup = {
      key: 'foundation::250', label: 'h 250 mm',
      variants: [{ id: 'base', categoryId: 'foundation', structure: { layers: [support] } }],
      structureVariantConfig: {
        id: 'structure-variants', layers: [{ ...support, variants: [{ productId: 'concrete-b' }, { thickness_mm: 300 }] }],
      },
    };
    const expanded = expandStructureGroupVariants(structureGroup);
    expect(expanded).toHaveLength(3);
    expect(expanded[1].variants[0].structure.layers[0].productId).toBe('concrete-b');
    expect(expanded[2].variants[0].structure.layers[0].thickness_mm).toBe(300);
  });
});
