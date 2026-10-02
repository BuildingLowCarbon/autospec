const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/db/db_files.json'), 'utf8'));
const requestedFile = process.argv.find((argument) => argument.endsWith('.json'));
const allComponents = [];

for (const entry of manifest) {
  if (requestedFile && entry.file !== requestedFile) continue;
  const file = path.join(root, 'public/db', entry.file);
  const components = JSON.parse(fs.readFileSync(file, 'utf8'));
  allComponents.push(...components.map((component) => ({ ...component, __sourceFile: entry.file })));
  const summary = {
    components: components.length,
    layers: 0,
    missingEccc: 0,
    missingSupport: 0,
    missingSystem: 0,
    categories: {},
  };
  components.forEach((component) => {
    const layers = component?.structure?.layers ?? [];
    summary.layers += layers.length;
    summary.missingEccc += layers.filter((layer) => !layer?.ecccId).length;
    summary.missingSupport += layers.some((layer) => layer?.isSupportStructure === true) ? 0 : 1;
    summary.missingSystem += component?.structure?.systemTypeId ? 0 : 1;
    const categoryId = component?.categoryId ?? 'unknown';
    summary.categories[categoryId] = (summary.categories[categoryId] ?? 0) + 1;
  });
  console.log(`\n${entry.file}`);
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv.includes('--details')) {
    components.forEach((component) => {
      const layers = component?.structure?.layers ?? [];
      const supportIndex = layers.findIndex((layer) => layer?.isSupportStructure === true);
      const title = component?.translations?.fr?.name ?? component?.translations?.de?.name ?? component?.workingtitle ?? component?.serialNo ?? component?.id;
      console.log(JSON.stringify({
        id: component.id,
        title,
        categoryId: component.categoryId,
        subcategoryId: component.subcategoryId,
        systemTypeId: component?.structure?.systemTypeId,
        supportIndex,
        layers: layers.map((layer, index) => ({
          index,
          name: layer?.translations?.fr?.description ?? layer?.translations?.de?.description ?? layer?.productName ?? layer?.productId,
          productId: layer?.productId,
          thickness_mm: layer?.thickness_mm,
          width_mm: layer?.width_mm,
          spacing_mm: layer?.spacing_mm,
          ecccId: layer?.ecccId,
        })),
      }));
    });
  }
}

if (process.argv.includes('--patterns')) {
  const ecccByCategoryAndProduct = new Map();
  const systemsBySupportProduct = new Map();
  const add = (map, key, value) => {
    if (!key || !value) return;
    if (!map.has(key)) map.set(key, new Map());
    const values = map.get(key);
    values.set(value, (values.get(value) ?? 0) + 1);
  };
  allComponents.forEach((component) => {
    (component?.structure?.layers ?? []).forEach((layer) => {
      add(ecccByCategoryAndProduct, `${component.categoryId}|${layer.productId}`, layer.ecccId);
      if (layer.isSupportStructure === true) add(systemsBySupportProduct, layer.productId, component?.structure?.systemTypeId);
    });
  });
  const serialize = (map) => [...map]
    .map(([key, values]) => ({ key, values: Object.fromEntries(values) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  console.log('\nECCC patterns');
  console.log(JSON.stringify(serialize(ecccByCategoryAndProduct), null, 2));
  console.log('\nSystem patterns');
  console.log(JSON.stringify(serialize(systemsBySupportProduct), null, 2));
}
