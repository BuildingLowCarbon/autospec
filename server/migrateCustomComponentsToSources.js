const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbDirectory = path.join(root, 'public', 'db');
const manifestPath = path.join(dbDirectory, 'db_files.json');
const customFile = path.join(dbDirectory, 'components_custom.json');
const write = process.argv.includes('--write');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const manifest = readJson(manifestPath);
const sourceFiles = manifest
  .map((entry) => (typeof entry === 'string' ? entry : entry?.file))
  .filter((file) => file && file !== 'components_custom.json');
const customComponents = readJson(customFile);
const minergieUpdateReportPath = path.join(dbDirectory, 'minergie_update_report.json');
const recentlyExpandedMinergieIds = fs.existsSync(minergieUpdateReportPath)
  ? new Set(readJson(minergieUpdateReportPath).modified?.map((item) => String(item.id)) ?? [])
  : new Set();
const databases = new Map(sourceFiles.map((file) => [file, readJson(path.join(dbDirectory, file))]));
const locations = new Map();

const layerKey = (layer) => JSON.stringify([
  layer?.productId ?? null,
  layer?.structure ?? null,
  layer?.thickness_mm ?? null,
  layer?.width_mm ?? null,
  layer?.spacing_mm ?? null,
  layer?.fiberDirection ?? null,
  layer?.translations?.de?.description ?? '',
]);

const layerMatches = (customLayers, sourceLayers) => {
  const customKeys = customLayers.map(layerKey);
  const sourceKeys = sourceLayers.map(layerKey);
  const matrix = Array.from({ length: customKeys.length + 1 }, () => Array(sourceKeys.length + 1).fill(0));
  for (let i = customKeys.length - 1; i >= 0; i -= 1) {
    for (let j = sourceKeys.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = customKeys[i] === sourceKeys[j]
        ? matrix[i + 1][j + 1] + 1
        : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }
  const sourceToCustom = new Map();
  let i = 0;
  let j = 0;
  while (i < customKeys.length && j < sourceKeys.length) {
    if (customKeys[i] === sourceKeys[j]) {
      sourceToCustom.set(j, i);
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) i += 1;
    else j += 1;
  }
  return sourceToCustom;
};

const mergeWithRecentMinergieLayers = (customComponent, sourceComponent) => {
  const customLayers = customComponent?.structure?.layers ?? [];
  const sourceLayers = sourceComponent?.structure?.layers ?? [];
  const matches = layerMatches(customLayers, sourceLayers);
  const mergedLayers = sourceLayers.map((sourceLayer, sourceIndex) => {
    const customIndex = matches.get(sourceIndex);
    return customIndex === undefined ? sourceLayer : { ...sourceLayer, ...customLayers[customIndex], order: sourceIndex };
  });
  return {
    ...sourceComponent,
    ...customComponent,
    thickness_mm: sourceComponent.thickness_mm,
    weight_kg_m2: sourceComponent.weight_kg_m2,
    uValue_W_m2K: sourceComponent.uValue_W_m2K,
    gwp_kgco2e_m2: sourceComponent.gwp_kgco2e_m2,
    structure: {
      ...(sourceComponent.structure ?? {}),
      ...(customComponent.structure ?? {}),
      systemTypeId: customComponent?.structure?.systemTypeId ?? sourceComponent?.structure?.systemTypeId ?? null,
      layers: mergedLayers,
    },
  };
};

databases.forEach((components, file) => {
  components.forEach((component, index) => {
    const id = String(component?.id ?? '');
    if (!id) throw new Error(`Composant sans ID dans ${file}.`);
    if (locations.has(id)) throw new Error(`ID ${id} present dans plusieurs bases sources.`);
    locations.set(id, { file, index });
  });
});

const seenCustomIds = new Set();
const retainedCustom = [];
const moved = [];
const mergedRecentUpdates = [];
customComponents.forEach((component) => {
  const id = String(component?.id ?? '');
  if (!id) throw new Error('Composant Custom sans ID.');
  if (seenCustomIds.has(id)) throw new Error(`ID duplique dans components_custom.json: ${id}`);
  seenCustomIds.add(id);

  const location = locations.get(id);
  if (!location) {
    const retained = clone(component);
    delete retained.__sourceFile;
    retained.source = { name: 'Custom', databaseId: 'custom' };
    retainedCustom.push(retained);
    return;
  }

  const components = databases.get(location.file);
  const original = components[location.index];
  const replacement = location.file === 'components_minergie_enriched.json' && recentlyExpandedMinergieIds.has(id)
    ? mergeWithRecentMinergieLayers(clone(component), original)
    : clone(component);
  if (location.file === 'components_minergie_enriched.json' && recentlyExpandedMinergieIds.has(id)) {
    mergedRecentUpdates.push(id);
  }
  delete replacement.__sourceFile;
  replacement.source = original?.source ?? replacement.source;
  components[location.index] = replacement;
  moved.push({ id: component.id, sourceFile: location.file });
});

const remainingSourceIds = new Set(locations.keys());
const collisionsAfterMigration = retainedCustom.filter((component) => remainingSourceIds.has(String(component.id)));
if (collisionsAfterMigration.length) throw new Error('La migration laisserait des IDs communs entre Custom et les bases sources.');

const touchedSourceFiles = [...new Set(moved.map((item) => item.sourceFile))];
const report = {
  write,
  customBefore: customComponents.length,
  movedToSource: moved.length,
  customAfter: retainedCustom.length,
  touchedSourceFiles,
  mergedRecentUpdates,
  collisionsAfterMigration: collisionsAfterMigration.length,
  moved,
};

if (write) {
  const backupDirectory = path.join(
    dbDirectory,
    'versions',
    'custom_to_sources',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.copyFileSync(customFile, path.join(backupDirectory, 'components_custom.json'));
  touchedSourceFiles.forEach((file) => {
    const activeFile = path.join(dbDirectory, file);
    fs.copyFileSync(activeFile, path.join(backupDirectory, file));
    fs.writeFileSync(activeFile, `${JSON.stringify(databases.get(file), null, 2)}\n`, 'utf8');
  });
  fs.writeFileSync(customFile, `${JSON.stringify(retainedCustom, null, 2)}\n`, 'utf8');
  report.backupDirectory = path.relative(root, backupDirectory);
  fs.writeFileSync(
    path.join(dbDirectory, 'custom_database_migration_report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
}

console.log(JSON.stringify(report, null, 2));
