const path = require('path');
const { readJson, saveVersioned } = require('./lignumDatabase');

const dbDir = path.resolve(__dirname, '../public/db');
const materialsPath = path.join(dbDir, 'materials/tbz_materials.json');
const productsDir = path.join(dbDir, 'source_database/lignum/products');
const unifiedPath = path.join(dbDir, 'components_unified.json');

const materials = readJson(materialsPath, []);
const components = readJson(unifiedPath, []);
const sourceByLanguage = Object.fromEntries(['de', 'en', 'fr'].map((lang) => [
  lang,
  new Map(readJson(path.join(productsDir, `Lignum_Products_${lang}.json`), []).map((item) => [String(item.id), item])),
]));
const layerTranslations = new Map();

components.forEach((component) => (component.structure?.layers || []).forEach((layer) => {
  if (layer.productId && !layerTranslations.has(String(layer.productId))) {
    layerTranslations.set(String(layer.productId), layer.translations || {});
  }
}));

const enriched = materials.map((material) => {
  const externalId = String(material.source?.externalId || '');
  const layerI18n = layerTranslations.get(externalId) || {};
  const translations = {};
  ['de', 'en', 'fr'].forEach((lang) => {
    const existing = material.translations?.[lang] || {};
    const source = sourceByLanguage[lang].get(externalId) || {};
    translations[lang] = {
      ...existing,
      name: existing.name || layerI18n?.[lang]?.name || source.workingtitle || (lang === 'de' ? material.workingtitle : null),
      description: existing.description || null,
    };
  });
  return { ...material, translations };
});

const result = saveVersioned({
  activeFile: materialsPath,
  versionsDir: path.join(dbDir, 'versions/tbz_materials'),
  baseName: 'tbz_materials',
  items: enriched,
  previousItems: materials,
});

console.log(JSON.stringify({ count: result.count, versionFile: result.file }, null, 2));
