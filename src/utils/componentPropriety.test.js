import { describe, expect, test } from 'vitest';
import { calculateComponentThermalDetails } from './componentPropriety';

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
