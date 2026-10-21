const assert = require('node:assert/strict');
const test = require('node:test');
const { restoreDetails } = require('./restoreLignumDetails');

const component = (layer) => ({ id: 'wall', gwp_kgco2e_m2: 15, structure: { layers: [{
  order: 0, productId: 'wood', thickness_mm: 100, structure: 'on-lying', ...layer,
}] } });
const snapshot = (layer, timestamp = 1) => ({ file: `backup-${timestamp}`, timestamp, items: [component(layer)] });

test('restaure les détails manquants les plus récents sans toucher aux valeurs existantes', () => {
  const current = [component({ ecccId: 'C02.01', isSupportStructure: false })];
  const { items, changes } = restoreDetails(current, [
    snapshot({ ecccId: 'old', layerFunctionId: 'insulation', insulationTypeId: 'mineral_wool' }),
    snapshot({ ecccId: 'C02.01', ecccDescription: 'Paroi', layerFunctionId: 'covering' }, 2),
  ]);
  const layer = items[0].structure.layers[0];
  assert.equal(layer.ecccId, 'C02.01');
  assert.equal(layer.isSupportStructure, false);
  assert.equal(layer.layerFunctionId, 'covering');
  assert.equal(layer.ecccDescription, 'Paroi');
  assert.equal(layer.insulationTypeId, undefined);
  assert.equal(items[0].gwp_kgco2e_m2, 15);
  assert.equal(current[0].structure.layers[0].layerFunctionId, undefined);
  assert.equal(changes.length, 2);
  assert.equal(restoreDetails(items, [snapshot(layer)]).changes.length, 0);
});

test('ignore les couches dont le matériau ou les dimensions ont changé', () => {
  for (const layer of [{ productId: 'other' }, { thickness_mm: 200 }, { width_mm: 50 }, { order: 1 }]) {
    assert.equal(restoreDetails([component({})], [snapshot({ ...layer, ecccId: 'old' })]).changes.length, 0);
  }
});

test('ne mélange pas les descriptions eCCC et ne réactive pas une structure décochée', () => {
  const { items } = restoreDetails([component({ ecccId: 'new', isSupportStructure: false })], [
    snapshot({ ecccId: 'old', ecccDescription: 'Ancien', layerFunctionId: 'structure', isSupportStructure: true }),
  ]);
  const layer = items[0].structure.layers[0];
  assert.equal(layer.ecccDescription, undefined);
  assert.equal(layer.layerFunctionId, undefined);
  assert.equal(layer.isSupportStructure, false);
});
