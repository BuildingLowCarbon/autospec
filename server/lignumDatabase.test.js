const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  applyAudit,
  applyMappings,
  buildUnifiedComponents,
  deriveMappings,
  normalizeContinuousDimensions,
  preserveSelectedComponents,
  readJson,
  validateComponents,
} = require('./lignumDatabase');

const dbDir = path.resolve(__dirname, '../public/db');
const sourceDir = path.join(dbDir, 'source_database/lignum/components');

test('une largeur et un entraxe de 1000 mm représentent une couche continue', () => {
  assert.deepEqual(normalizeContinuousDimensions(1000, 1000), { width_mm: null, spacing_mm: null });
  assert.deepEqual(normalizeContinuousDimensions('1000', '625'), { width_mm: 1000, spacing_mm: 625 });
});

test('la conversion JS reproduit exactement components_unified.json', () => {
  const generated = buildUnifiedComponents(
    readJson(path.join(sourceDir, 'Lignum_components_de.json')),
    readJson(path.join(sourceDir, 'Lignum_components_en.json')),
    readJson(path.join(sourceDir, 'Lignum_components_fr.json')),
  );
  const activeWithoutAudit = readJson(path.join(dbDir, 'components_unified.json')).map((item) => {
    const { metadata, updated_at, ...component } = item;
    return component;
  });
  assert.deepEqual(generated, activeWithoutAudit);
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
  assert.equal(preserveSelectedComponents(mapped, selected, (component) => component).length, selected.length);
});

test('enregistrer une sélection conserve les calculs et modifications des composants existants', () => {
  const source = { id: 'existing', gwp_kgco2e_m2: 50.2, structure: { layers: [{ thickness_mm: 100 }] } };
  const recalculated = {
    ...source, gwp_kgco2e_m2: 47.9936268, spanMax_m: 4,
    structure: { layers: [{ thickness_mm: 120, isSupportStructure: true, baseGwp_kgco2e_m2: 20 }] },
    fire_resistance: { wood_capacity_table: { rows: [{ normal_temperature: { value: 4 } }] } },
    metadata: { version: 2 },
  };
  const result = preserveSelectedComponents([source], [recalculated], () => assert.fail('Ne pas réimporter les composants déjà présents'));
  assert.equal(result[0], recalculated);
  assert.equal(result[0].gwp_kgco2e_m2, 47.9936268);
  assert.equal(preserveSelectedComponents([source], result, () => assert.fail())[0], recalculated);
});

test('les nouveaux composants sont recalculés et les composants désélectionnés sont retirés', () => {
  const source = { id: 'new', gwp_kgco2e_m2: 999 };
  const result = preserveSelectedComponents([source], [{ id: 'removed' }], (component) => ({
    ...component, gwp_kgco2e_m2: 12, structure: { layers: [{ gwp_kgco2e_m2: 12 }] },
  }));
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'new');
  assert.equal(result[0].gwp_kgco2e_m2, 12);
  assert.equal(result[0].structure.layers[0].gwp_kgco2e_m2, 12);
});

test('les valeurs recalculées réelles survivent aux enregistrements successifs de sélection Lignum', async () => {
  const { calculateComponentProperties } = await import('../src/utils/componentPropriety.js');
  const { applyCustomFireTimingToComponent } = await import('../src/utils/customFireTiming.js');
  const materials = readJson(path.join(dbDir, 'materials/tbz_materials.json'));
  const products = readJson(path.join(dbDir, 'products/tbz_products_composites.json'));
  const kbob = readJson(path.resolve(__dirname, '../src/data/KBOB_mat_db.json'));
  const categories = readJson(path.resolve(__dirname, '../src/data/categories.json')).categories;
  const selected = readJson(path.join(dbDir, 'components_lignum_selected.json'));
  const recalculate = (component) => applyCustomFireTimingToComponent(
    calculateComponentProperties(component, materials, products, kbob, { categories, componentServiceLifeYears: 60 }),
    materials, products,
  );
  const calculated = selected.map(recalculate);
  const ids = new Set(selected.map((item) => String(item.id)));
  const mapped = applyMappings(
    readJson(path.join(dbDir, 'components_unified.json')).filter((item) => ids.has(String(item.id))),
    readJson(path.join(dbDir, 'mappings/lignum_product_tbz.json')), true,
  );
  const saved = preserveSelectedComponents(mapped, calculated, recalculate);
  const savedAgain = preserveSelectedComponents(mapped, saved, recalculate);
  const expected = new Map(calculated.map((item) => [String(item.id), item]));
  for (const component of savedAgain) assert.equal(component, expected.get(String(component.id)));
  // A newly selected component must receive current calculations, not source totals.
  assert.deepEqual(preserveSelectedComponents(mapped.slice(0, 1), [], recalculate), mapped.slice(0, 1).map(recalculate));
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
