const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSystemComponentCreation } = require('./systemComponentCreation');

const databases = [
  { file: 'components_custom.json', label: 'Custom', items: [{ id: 'custom-existing' }] },
  { file: 'components_lignum_selected.json', label: 'Lignum', items: [{ id: 'source-existing' }] },
];
const input = (extra = {}) => ({
  actor: { role: 'admin' }, file: 'components_custom.json', databases,
  component: { id: 'new-id', categoryId: 'underground_roof', structure: { layers: [] } }, ...extra,
});

test('un administrateur peut choisir une base système sans modifier les composants existants', () => {
  const before = structuredClone(databases);
  const custom = prepareSystemComponentCreation(input());
  assert.equal(custom.source.databaseId, 'custom');
  const lignum = prepareSystemComponentCreation(input({ file: 'components_lignum_selected.json' }));
  assert.equal(lignum.source.databaseId, 'lignum');
  assert.equal(lignum.categoryId, 'underground_roof');
  assert.deepEqual(databases, before);
});

test('refuse un utilisateur non administrateur et une destination arbitraire', () => {
  assert.throws(() => prepareSystemComponentCreation(input({ actor: { role: 'user', permissions: ['dashboard'] } })), { statusCode: 403 });
  assert.throws(() => prepareSystemComponentCreation(input({ actor: null })), { statusCode: 403 });
  assert.throws(() => prepareSystemComponentCreation(input({ file: '../other.json' })), { statusCode: 400 });
});

test('refuse les identifiants existants dans toute base, sans écrasement', () => {
  for (const id of ['custom-existing', 'source-existing']) {
    assert.throws(() => prepareSystemComponentCreation(input({ component: { ...input().component, id } })), { statusCode: 409 });
  }
});

test('la copie n’hérite ni des droits ni de l’historique de génération de l’original', () => {
  const original = {
    ...input().component, parent: 'original', source: { databaseId: 'old' },
    __isNew: true, __contentId: 'mongo-owner', __ownerId: 'user', __sourceFile: 'other.json',
    generated: true, generationRunId: 'old-run', generationSignature: 'signature', generatedAt: 'yesterday', metadata: { version: 5 },
  };
  const saved = prepareSystemComponentCreation(input({ component: original }));
  assert.equal(saved.parent, 'original');
  assert.equal(saved.source.databaseId, 'custom');
  for (const field of ['__isNew', '__contentId', '__ownerId', '__sourceFile', 'generated', 'generationRunId', 'generationSignature', 'generatedAt', 'metadata']) {
    assert.equal(saved[field], undefined);
  }
  assert.equal(original.__contentId, 'mongo-owner');
});
