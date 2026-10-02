const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  applyAudit,
  applyMappings,
  buildUnifiedComponents,
  deriveMappings,
  preserveCalculatedIfUnchanged,
  readJson,
  validateComponents,
} = require('./lignumDatabase');

const dbDir = path.resolve(__dirname, '../public/db');
const sourceDir = path.join(dbDir, 'source_database/lignum/components');

test('la conversion JS reproduit exactement components_unified.json', () => {
  const generated = buildUnifiedComponents(
    readJson(path.join(sourceDir, 'Lignum_components_de.json')),
    readJson(path.join(sourceDir, 'Lignum_components_en.json')),
    readJson(path.join(sourceDir, 'Lignum_components_fr.json')),
  );
  assert.deepEqual(generated, readJson(path.join(dbDir, 'components_unified.json')));
});

test('les correspondances historiques recréent une sélection sans id orphelin', () => {
  const unified = readJson(path.join(dbDir, 'components_unified.json'));
  const selected = readJson(path.join(dbDir, 'components_lignum_selected.json'));
  const mappings = deriveMappings(unified, selected);
  assert.ok(mappings.length > 0);
  const selectedIds = new Set(selected.map((item) => String(item.id)));
  const mapped = applyMappings(unified.filter((item) => selectedIds.has(String(item.id))), mappings, true);
  const report = validateComponents(
    mapped,
    readJson(path.join(dbDir, 'materials/tbz_materials.json')),
    readJson(path.join(dbDir, 'products/tbz_products_composites.json')),
  );
  assert.equal(report.summary.unresolvedIds, 0);
  assert.equal(preserveCalculatedIfUnchanged(mapped, selected).length, selected.length);
});

test('updated_at ne change que pour une entrée modifiée', () => {
  const previous = [{ id: 'same', value: 1 }, { id: 'changed', value: 1 }];
  const next = applyAudit([{ id: 'same', value: 1 }, { id: 'changed', value: 2 }], previous, { now: '2026-07-21T13:10:00.000Z' });
  assert.equal(next[0], previous[0]);
  assert.equal(next[1].metadata.updated_at, '2026-07-21T13:10:00.000Z');
  assert.equal(next[1].metadata.version, 1);
});

test('chaque matériau possède les trois blocs de traduction', () => {
  const materials = readJson(path.join(dbDir, 'materials/tbz_materials.json'));
  assert.ok(materials.length > 0);
  materials.forEach((material) => {
    ['de', 'en', 'fr'].forEach((lang) => {
      assert.ok(material.translations?.[lang]);
      assert.ok(Object.prototype.hasOwnProperty.call(material.translations[lang], 'name'));
      assert.ok(Object.prototype.hasOwnProperty.call(material.translations[lang], 'description'));
    });
  });
});

test('le diagnostic utilise les correspondances Lignum et filtre les composants sélectionnés', () => {
  const unified = readJson(path.join(dbDir, 'components_unified.json'));
  const selected = readJson(path.join(dbDir, 'components_lignum_selected.json'));
  const mappings = readJson(path.join(dbDir, 'mappings/lignum_product_tbz.json'));
  const materials = readJson(path.join(dbDir, 'materials/tbz_materials.json'));
  const products = readJson(path.join(dbDir, 'products/tbz_products_composites.json'));
  const selectedIds = new Set(selected.map((item) => String(item.id)));
  const selectedSources = unified.filter((item) => selectedIds.has(String(item.id)));
  const report = validateComponents(selectedSources, materials, products, { mappings, selectedComponents: selected });

  assert.ok(report.summary.unresolvedIds > 0);
  assert.equal(report.unresolved.some((item) => item.referenceId === '0CA06490-CE98-3202-8643-5E1C6EDDA18B'), false);
  report.unresolved.forEach((item) => item.occurrences.forEach((occurrence) => {
    assert.ok(selectedIds.has(String(occurrence.componentId)));
  }));
});
