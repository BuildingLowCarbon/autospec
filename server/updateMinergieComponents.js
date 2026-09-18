const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const activeFile = path.join(root, 'public/db/components_minergie_enriched.json');
const sourceFile = process.argv.find((argument) => argument.toLowerCase().endsWith('.json') && path.resolve(argument) !== activeFile);
const write = process.argv.includes('--write');

if (!sourceFile || !fs.existsSync(sourceFile)) {
  throw new Error('Chemin du nouveau fichier components_minergie.json attendu.');
}

const loadCalculator = () => {
  const utilityFile = path.join(root, 'src/utils/componentPropriety.js');
  let source = fs.readFileSync(utilityFile, 'utf8');
  source = source.replace(/export const /g, 'const ');
  source = source.replace(/export default calculateComponentProperties;?/, '');
  source += '\nmodule.exports = { calculateComponentProperties };';
  const loadedModule = { exports: {} };
  new Function('module', 'exports', source)(loadedModule, loadedModule.exports);
  return loadedModule.exports.calculateComponentProperties;
};

const calculateComponentProperties = loadCalculator();
const oldComponents = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
const newComponents = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const materials = JSON.parse(fs.readFileSync(path.join(root, 'public/db/materials/tbz_materials.json'), 'utf8'));
const products = JSON.parse(fs.readFileSync(path.join(root, 'public/db/products/tbz_products_composites.json'), 'utf8'));
const kbob = JSON.parse(fs.readFileSync(path.join(root, 'src/data/KBOB_mat_db.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(root, 'src/data/categories.json'), 'utf8')).categories;

const normalizedCategory = (categoryId) => {
  if (categoryId === 'partition_wall_single_shell' || categoryId === 'partition_wall_double_shell') return 'partition_wall';
  return categoryId ?? '';
};
const componentKey = (component) => `${normalizedCategory(component?.categoryId)}|${component?.translations?.de?.name ?? ''}`;
const oldByKey = new Map();
oldComponents.forEach((component) => {
  const key = componentKey(component);
  if (oldByKey.has(key)) throw new Error(`Correspondance Minergie ancienne ambiguë: ${key}`);
  oldByKey.set(key, component);
});

const layerKey = (layer) => JSON.stringify([
  layer?.productId ?? null,
  layer?.structure ?? null,
  layer?.thickness_mm ?? null,
  layer?.width_mm ?? null,
  layer?.spacing_mm ?? null,
  layer?.fiberDirection ?? null,
  layer?.translations?.de?.description ?? '',
]);

const matchLayers = (oldLayers, newLayers) => {
  const a = oldLayers.map(layerKey);
  const b = newLayers.map(layerKey);
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      matrix[i][j] = a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
    }
  }
  const matches = new Map();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matches.set(j, i);
      i += 1;
      j += 1;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) i += 1;
    else j += 1;
  }
  return matches;
};

const report = {
  sourceFile: path.resolve(sourceFile),
  activeFile,
  oldCount: oldComponents.length,
  newCount: newComponents.length,
  matched: 0,
  unchanged: 0,
  modified: [],
  unmatchedNew: [],
  unmatchedOld: [],
  preservedIds: [],
};

const usedOldIds = new Set();
const mergedComponents = newComponents.map((incoming) => {
  const old = oldByKey.get(componentKey(incoming));
  if (!old) {
    report.unmatchedNew.push({ newId: incoming.id, key: componentKey(incoming) });
    return null;
  }
  usedOldIds.add(String(old.id));
  report.matched += 1;
  report.preservedIds.push({ oldId: old.id, ignoredNewId: incoming.id });
  const oldLayers = old?.structure?.layers ?? [];
  const newLayers = incoming?.structure?.layers ?? [];
  const matches = matchLayers(oldLayers, newLayers);
  const removedOldIndexes = oldLayers.map((_, index) => index).filter((index) => ![...matches.values()].includes(index));
  const addedNewIndexes = newLayers.map((_, index) => index).filter((index) => !matches.has(index));
  if (removedOldIndexes.length) {
    throw new Error(`Le composant ${old.id} supprimerait des couches anciennes (${removedOldIndexes.join(', ')}). Fusion interrompue.`);
  }
  const mergedLayers = newLayers.map((layer, index) => {
    const oldIndex = matches.get(index);
    if (oldIndex === undefined) return { ...layer, order: index };
    const previous = oldLayers[oldIndex];
    return {
      ...previous,
      ...layer,
      order: index,
      ecccId: previous.ecccId ?? '',
      ecccDescription: previous.ecccDescription ?? '',
      isSupportStructure: previous.isSupportStructure === true,
      protectsSupportSidesFromFire: previous.protectsSupportSidesFromFire === true,
    };
  });
  if (!addedNewIndexes.length) {
    report.unchanged += 1;
    return old;
  }
  report.modified.push({
      id: old.id,
      ignoredNewId: incoming.id,
      name: incoming?.translations?.de?.name ?? '',
      oldLayerCount: oldLayers.length,
      newLayerCount: newLayers.length,
      addedLayerIndexes: addedNewIndexes,
      addedLayers: addedNewIndexes.map((index) => ({
        index,
        productId: newLayers[index]?.productId ?? null,
        description: newLayers[index]?.translations?.de?.description ?? '',
      })),
    });
  const merged = {
    ...old,
    translations: incoming.translations ?? old.translations,
    structure: { ...(old.structure ?? {}), layers: mergedLayers },
    source: old.source,
  };
  return calculateComponentProperties(merged, materials, products, kbob, {
    categories,
    componentServiceLifeYears: 60,
  });
});

report.unmatchedOld = oldComponents
  .filter((component) => !usedOldIds.has(String(component.id)))
  .map((component) => ({ id: component.id, key: componentKey(component) }));

if (oldComponents.length !== newComponents.length || report.unmatchedNew.length || report.unmatchedOld.length || mergedComponents.some((component) => !component)) {
  console.log(JSON.stringify(report, null, 2));
  throw new Error('La correspondance des composants Minergie n’est pas complète; aucune écriture effectuée.');
}

if (write) {
  const backupDirectory = path.join(root, 'public/db/versions/minergie_update', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.copyFileSync(activeFile, path.join(backupDirectory, path.basename(activeFile)));
  fs.copyFileSync(sourceFile, path.join(backupDirectory, 'components_minergie_source.json'));
  fs.writeFileSync(activeFile, `${JSON.stringify(mergedComponents, null, 2)}\n`, 'utf8');
  report.backupDirectory = path.relative(root, backupDirectory);
  fs.writeFileSync(path.join(root, 'public/db/minergie_update_report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(report, null, 2));
