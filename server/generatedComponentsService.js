const path = require('path');
const crypto = require('crypto');
const { readJson, saveVersioned } = require('./lignumDatabase');

const dbDir = path.resolve(__dirname, '../public/db');
const generatedPath = path.join(dbDir, 'components_generated.json');
const historyPath = path.join(dbDir, 'structure_generation_history.json');

const componentGenerationSignature = (component) => JSON.stringify({
  categoryId: component.categoryId || null,
  layers: (component.structure?.layers || []).map((layer) => JSON.stringify({
    productId: layer.productId || null, materialId: layer.materialId || null,
    ...Object.fromEntries(['thickness_mm', 'width_mm', 'spacing_mm'].map((key) => [key, layer[key] === null || layer[key] === undefined || layer[key] === '' ? null : Number(Number(layer[key]).toFixed(4))])),
    structure: layer.structure || 'on-lying',
    fiberDirection: layer.fiberDirection || null,
    protectsSupportSidesFromFire: Boolean(layer.protectsSupportSidesFromFire),
  })),
});

const loadGenerationTools = async () => {
  const [{ createMaterialReferenceResolver }, { calculateComponentProperties }, { applyCustomFireTimingToComponent }] = await Promise.all([
    import('../src/utils/componentMaterialReferences.js'),
    import('../src/utils/componentPropriety.js'),
    import('../src/utils/customFireTiming.js'),
  ]);
  const materials = readJson(path.join(dbDir, 'materials/tbz_materials.json'), []);
  const products = readJson(path.join(dbDir, 'products/tbz_products_composites.json'), []);
  const mappings = readJson(path.join(dbDir, 'mappings/lignum_product_tbz.json'), []);
  const resolver = createMaterialReferenceResolver(materials, products, mappings);
  const kbob = readJson(path.resolve(__dirname, '../src/data/KBOB_mat_db.json'), []);
  const categories = readJson(path.resolve(__dirname, '../src/data/categories.json'), {}).categories || [];
  const recalculate = (source) => {
    const resolved = resolver.component(source);
    const unknown = resolved.structure.layers.filter((layer) => {
      const reference = layer.productId || layer.materialId;
      return reference && !resolver.catalog.has(String(reference));
    });
    if (unknown.length) throw new Error(`Références matériau introuvables pour ${source.id || 'la combinaison'} : ${unknown.map((layer) => layer.productId || layer.materialId).join(', ')}`);
    const calculated = applyCustomFireTimingToComponent(calculateComponentProperties(resolved, materials, products, kbob, {
      categories, componentServiceLifeYears: 60,
    }), materials, products);
    return calculated.generated ? { ...calculated, generationSignature: componentGenerationSignature(calculated) } : calculated;
  };
  return { ...resolver, materials, products, mappings, recalculate };
};

const generationLayerKey = (layer) => JSON.stringify({
  productId: layer.productId || layer.materialId || null,
  thickness_mm: layer.thickness_mm ?? null,
  width_mm: layer.width_mm ?? null,
  spacing_mm: layer.spacing_mm ?? null,
  structure: layer.structure || 'on-lying',
  role: layer.layerFunctionId || (layer.isSupportStructure ? 'structure' : 'other'),
  ecccId: layer.ecccId || null,
});

const patchGenerationLayers = (components, { componentIds, layerKey, patch }, catalog) => {
  const allowed = ['productId', 'thickness_mm', 'width_mm', 'spacing_mm', 'layerFunctionId', 'ecccId'];
  if (!layerKey || !patch || !Object.keys(patch).length || Object.keys(patch).some((key) => !allowed.includes(key))) throw new Error('Paramètres de couche invalides.');
  for (const key of ['thickness_mm', 'width_mm', 'spacing_mm']) {
    if (patch[key] !== undefined && patch[key] !== null && (typeof patch[key] !== 'number' || !Number.isFinite(patch[key]) || patch[key] < 0)) throw new Error(`Dimension invalide : ${key}`);
  }
  if (patch.productId !== undefined && !catalog.has(String(patch.productId))) throw new Error('Le matériau choisi est introuvable.');
  if (patch.layerFunctionId !== undefined && !['structure', 'insulation', 'screed', 'bracing', 'mass', 'sealing', 'battens', 'connection', 'covering', 'finish', 'other'].includes(patch.layerFunctionId)) throw new Error('Rôle de couche invalide.');
  const selected = new Set(componentIds || []);
  const changed = [];
  const items = components.map((component) => {
    if (!selected.has(component.id)) return component;
    let touched = false;
    const layers = (component.structure?.layers || []).map((layer) => {
      if (generationLayerKey(layer) !== layerKey) return layer;
      touched = true;
      const next = { ...layer, ...patch };
      if (patch.productId !== undefined) {
        const material = catalog.get(String(patch.productId));
        next.kbobId = material.kbobId || null;
        next.productName = material.workingtitle || material.translations?.fr?.name || material.id;
        if (next.materialId) next.materialId = material.id;
        delete next.sourceProductId;
      }
      if (patch.layerFunctionId !== undefined) {
        next.isSupportStructure = patch.layerFunctionId === 'structure';
        if (patch.layerFunctionId !== 'insulation') next.insulationTypeId = null;
      }
      if (patch.ecccId !== undefined) next.ecccDescription = readJson(path.resolve(__dirname, '../src/data/eccc.json'), []).find((entry) => entry.id === patch.ecccId)?.name || null;
      return next;
    });
    if (!touched) return component;
    const updated = { ...component, structure: { ...component.structure, layers } };
    changed.push(updated);
    return updated;
  });
  return { items, changed };
};

const saveHistory = (history) => saveVersioned({ activeFile: historyPath, versionsDir: path.join(dbDir, 'versions/structure_generation_history'), baseName: 'structure_generation_history', items: history, audit: false });

const reconcileGenerationHistory = (components, history) => {
  const next = history.map((run) => ({ ...run, componentIds: [...run.componentIds] }));
  const known = new Set(next.flatMap((run) => run.componentIds));
  const assignments = new Map();
  for (const component of components) {
    if (known.has(component.id)) continue;
    const stamp = (component.generatedAt || component.metadata?.created_at || 'unknown').slice(0, 19);
    const id = component.generationRunId || `recovered-${crypto.createHash('sha256').update(stamp).digest('hex').slice(0, 20)}`;
    let run = next.find((entry) => entry.id === id && !entry.deletedAt);
    if (!run) {
      run = { id, name: `Génération récupérée ${stamp}`, createdAt: component.generatedAt || component.metadata?.created_at || null,
        updatedAt: new Date().toISOString(), revision: 1, reconstructed: true, componentIds: [], createdComponentIds: [], events: [] };
      next.push(run);
    }
    run.componentIds.push(component.id);
    run.createdComponentIds = [...new Set([...(run.createdComponentIds || []), component.id])];
    assignments.set(component.id, run.id);
    known.add(component.id);
  }
  return { history: next, assignments };
};

const planGenerationDeletion = (components, history, run) => {
  const ids = new Set(run.componentIds);
  const shared = new Set(history.filter((entry) => entry.id !== run.id && !entry.deletedAt).flatMap((entry) => entry.componentIds));
  const retiredOwners = new Set(history.filter((entry) => entry.deletedAt).map((entry) => entry.id));
  const deleted = components.filter((component) => ids.has(component.id)
    && (component.generationRunId === run.id || retiredOwners.has(component.generationRunId) || (run.createdComponentIds || []).includes(component.id)) && !shared.has(component.id));
  const deletedIds = new Set(deleted.map((component) => component.id));
  return { deletedIds: [...deletedIds], items: components.filter((component) => !deletedIds.has(component.id)), retainedIds: components.filter((component) => ids.has(component.id) && !deletedIds.has(component.id)).map((component) => component.id) };
};

const repairGeneratedComponents = async ({ write = false } = {}) => {
  const tools = await loadGenerationTools();
  const original = readJson(generatedPath, []);
  const history = readJson(historyPath, []);
  const knownHistory = new Set(history.flatMap((run) => run.componentIds || []));
  const historicalRuns = new Map();
  const unresolved = [];
  let repaired = 0;
  const items = original.map((component) => {
    let next = component;
    const resolved = tools.component(component);
    const changedRefs = JSON.stringify(resolved.structure.layers) !== JSON.stringify(component.structure?.layers || []);
    try {
      if (changedRefs) { next = tools.recalculate(resolved); repaired += 1; }
    } catch (error) { unresolved.push({ id: component.id, error: error.message }); }
    if (!knownHistory.has(component.id)) {
      // Legacy files contain creation timestamps, but not the original batch request.
      const key = (component.generatedAt || component.metadata?.created_at || 'unknown').slice(0, 19);
      if (!historicalRuns.has(key)) historicalRuns.set(key, { id: crypto.randomUUID(), name: `Génération historique ${key}`, createdAt: component.generatedAt || component.metadata?.created_at, updatedAt: new Date().toISOString(), revision: 1, reconstructed: true, componentIds: [], events: [] });
      const run = historicalRuns.get(key);
      run.componentIds.push(component.id);
      next = { ...next, generationRunId: next.generationRunId || run.id };
    }
    return next;
  });
  historicalRuns.forEach((run) => {
    run.events.push({ at: run.updatedAt, type: 'legacy_import', componentIds: run.componentIds });
    history.push(run);
  });
  const changed = JSON.stringify(items) !== JSON.stringify(original);
  let versionFile = null;
  if (write && changed) {
    // Preserve the exact pre-migration file as well as the resulting version.
    const backup = path.join(dbDir, 'versions/generated_reference_repair', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const fs = require('fs');
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(generatedPath, backup);
    const result = saveVersioned({ activeFile: generatedPath, versionsDir: path.join(dbDir, 'versions/components_generated'), baseName: 'components_generated', items });
    versionFile = result.file;
    if (historicalRuns.size) saveHistory(history);
  }
  return { count: items.length, repaired, unresolved, importedRuns: historicalRuns.size, versionFile };
};

module.exports = { loadGenerationTools, generationLayerKey, componentGenerationSignature, patchGenerationLayers, repairGeneratedComponents, generatedPath, historyPath, saveHistory, reconcileGenerationHistory, planGenerationDeletion };
