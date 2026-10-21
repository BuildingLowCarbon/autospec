const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson } = require('./lignumDatabase');

const text = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const missing = (value) => value === undefined || value === null || value === '';
const reference = (layer) => layer.productId || layer.materialId
  || text(layer.translations?.en?.name || layer.productName);
const description = (layer) => text(layer.translations?.en?.description || layer.translations?.de?.description);
const support = (layer) => layer.isSupportStructure === true
  || /^(support|supporting structure)$/.test(description(layer));
const zone = (component, index) => {
  const layers = component.structure?.layers || [];
  const first = layers.findIndex(support);
  if (first < 0) return null;
  // An in-lying layer shares the zone of the host it fills.
  let host = index;
  while (host > 0 && layers[host].structure === 'in-lying') host--;
  return host < first ? 'above' : support(layers[host]) ? 'support' : 'below';
};

const completeEccc = (current, references, eccc) => {
  const codes = new Map(eccc.map((entry) => [entry.id, entry.name]));
  const donors = references.flatMap((component) => (component.structure?.layers || []).map((layer, index) => ({
    component, layer, zone: zone(component, index),
  }))).filter(({ layer, zone }) => layer.ecccId && codes.has(layer.ecccId) && zone);
  const changes = [];
  const skipped = [];
  const items = JSON.parse(JSON.stringify(current));
  for (const component of items) for (const [index, layer] of (component.structure?.layers || []).entries()) {
    if (!missing(layer.ecccId)) continue;
    const position = zone(component, index);
    const matches = position && reference(layer) && description(layer) ? donors.filter((donor) =>
      donor.component.id !== component.id
      && donor.component.categoryId === component.categoryId
      && (!component.subcategoryId || !donor.component.subcategoryId || component.subcategoryId === donor.component.subcategoryId)
      && donor.zone === position
      && reference(donor.layer) === reference(layer)
      && description(donor.layer) === description(layer)
    ) : [];
    const agreed = [...new Set(matches.map(({ layer }) => layer.ecccId))];
    if (agreed.length !== 1) {
      skipped.push({ componentId: component.id, serialNo: component.serialNo, order: layer.order, reason: agreed.length ? 'conflicting_codes' : 'no_exact_match', codes: agreed });
      continue;
    }
    layer.ecccId = agreed[0];
    if (missing(layer.ecccDescription)) layer.ecccDescription = codes.get(layer.ecccId);
    changes.push({ componentId: component.id, serialNo: component.serialNo, order: layer.order, ecccId: layer.ecccId,
      evidence: matches.map(({ component, layer }) => ({ componentId: component.id, serialNo: component.serialNo, sourceFile: component.__ecccSourceFile, order: layer.order })),
    });
  }
  return { items, changes, skipped };
};

const run = ({ write = false } = {}) => {
  const dbDir = path.resolve(__dirname, '../public/db');
  const target = path.join(dbDir, 'components_lignum_selected.json');
  const beforeText = fs.readFileSync(target, 'utf8');
  const current = JSON.parse(beforeText);
  const references = readJson(path.join(dbDir, 'db_files.json')).flatMap(({ file }) =>
    readJson(path.join(dbDir, file)).map((item) => ({ ...item, __ecccSourceFile: file })));
  const result = completeEccc(current, references, readJson(path.resolve(__dirname, '../src/data/eccc.json')));
  const report = { dryRun: !write, completedLayers: result.changes.length,
    affectedComponents: new Set(result.changes.map((entry) => entry.componentId)).size,
    remainingLayers: result.skipped.length, changes: result.changes, skipped: result.skipped };
  if (write && result.changes.length) {
    if (fs.readFileSync(target, 'utf8') !== beforeText) throw new Error('La base a changé ; relancer la préparation.');
    const backupDir = path.join(dbDir, 'versions/eccc_completion', new Date().toISOString().replace(/[:.]/g, '-'));
    report.backupDirectory = path.relative(dbDir, backupDir);
    writeJson(path.join(backupDir, 'components_lignum_selected.json'), current);
    writeJson(path.join(backupDir, 'report.json'), report);
    writeJson(target, result.items);
  }
  return report;
};

module.exports = { completeEccc, run };
if (require.main === module) {
  try { console.log(JSON.stringify(run({ write: process.argv.includes('--write') }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
