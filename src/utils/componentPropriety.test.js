import { describe, expect, test } from 'vitest';
import { calculateComponentProperties, calculateComponentThermalDetails } from './componentPropriety';

const materials = [
  { id: 'wood', workingtitle: 'Wood', thermalConductivity_W_mK: 0.13 },
  { id: 'insulation', workingtitle: 'Insulation', thermalConductivity_W_mK: 0.04 },
  { id: 'air', workingtitle: 'Air', thermalConductivity_W_mK: null },
];

const componentWith = (...layers) => ({
  categoryId: 'outer_wall',
  structure: { layers: layers.map((layer, order) => ({ order, ...layer })) },
});

const frame = {
  structure: 'on-lying',
  productId: 'wood',
  thickness_mm: 200,
  width_mm: 50,
  spacing_mm: 500,
};

describe('référence KBOB du matériau lié', () => {
  const material = { id: 'gypsum', kbobId: '03.007.01', density_kg_m3: 1200 };
  const kbob = [{ kbobId: '03.007', ref: 'kg', gwp: 0.552 }, { kbobId: '03.007.01', ref: 'kg', gwp: 0.335 }];
  const panel = { productId: 'gypsum', structure: 'on-lying', thickness_mm: 15, ecccId: 'G03.01' };
  const options = { componentServiceLifeYears: 60, categories: [{ id: 'outer_wall', eccc: [{ ecccId: 'G03.01', serviceLife: 30 }] }] };

  test('donne le même impact avec ou sans ancienne référence KBOB dans la couche', () => {
    const calculate = (layer) => calculateComponentProperties(componentWith(layer), [material], [], kbob, options);
    const stale = calculate({ ...panel, kbobId: '03.007' });
    const inherited = calculate(panel);
    expect(stale.gwp_kgco2e_m2).toBeCloseTo(12.06);
    expect(stale.gwp_kgco2e_m2).toBe(inherited.gwp_kgco2e_m2);
    expect(stale.structure.layers[0].kbobId).toBe('03.007.01');
  });

  test('suit une modification du KBOB dans le matériau même après un précédent recalcul', () => {
    const original = calculateComponentProperties(componentWith({ ...panel, kbobId: '03.007' }), [{ ...material, kbobId: '03.007' }], [], kbob, options);
    const updated = calculateComponentProperties(original, [material], [], kbob, options);
    expect(original.gwp_kgco2e_m2).toBeCloseTo(19.872);
    expect(updated.gwp_kgco2e_m2).toBeCloseTo(12.06);
    expect(updated.structure.layers[0].kbobId).toBe('03.007.01');
  });

  test('applique la même priorité aux produits', () => {
    const product = { id: 'gypsum', kbobId: '03.007.01', declaredProperties: { density_kg_m3: 1200 } };
    const result = calculateComponentProperties(componentWith({ ...panel, kbobId: '03.007' }), [], [product], kbob, options);
    expect(result.gwp_kgco2e_m2).toBeCloseTo(12.06);
    expect(result.structure.layers[0].kbobId).toBe('03.007.01');
  });

  test('n’utilise pas une ancienne référence si le nouveau matériau n’en a pas', () => {
    const result = calculateComponentProperties(componentWith({ ...panel, kbobId: '03.007' }), [{ ...material, kbobId: null }], [], kbob, options);
    expect(result.gwp_kgco2e_m2).toBe(0);
    expect(result.structure.layers[0].kbobId).toBeNull();
  });

  test('conserve la référence de couche comme secours lorsqu’aucun matériau ne peut être résolu', () => {
    const result = calculateComponentProperties(componentWith({ ...panel, productId: null, kbobId: 'surface' }), [], [], [{ kbobId: 'surface', ref: 'm2', gwp: 10 }], options);
    expect(result.gwp_kgco2e_m2).toBe(20);
    expect(result.structure.layers[0].kbobId).toBe('surface');
  });
});

describe('impact des références KBOB selon la surface occupée', () => {
  const material = { id: 'panel', kbobId: 'test', density_kg_m3: 1000 };
  const kbob = [{ kbobId: 'test', ref: 'm2', gwp: 40 }];
  const panel = { productId: 'panel', structure: 'on-lying', thickness_mm: 10 };
  const calculate = (layers, options = {}) => calculateComponentProperties(componentWith(...layers), [material], [], kbob, options);

  test('conserve l’impact entier des couches continues', () => {
    expect(calculate([panel]).gwp_kgco2e_m2).toBe(40);
    expect(calculate([{ ...panel, width_mm: 1000, spacing_mm: 1000 }]).gwp_kgco2e_m2).toBe(40);
  });

  test('multiplie une référence au m² par le rapport largeur / entraxe', () => {
    const result = calculate([{ ...panel, width_mm: 100, spacing_mm: 500 }]);
    expect(result.structure.layers[0].baseGwp_kgco2e_m2).toBe(8);
    expect(result.gwp_kgco2e_m2).toBe(8);
  });

  test('applique le facteur de remplacement après la fraction de surface', () => {
    const result = calculate([{ ...panel, width_mm: 100, spacing_mm: 500, ecccId: 'E02.03' }], {
      categories: [{ id: 'outer_wall', eccc: [{ ecccId: 'E02.03', serviceLife: 30 }] }], componentServiceLifeYears: 60,
    });
    expect(result.structure.layers[0].baseGwp_kgco2e_m2).toBe(8);
    expect(result.structure.layers[0].replacementFactor).toBe(2);
    expect(result.gwp_kgco2e_m2).toBe(16);
  });

  test('retient la fraction complémentaire pour les couches entre éléments porteurs', () => {
    const host = { productId: 'host', structure: 'on-lying', thickness_mm: 100, width_mm: 100, spacing_mm: 500 };
    const result = calculate([host, { ...panel, structure: 'in-lying' }]);
    expect(result.structure.layers[1].baseGwp_kgco2e_m2).toBe(32);
    expect(result.gwp_kgco2e_m2).toBe(32);
  });

  test('borne la fraction entre zéro et un', () => {
    expect(calculate([{ ...panel, width_mm: 700, spacing_mm: 500 }]).gwp_kgco2e_m2).toBe(40);
    expect(calculate([{ ...panel, width_mm: 0, spacing_mm: 500 }]).gwp_kgco2e_m2).toBe(0);
  });

  test('ne modifie pas la référence au m² selon l’épaisseur', () => {
    const spaced = { ...panel, width_mm: 100, spacing_mm: 500 };
    expect(calculate([spaced]).gwp_kgco2e_m2).toBe(calculate([{ ...spaced, thickness_mm: 20 }]).gwp_kgco2e_m2);
  });

  test('laisse inchangés les calculs des références par kg et par m³', () => {
    const component = componentWith({ ...panel, width_mm: 100, spacing_mm: 500 });
    expect(calculateComponentProperties(component, [material], [], [{ kbobId: 'test', ref: 'kg', gwp: 3 }]).gwp_kgco2e_m2).toBeCloseTo(6);
    expect(calculateComponentProperties(component, [material], [], [{ kbobId: 'test', ref: 'm3', gwp: 200 }]).gwp_kgco2e_m2).toBeCloseTo(0.4);
  });
});

describe('calcul thermique des couches parallèles', () => {
  test('utilise Rair = 0,18 pour une cavité entièrement vide', () => {
    const details = calculateComponentThermalDetails(componentWith(frame), materials);
    const parallel = details.resistanceTerms[0];
    const cavity = parallel.paths[1];

    expect(parallel.complete).toBe(true);
    expect(cavity.layer).toBeNull();
    expect(cavity.airResistance_m2K_W).toBe(0.18);
    expect(cavity.resistance_m2K_W).toBe(0.18);
    expect(parallel.equivalentResistance_m2K_W).toBeCloseTo(
      1 / (0.1 / (0.2 / 0.13) + 0.9 / 0.18),
      10,
    );
  });

  test('additionne en série le remplissage partiel et la lame d’air', () => {
    const fill = { structure: 'in-lying', productId: 'insulation', thickness_mm: 100 };
    const details = calculateComponentThermalDetails(componentWith(frame, fill), materials);
    const cavity = details.resistanceTerms[0].paths[1];

    expect(cavity.materialResistance_m2K_W).toBeCloseTo(0.1 / 0.04, 10);
    expect(cavity.airResistance_m2K_W).toBe(0.18);
    expect(cavity.resistance_m2K_W).toBeCloseTo(0.1 / 0.04 + 0.18, 10);
  });

  test('n’ajoute pas de lame d’air lorsque le remplissage est complet', () => {
    const fill = { structure: 'in-lying', productId: 'insulation', thickness_mm: 200 };
    const details = calculateComponentThermalDetails(componentWith(frame, fill), materials);
    const cavity = details.resistanceTerms[0].paths[1];

    expect(cavity.airResistance_m2K_W).toBe(0);
    expect(cavity.resistance_m2K_W).toBeCloseTo(0.2 / 0.04, 10);
  });

  test('reconnaît un matériau air sans conductivité thermique', () => {
    const fill = { structure: 'in-lying', productId: 'air', thickness_mm: 200 };
    const details = calculateComponentThermalDetails(componentWith(frame, fill), materials);
    const cavity = details.resistanceTerms[0].paths[1];

    expect(details.resistanceTerms[0].complete).toBe(true);
    expect(cavity.isAirLayer).toBe(true);
    expect(cavity.resistance_m2K_W).toBe(0.18);
  });
});
