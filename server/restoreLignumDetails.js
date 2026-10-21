const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson } = require('./lignumDatabase');

const missing = (value) => value === undefined || value === null || value === '';
const numeric = (value) => missing(value) ? null : Number(value);
const layerIdentity = (layer) => JSON.stringify({
  order: Number(layer.order ?? 0),
  material: layer.productId || layer.materialId || null,
  dimensions: ['thickness_mm', 'width_mm', 'spacing_mm'].map((field) => numeric(layer[field])),
  structure: layer.structure || 'on-lying',
});

const restoreDetails = (current, snapshots) => {
  const changes = [];
  const sorted = [...snapshots].sort((a, b) => b.timestamp - a.timestamp);
  const histories = sorted.map((snapshot) => ({
    ...snapshot, byId: new Map(snapshot.items.map((component) => [String(component.id), component])),
  }));
  const items = JSON.parse(JSON.stringify(current));
  for (const component of items) {
    const previous = histories.map((snapshot) => ({
      ...snapshot, component: snapshot.byId.get(String(component.id)),
    })).filter((snapshot) => snapshot.component);
    for (const layer of component.structure?.layers || []) {
      const candidates = previous.map((snapshot) => ({
        ...snapshot,
        layer: (snapshot.component.structure?.layers || []).find((old) => layerIdentity(old) === layerIdentity(layer)),
      })).filter((snapshot) => snapshot.layer);
      const restore = (field, valid = () => true) => {
        if (!missing(layer[field])) return;
        const candidate = candidates.find((snapshot) => !missing(snapshot.layer[field]) && valid(snapshot.layer));
        if (!candidate) return;
        layer[field] = candidate.layer[field];
        changes.push({ componentId: component.id, order: layer.order, field, value: layer[field], backup: candidate.file });
      };
      restore('ecccId');
      restore('ecccDescription', (old) => old.ecccId === layer.ecccId);
      restore('layerFunctionId', (old) => !(old.layerFunctionId === 'structure' && layer.isSupportStructure === false));
      restore('isSupportStructure', (old) => !old.isSupportStructure || !layer.layerFunctionId || layer.layerFunctionId === 'structure');
      restore('insulationTypeId', () => !layer.layerFunctionId || layer.layerFunctionId === 'insulation');
      restore('protectsSupportSidesFromFire');
    }
  }
  return { items, changes };
};

const run = ({ write = false } = {}) => {
  const dbDir = path.resolve(__dirname, '../public/db');
  const target = path.join(dbDir, 'components_lignum_selected.json');
  const snapshots = [];
  for (const root of ['component_edits', 'components_lignum_selected']) {
    const directory = path.join(dbDir, 'versions', root);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = entry.isDirectory()
        ? path.join(directory, entry.name, 'components_lignum_selected.json')
        : path.join(directory, entry.name);
      if (!file.endsWith('.json') || !fs.existsSync(file)) continue;
      const items = readJson(file, []);
      if (!Array.isArray(items)) continue;
      snapshots.push({ file: path.relative(dbDir, file), timestamp: fs.statSync(file).mtimeMs, items });
    }
  }
  const currentText = fs.readFileSync(target, 'utf8');
  const current = JSON.parse(currentText);
  const { items, changes } = restoreDetails(current, snapshots);
  const report = {
    dryRun: !write, snapshots: snapshots.length,
    componentsRestored: new Set(changes.map((change) => change.componentId)).size,
    fieldsRestored: changes.length,
    fields: Object.fromEntries([...new Set(changes.map((change) => change.field))]
      .map((field) => [field, changes.filter((change) => change.field === field).length])),
    changes,
  };
  if (write && changes.length) {
    if (fs.readFileSync(target, 'utf8') !== currentText) throw new Error('La base a changé pendant la préparation ; relancer la restauration.');
    const directory = path.join(dbDir, 'versions', 'lignum_details_restoration', new Date().toISOString().replace(/[:.]/g, '-'));
    report.backupDirectory = path.relative(dbDir, directory);
    writeJson(path.join(directory, 'components_lignum_selected.json'), current);
    writeJson(path.join(directory, 'report.json'), report);
    writeJson(target, items);
    const saved = readJson(target);
    if (JSON.stringify(saved) !== JSON.stringify(items)) throw new Error('Échec de vérification de la sauvegarde.');
  }
  return report;
};

module.exports = { restoreDetails, run };
if (require.main === module) {
  try {
    const { changes, ...summary } = run({ write: process.argv.includes('--write') });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
