const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbDirectory = path.join(root, 'public', 'db');
const customFile = path.join(dbDirectory, 'components_custom.json');
const selectedFile = path.join(dbDirectory, 'components_lignum_selected.json');
const unifiedFile = path.join(dbDirectory, 'components_unified.json');
const write = process.argv.includes('--write');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();
const primaryName = (component) => [
  component?.translations?.fr?.name,
  component?.translations?.de?.name,
  component?.translations?.en?.name,
  component?.translations?.it?.name,
  component?.workingtitle,
].find((value) => String(value ?? '').trim()) ?? '';

const custom = readJson(customFile);
const selected = readJson(selectedFile);
const unified = readJson(unifiedFile);
const unifiedById = new Map(unified.map((component) => [String(component.id), component]));
const addToIndex = (index, key, component) => {
  if (!key) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(component);
};
const unifiedBySerial = new Map();
const unifiedByName = new Map();
unified.forEach((component) => {
  addToIndex(unifiedBySerial, String(component.serialNo ?? ''), component);
  addToIndex(unifiedByName, normalize(primaryName(component)), component);
});

const uniqueMatch = (index, key) => {
  const matches = index.get(key) ?? [];
  return matches.length === 1 ? matches[0] : null;
};

const findLignumComponent = (component) => {
  const direct = unifiedById.get(String(component.id));
  if (direct) return direct;
  const parent = unifiedById.get(String(component.parent ?? ''));
  if (parent) return parent;
  const serial = uniqueMatch(unifiedBySerial, String(component.serialNo ?? ''));
  if (serial) return serial;
  return uniqueMatch(unifiedByName, normalize(primaryName(component)));
};

let retainedCustom = [];
const candidatesByLignumId = new Map();
const differentNames = [];
custom.forEach((component, customIndex) => {
  const lignum = findLignumComponent(component);
  const sameName = lignum && normalize(primaryName(component)) === normalize(primaryName(lignum));
  if (!sameName) {
    retainedCustom.push(component);
    differentNames.push({
      customId: component.id,
      customName: primaryName(component),
      lignumId: lignum?.id ?? null,
      lignumName: lignum ? primaryName(lignum) : null,
    });
    return;
  }
  const targetId = String(lignum.id);
  const priority = String(component.parent ?? '') === targetId && String(component.id) !== targetId ? 2 : 1;
  const previous = candidatesByLignumId.get(targetId);
  if (!previous || priority > previous.priority || (priority === previous.priority && customIndex > previous.customIndex)) {
    candidatesByLignumId.set(targetId, { component, lignum, priority, customIndex });
  }
});

const selectedById = new Map(selected.map((component) => [String(component.id), component]));
const restored = [];
candidatesByLignumId.forEach(({ component, lignum }, targetId) => {
  const next = JSON.parse(JSON.stringify(component));
  next.id = lignum.id;
  next.parent = lignum.parent ?? null;
  next.serialNo = lignum.serialNo ?? component.serialNo ?? null;
  next.source = lignum.source ?? { name: 'Lignum', databaseId: 'lignum' };
  delete next.__sourceFile;
  selectedById.set(targetId, next);
  restored.push({
    customId: component.id,
    lignumId: lignum.id,
    name: primaryName(component),
    reusedOriginalId: String(component.id) === String(lignum.id),
  });
});

const nextSelected = Array.from(selectedById.values());
const selectedIds = new Set(nextSelected.map((component) => String(component.id)));
const reassignedCustomIds = [];
retainedCustom = retainedCustom.map((component) => {
  if (!selectedIds.has(String(component.id))) return component;
  const previousId = component.id;
  const next = JSON.parse(JSON.stringify(component));
  next.id = crypto.randomUUID();
  next.parent = previousId;
  next.source = { name: 'Custom', databaseId: 'custom' };
  reassignedCustomIds.push({ previousId, newId: next.id, name: primaryName(next) });
  return next;
});
const collisions = retainedCustom.filter((component) => selectedIds.has(String(component.id)));
if (collisions.length) {
  throw new Error(`La restauration laisserait des IDs communs entre Custom et Lignum: ${collisions.map((item) => item.id).join(', ')}`);
}

const report = {
  write,
  customBefore: custom.length,
  restoredCustomEntries: custom.length - retainedCustom.length,
  restoredLignumComponents: restored.length,
  lignumBefore: selected.length,
  lignumAfter: nextSelected.length,
  customAfter: retainedCustom.length,
  differentNames,
  reassignedCustomIds,
  collisionsAfterRestore: collisions.length,
  restored,
};

if (write) {
  const backupDirectory = path.join(
    dbDirectory,
    'versions',
    'restore_lignum_from_custom',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.copyFileSync(customFile, path.join(backupDirectory, path.basename(customFile)));
  fs.copyFileSync(selectedFile, path.join(backupDirectory, path.basename(selectedFile)));
  fs.writeFileSync(customFile, `${JSON.stringify(retainedCustom, null, 2)}\n`, 'utf8');
  fs.writeFileSync(selectedFile, `${JSON.stringify(nextSelected, null, 2)}\n`, 'utf8');
  report.backupDirectory = path.relative(root, backupDirectory);
  fs.writeFileSync(
    path.join(dbDirectory, 'restore_lignum_from_custom_report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

console.log(JSON.stringify(report, null, 2));
