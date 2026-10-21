const assert = require('node:assert/strict');
const test = require('node:test');
const { generationLayerKey, patchGenerationLayers, loadGenerationTools } = require('./generatedComponentsService');
const { reconcileGenerationHistory, planGenerationDeletion } = require('./generatedComponentsService');
const { readJson } = require('./lignumDatabase');
const path = require('path');

const layer = { productId: 'wood', thickness_mm: 200, layerFunctionId: 'structure', isSupportStructure: true };
const components = ['a', 'b', 'outside'].map((id) => ({ id, structure: { layers: [{ ...layer }, { productId: 'cover', thickness_mm: 15 }] } }));
const catalog = new Map([['wood', { id: 'wood', kbobId: 'wood-kbob' }], ['other', { id: 'other', kbobId: 'other-kbob' }]]);

test('un lot sans historique est récupéré une seule fois avec une identité stable', () => {
  const components = [{ id: 'missing-a', generatedAt: '2026-10-20T15:07:00.192Z' }, { id: 'missing-b', generatedAt: '2026-10-20T15:07:00.195Z' }];
  const first = reconcileGenerationHistory(components, []);
  const second = reconcileGenerationHistory(components, first.history);
  assert.equal(first.history.length, 1);
  assert.equal(second.history.length, 1);
  assert.equal(second.history[0].id, first.history[0].id);
  assert.deepEqual(first.history[0].componentIds, ['missing-a', 'missing-b']);
});

test('la suppression retire uniquement les composants possédés et non partagés', () => {
  const run = { id: 'a', componentIds: ['owned', 'shared', 'reused'] };
  const history = [run, { id: 'b', componentIds: ['shared', 'reused'] }];
  const items = [{ id: 'owned', generationRunId: 'a' }, { id: 'shared', generationRunId: 'a' }, { id: 'reused', generationRunId: 'b' }];
  const deletion = planGenerationDeletion(items, history, run);
  assert.deepEqual(deletion.deletedIds, ['owned']);
  assert.deepEqual(deletion.retainedIds, ['shared', 'reused']);
  assert.equal(items.length, 3);
});

test('un changement de paramètre conserve les identifiants et les couches non concernées', () => {
  const result = patchGenerationLayers(components, { componentIds: ['a', 'b'], layerKey: generationLayerKey(layer), patch: { thickness_mm: 240 } }, catalog);
  assert.deepEqual(result.items.map((item) => item.id), ['a', 'b', 'outside']);
  assert.deepEqual(result.changed.map((item) => item.id), ['a', 'b']);
  assert.equal(result.items[0].structure.layers[0].thickness_mm, 240);
  assert.equal(result.items[0].structure.layers[1], components[0].structure.layers[1]);
  assert.equal(result.items[2], components[2]);
  assert.equal(components[0].structure.layers[0].thickness_mm, 200);
});

test('le remplacement de matériau synchronise son KBOB', () => {
  const result = patchGenerationLayers(components, { componentIds: ['a'], layerKey: generationLayerKey(layer), patch: { productId: 'other' } }, catalog);
  assert.equal(result.changed[0].structure.layers[0].kbobId, 'other-kbob');
});

test('les dimensions et les matériaux invalides sont refusés', () => {
  for (const patch of [{ thickness_mm: -1 }, { productId: 'missing' }, { layerFunctionId: 'invalid' }]) {
    assert.throws(() => patchGenerationLayers(components, { componentIds: ['a'], layerKey: generationLayerKey(layer), patch }, catalog));
  }
});

test('le composant signalé retrouve ses matériaux et ses propriétés physiques', async () => {
  const tools = await loadGenerationTools();
  const component = readJson(path.resolve(__dirname, '../public/db/components_generated.json')).find((item) => item.id === '471F807F-1FBB-4E27-899A-024F7150D737');
  assert.ok(component);
  const calculated = tools.recalculate(component);
  const support = calculated.structure.layers.find((item) => item.isSupportStructure);
  assert.equal(support.productId, 'B3C5DBA6-6641-4D75-99AC-9AED033E488F');
  assert.ok(calculated.weight_kg_m2 > 0);
  assert.ok(calculated.gwp_kgco2e_m2 > 0);
  assert.ok(calculated.uValue_W_m2K > 0 && calculated.uValue_W_m2K < 1);
  assert.equal(calculated.id, component.id);
  for (const item of calculated.structure.layers) {
    if (item.productId) assert.ok(tools.catalog.has(item.productId));
  }
});

test('une référence non résolue bloque la génération plutôt que produire un poids nul', async () => {
  const tools = await loadGenerationTools();
  assert.throws(() => tools.recalculate({ id: 'invalid', structure: { layers: [{ productId: 'unknown' }] } }), /introuvables/);
});

test('l’API d’historique refuse une révision périmée et les composants d’un autre lot sans écrire', async () => {
  const { Readable } = require('node:stream');
  const handlers = new Map();
  const app = Object.fromEntries(['use', 'get', 'post', 'put', 'patch', 'delete'].map((method) => [method, (route, ...callbacks) => handlers.set(`${method}:${route}`, callbacks.at(-1))]));
  require('./apiRoutes')(app);
  const { historyPath, generatedPath } = require('./generatedComponentsService');
  const fs = require('fs');
  const historyBefore = fs.readFileSync(historyPath, 'utf8');
  const generatedBefore = fs.readFileSync(generatedPath, 'utf8');
  const run = JSON.parse(historyBefore)[0];
  assert.ok(run);
  const call = (body) => new Promise((resolve, reject) => {
    const req = Readable.from([JSON.stringify(body)]);
    req.params = { id: run.id };
    const res = { statusCode: 200, setHeader() {}, end(text) { resolve({ status: this.statusCode, payload: JSON.parse(text) }); } };
    Promise.resolve(handlers.get('patch:/api/structures/history/:id')(req, res)).catch(reject);
  });
  const stale = await call({ expectedRevision: run.revision - 1 });
  assert.equal(stale.status, 409);
  const wrongLot = await call({ expectedRevision: run.revision, componentIds: ['outside-this-generation'] });
  assert.equal(wrongLot.status, 400);
  assert.equal(fs.readFileSync(historyPath, 'utf8'), historyBefore);
  assert.equal(fs.readFileSync(generatedPath, 'utf8'), generatedBefore);
});
