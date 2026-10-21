const test = require('node:test');
const assert = require('node:assert/strict');
const { completeEccc } = require('./completeLignumEccc');
const codes = [{ id: 'C02.01', name: 'Parois' }, { id: 'E02.03', name: 'Bardages' }];
const layer = { order: 0, productId: 'wood', isSupportStructure: true, translations: { en: { description: 'Support' } } };
const component = (id, extra = {}) => ({ id, categoryId: 'outer_wall', structure: { layers: [{ ...layer, ...extra }] } });

test('complète seulement les correspondances unanimes entre autres composants', () => {
  const current = [component('target')];
  const result = completeEccc(current, [component('donor', { ecccId: 'C02.01' })], codes);
  assert.equal(result.items[0].structure.layers[0].ecccId, 'C02.01');
  assert.equal(result.changes.length, 1);
  assert.equal(current[0].structure.layers[0].ecccId, undefined);
  assert.equal(completeEccc(result.items, [component('donor', { ecccId: 'C02.01' })], codes).changes.length, 0);
});

test('laisse vide en cas de conflit, de matériau différent ou de position différente', () => {
  const current = [component('target')];
  assert.equal(completeEccc(current, [component('a', { ecccId: 'C02.01' }), component('b', { ecccId: 'E02.03' })], codes).changes.length, 0);
  assert.equal(completeEccc(current, [component('a', { productId: 'other', ecccId: 'C02.01' })], codes).changes.length, 0);
  const donor = component('a', { ecccId: 'C02.01', isSupportStructure: false });
  donor.structure.layers.unshift({ order: -1, isSupportStructure: true });
  donor.structure.layers[1].translations = { en: { description: 'Different role' } };
  assert.equal(completeEccc(current, [donor], codes).changes.length, 0);
});

test('ne remplace pas un eCCC existant', () => {
  const current = [component('target', { ecccId: 'E02.03', ecccDescription: 'Conservé' })];
  const result = completeEccc(current, [component('donor', { ecccId: 'C02.01' })], codes);
  assert.deepEqual(result.items, current);
});
