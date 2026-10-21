const fs = require('fs');
const path = require('path');
const {
  applyMappings,
  buildUnifiedComponents,
  deriveMappings,
  newId,
  preserveSelectedComponents,
  readJson,
  saveVersioned,
  validateComponents,
  writeJson,
} = require('./lignumDatabase');
const { registerAuthRoutes, requireAuth, requireCsrf } = require('./authRoutes');
const { prepareSystemComponentCreation } = require('./systemComponentCreation');
const { registerCollaborationRoutes } = require('./collaborationRoutes');
const { loadGenerationTools, generationLayerKey, patchGenerationLayers, historyPath: generationHistoryPath, saveHistory, reconcileGenerationHistory, planGenerationDeletion } = require('./generatedComponentsService');

const customComponentsPath = path.resolve(__dirname, '../public/db/components_custom.json');
const dbDir = path.resolve(__dirname, '../public/db');
const dbManifestPath = path.join(dbDir, 'db_files.json');
const versionsDir = path.join(dbDir, 'versions');
const sourceComponentsDir = path.join(dbDir, 'source_database', 'lignum', 'components');
const sourceProductsDir = path.join(dbDir, 'source_database', 'lignum', 'products');
const unifiedPath = path.join(dbDir, 'components_unified.json');
const selectedPath = path.join(dbDir, 'components_lignum_selected.json');
const materialsPath = path.join(dbDir, 'materials', 'tbz_materials.json');
const productsPath = path.join(dbDir, 'products', 'tbz_products_composites.json');
const mappingsPath = path.join(dbDir, 'mappings', 'lignum_product_tbz.json');
const categoriesPath = path.resolve(__dirname, '../src/data/categories.json');
const constructionSystemsPath = path.resolve(__dirname, '../src/data/construction_systems.json');
const generatedComponentsPath = path.join(dbDir, 'components_generated.json');
const structureLayerGroupsPath = path.join(dbDir, 'structure_layer_groups.json');
const systemDatabaseRoutes = [
  '/api/taxonomies',
  '/api/lignum',
  '/api/catalog',
  '/api/db',
  '/api/components-source',
  '/api/components-custom',
  '/api/structures',
];

const requireLocalSystemDatabase = (req, res, next) => {
  if (process.env.VERCEL !== '1') return next();
  return res.status(403).json({
    ok: false,
    error: 'Les outils des bases de donnees systeme sont disponibles uniquement en local. Publiez ensuite les modifications avec Git.',
  });
};

const validateTaxonomyId = (value, label) => {
  const id = String(value ?? '').trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    throw new Error(`${label}: identifiant obligatoire, en minuscules, sans espace.`);
  }
  return id;
};

const validateTaxonomies = (categories, systems) => {
  const categoryIds = new Set();
  categories.forEach((category) => {
    const categoryId = validateTaxonomyId(category?.id, 'Catégorie');
    if (categoryIds.has(categoryId)) throw new Error(`Catégorie dupliquée: ${categoryId}`);
    categoryIds.add(categoryId);
    const subcategoryIds = new Set();
    (category?.subcategories ?? []).forEach((subcategory) => {
      const subcategoryId = validateTaxonomyId(subcategory?.id, `Sous-catégorie de ${categoryId}`);
      if (subcategoryIds.has(subcategoryId)) throw new Error(`Sous-catégorie dupliquée dans ${categoryId}: ${subcategoryId}`);
      subcategoryIds.add(subcategoryId);
    });
  });
  const systemIds = new Set();
  systems.forEach((system) => {
    const systemId = validateTaxonomyId(system?.id, 'Système constructif');
    if (systemIds.has(systemId)) throw new Error(`Système constructif dupliqué: ${systemId}`);
    systemIds.add(systemId);
  });
};

const resolveDbFilePath = (file) => {
  const normalizedFile = String(file ?? '').trim();
  if (!/^[a-zA-Z0-9_.-]+\.json$/.test(normalizedFile)) {
    throw new Error('Nom de fichier DB invalide.');
  }
  const resolved = path.resolve(dbDir, normalizedFile);
  if (!resolved.startsWith(`${dbDir}${path.sep}`)) {
    throw new Error('Chemin DB hors dossier autorise.');
  }
  return resolved;
};

const readJsonArray = (targetPath = customComponentsPath) => {
  try {
    if (!fs.existsSync(targetPath)) return [];
    const raw = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const mergeById = (items) => {
  const map = new Map();
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = item.id ?? item.serialNo;
    if (key === undefined || key === null || key === '') return;
    map.set(String(key), item);
  });
  return Array.from(map.values());
};

const componentSourceFiles = () => readJson(dbManifestPath, [])
  .map((entry) => (typeof entry === 'string' ? entry : entry?.file))
  .filter((file) => file && file !== 'components_custom.json');

const sourceComponentIds = () => {
  const ids = new Map();
  componentSourceFiles().forEach((file) => {
    readJsonArray(resolveDbFilePath(file)).forEach((component) => {
      if (component?.id !== undefined && component?.id !== null) ids.set(String(component.id), file);
    });
  });
  return ids;
};

const customSourceCollisions = (components) => {
  const sourceIds = sourceComponentIds();
  return components
    .filter((component) => sourceIds.has(String(component?.id)))
    .map((component) => ({ id: component.id, sourceFile: sourceIds.get(String(component.id)) }));
};

const structureSourceConfig = {
  lignum: { file: 'components_unified.json', selectedFile: 'components_lignum_selected.json' },
  minergie: { file: 'components_minergie_enriched.json' },
  btk: { file: 'components_btk_enriched.json' },
  generated: { file: 'components_generated.json' },
};

const roundedCompositionValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)) : null;
};

const layerCompositionKey = (layer) => JSON.stringify({
  productId: layer?.productId || null,
  materialId: layer?.materialId || null,
  thickness_mm: roundedCompositionValue(layer?.thickness_mm),
  width_mm: roundedCompositionValue(layer?.width_mm),
  spacing_mm: roundedCompositionValue(layer?.spacing_mm),
  structure: layer?.structure || 'on-lying',
  fiberDirection: layer?.fiberDirection || null,
  protectsSupportSidesFromFire: Boolean(layer?.protectsSupportSidesFromFire),
});

const componentCompositionSignature = (component) => JSON.stringify({
  categoryId: component?.categoryId || null,
  layers: (component?.structure?.layers || []).map(layerCompositionKey),
});

const layerRoleValue = (layer) => layer?.layerFunctionId || (layer?.isSupportStructure ? 'structure' : 'other');
const layerMetadataDiffers = (currentLayer, incomingLayer) => (
  layerRoleValue(currentLayer) !== layerRoleValue(incomingLayer)
  || (currentLayer?.ecccId || null) !== (incomingLayer?.ecccId || null)
);

const applyLayerIdentification = (currentComponent, incomingComponent) => ({
  ...currentComponent,
  structure: {
    ...(currentComponent.structure || {}),
    layers: (currentComponent.structure?.layers || []).map((layer, index) => {
      const incomingLayer = incomingComponent.structure?.layers?.[index];
      if (!incomingLayer) return layer;
      const role = layerRoleValue(incomingLayer);
      return {
        ...layer,
        layerFunctionId: role,
        isSupportStructure: role === 'structure',
        insulationTypeId: role === 'insulation' ? (incomingLayer.insulationTypeId || null) : null,
        ecccId: incomingLayer.ecccId || null,
        ecccDescription: incomingLayer.ecccId ? (incomingLayer.ecccDescription || null) : null,
      };
    }),
  },
});

const backupAndWrite = (targetPath, items, versionName) => {
  const result = saveVersioned({
    activeFile: targetPath,
    versionsDir: path.join(versionsDir, versionName),
    baseName: versionName,
    items,
    previousItems: readJson(targetPath, []),
  });
  return result;
};

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

module.exports = function registerApiRoutes(app) {
  registerAuthRoutes(app);
  registerCollaborationRoutes(app);
  app.use(systemDatabaseRoutes, requireAuth('dashboard'), requireLocalSystemDatabase);
  app.use('/api', requireAuth('app'));

  const sendJson = (res, payload, statusCode = 200) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  const withApiError = (res, error) => sendJson(res, { ok: false, error: error.message }, 500);

  const ensureMappings = () => {
    if (fs.existsSync(mappingsPath)) return readJson(mappingsPath, []);
    const derived = deriveMappings(readJson(unifiedPath, []), readJson(selectedPath, []));
    writeJson(mappingsPath, derived);
    return derived;
  };

  app.get('/api/taxonomies', (req, res) => {
    try {
      sendJson(res, {
        ok: true,
        categories: readJson(categoriesPath, { categories: [] }).categories ?? [],
        systems: readJson(constructionSystemsPath, { systems: [] }).systems ?? [],
      });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.put('/api/taxonomies', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const categories = payload.categories;
      const systems = payload.systems;
      if (!Array.isArray(categories) || !Array.isArray(systems)) {
        throw new Error('Payload invalide: categories[] et systems[] attendus.');
      }
      validateTaxonomies(categories, systems);
      writeJson(categoriesPath, { categories });
      writeJson(constructionSystemsPath, { systems });
      sendJson(res, { ok: true, categoryCount: categories.length, systemCount: systems.length });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.get('/api/lignum/status', (req, res) => {
    try {
      const listVersions = (name) => {
        const directory = path.join(versionsDir, name);
        if (!fs.existsSync(directory)) return [];
        return fs.readdirSync(directory).filter((file) => file.endsWith('.json')).sort().reverse();
      };
      sendJson(res, {
        ok: true,
        counts: {
          unified: readJson(unifiedPath, []).length,
          selected: readJson(selectedPath, []).length,
          materials: readJson(materialsPath, []).length,
          products: readJson(productsPath, []).length,
          mappings: ensureMappings().filter((item) => item.tbzId).length,
        },
        versions: {
          unified: listVersions('components_unified'),
          selected: listVersions('components_lignum_selected'),
          materials: listVersions('tbz_materials'),
          products: listVersions('tbz_products_composites'),
          mappings: listVersions('lignum_product_tbz'),
        },
      });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.get('/api/structures/workspace', (req, res) => {
    try {
      sendJson(res, {
        ok: true,
        layerGroups: readJson(structureLayerGroupsPath, []),
        generatedComponents: readJson(generatedComponentsPath, []),
        generationHistory: readJson(generationHistoryPath, []),
        mappings: ensureMappings(),
      });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.get('/api/structures/history', (req, res) => {
    try {
      const components = readJson(generatedComponentsPath, []);
      const { history } = reconcileGenerationHistory(components, readJson(generationHistoryPath, []));
      res.setHeader('Cache-Control', 'no-store');
      sendJson(res, { ok: true, history: history.filter((run) => !run.deletedAt), components });
    } catch (error) { withApiError(res, error); }
  });

  app.patch('/api/structures/history/:id', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const tools = await loadGenerationTools();
      const history = reconcileGenerationHistory(readJson(generatedComponentsPath, []), readJson(generationHistoryPath, [])).history;
      const index = history.findIndex((run) => run.id === req.params.id);
      if (index < 0) return sendJson(res, { ok: false, error: 'Génération introuvable.' }, 404);
      const run = history[index];
      if (payload.expectedRevision !== run.revision) return sendJson(res, { ok: false, error: 'Cette génération a changé. Rechargez son historique.' }, 409);
      const allowedIds = new Set(run.componentIds);
      if (!Array.isArray(payload.componentIds) || !payload.componentIds.length || payload.componentIds.some((id) => !allowedIds.has(id))) return sendJson(res, { ok: false, error: 'Sélection de composants hors de cette génération.' }, 400);
      if (payload.patch?.ecccId && !readJson(path.resolve(__dirname, '../src/data/eccc.json'), []).some((entry) => entry.id === payload.patch.ecccId)) return sendJson(res, { ok: false, error: 'Code eCCC inconnu.' }, 400);
      const current = readJson(generatedComponentsPath, []);
      const currentById = new Map(current.map((item) => [item.id, item]));
      if (payload.componentIds.some((id) => !currentById.has(id) || payload.expectedVersions?.[id] !== (currentById.get(id).metadata?.updated_at || null))) return sendJson(res, { ok: false, error: 'Un composant a été modifié ou supprimé. Rechargez l’historique avant de continuer.' }, 409);
      let items, changed;
      if (Array.isArray(payload.replacements)) {
        const replacements = new Map(payload.replacements.map((entry) => [entry.id, entry.layers]));
        if (replacements.size !== payload.componentIds.length || payload.componentIds.some((id) => !replacements.has(id))) return sendJson(res, { ok: false, error: 'Les composants modifiés ne correspondent pas à la sélection.' }, 400);
        changed = [];
        items = current.map((component) => {
          if (!replacements.has(component.id)) return component;
          const layers = replacements.get(component.id);
          if (!Array.isArray(layers)) throw new Error('Liste de couches invalide.');
          for (const layer of layers) {
            for (const key of ['thickness_mm', 'width_mm', 'spacing_mm', 'time_burning_min', 'time_fire_start_min']) {
              if (layer[key] !== null && layer[key] !== undefined && (typeof layer[key] !== 'number' || !Number.isFinite(layer[key]) || layer[key] < 0)) throw new Error(`Dimension invalide : ${key}`);
            }
          }
          const updated = { ...component, structure: { ...component.structure, layers: layers.map((layer, order) => ({ ...layer, order })) } };
          changed.push(updated);
          return updated;
        });
      } else ({ items, changed } = patchGenerationLayers(current, payload, tools.catalog));
      if (!changed.length) return sendJson(res, { ok: false, error: 'Aucune couche ne correspond aux paramètres précédents.' }, 400);
      const recalculated = new Map(changed.map((item) => [item.id, tools.recalculate(item)]));
      const next = items.map((item) => recalculated.get(item.id) || item);
      const signatures = new Map();
      for (const item of next) {
        const signature = componentCompositionSignature(item);
        const existing = signatures.get(signature);
        const changedComposition = (id) => recalculated.has(id) && componentCompositionSignature(currentById.get(id)) !== componentCompositionSignature(recalculated.get(id));
        const wereAlreadyIdentical = existing && componentCompositionSignature(currentById.get(existing)) === componentCompositionSignature(currentById.get(item.id));
        if (existing && !wereAlreadyIdentical && (changedComposition(existing) || changedComposition(item.id))) return sendJson(res, { ok: false, error: `La modification créerait deux compositions identiques (${existing} et ${item.id}). Aucun changement enregistré.` }, 409);
        signatures.set(signature, item.id);
      }
      const saved = backupAndWrite(generatedComponentsPath, next, 'components_generated');
      const now = new Date().toISOString();
      history[index] = { ...run, name: String(payload.name || run.name).slice(0, 200), updatedAt: now, revision: run.revision + 1, events: [...(run.events || []), {
        at: now, type: payload.replacements ? 'groups_update' : 'parameter_update', layerKey: payload.layerKey, patch: payload.patch,
        componentIds: [...recalculated.keys()], versionFile: saved.file,
        previousLayers: changed.map((item) => ({ componentId: item.id, layers: currentById.get(item.id).structure.layers.filter((layer) => payload.replacements || generationLayerKey(layer) === payload.layerKey) })),
      }] };
      saveHistory(history);
      sendJson(res, { ok: true, updated: saved.items.filter((item) => recalculated.has(item.id)), history, versionFile: saved.file });
    } catch (error) { withApiError(res, error); }
  });

  app.delete('/api/structures/history/:id', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const current = readJson(generatedComponentsPath, []);
      const history = reconcileGenerationHistory(current, readJson(generationHistoryPath, [])).history;
      const index = history.findIndex((run) => run.id === req.params.id && !run.deletedAt);
      if (index < 0) return sendJson(res, { ok: false, error: 'Génération introuvable.' }, 404);
      const run = history[index];
      if (run.revision !== payload.expectedRevision) return sendJson(res, { ok: false, error: 'Historique modifié. Rechargez avant de supprimer.' }, 409);
      const result = planGenerationDeletion(current, history, run);
      const saved = backupAndWrite(generatedComponentsPath, result.items, 'components_generated');
      const now = new Date().toISOString();
      history[index] = { ...run, deletedAt: now, updatedAt: now, revision: run.revision + 1, events: [...(run.events || []), { type: 'deleted', at: now, componentIds: result.deletedIds, retainedIds: result.retainedIds, versionFile: saved.file }] };
      saveHistory(history);
      sendJson(res, { ok: true, deletedIds: result.deletedIds, retainedIds: result.retainedIds, history: history.filter((entry) => !entry.deletedAt), versionFile: saved.file });
    } catch (error) { withApiError(res, error); }
  });

  app.put('/api/structures/layer-groups', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const groups = Array.isArray(payload.groups) ? payload.groups : null;
      if (!groups) return sendJson(res, { ok: false, error: 'groups[] attendu.' }, 400);
      const invalid = groups.some((group) => !group?.id || !group?.categoryId || !['above', 'below', 'structure'].includes(group?.position) || !Array.isArray(group?.layers));
      if (invalid) return sendJson(res, { ok: false, error: 'Un groupe de couches est incomplet.' }, 400);
      const result = backupAndWrite(structureLayerGroupsPath, groups, 'structure_layer_groups');
      return sendJson(res, { ok: true, count: result.count, versionFile: result.file, groups: result.items });
    } catch (error) {
      return withApiError(res, error);
    }
  });

  app.put('/api/structures/component/:source/:id', async (req, res) => {
    try {
      const config = structureSourceConfig[String(req.params.source || '').toLowerCase()];
      if (!config) return sendJson(res, { ok: false, error: 'Base de structure inconnue.' }, 400);
      const targetPath = path.join(dbDir, config.file);
      const current = readJson(targetPath, []);
      const index = current.findIndex((item) => String(item?.id) === String(req.params.id));
      if (index < 0) return sendJson(res, { ok: false, error: 'Composant introuvable.' }, 404);
      const payload = await readRequestBody(req);
      const layers = payload.layers;
      if (!Array.isArray(layers)) return sendJson(res, { ok: false, error: 'layers[] attendu.' }, 400);
      const item = {
        ...current[index],
        structure: {
          ...(current[index].structure || {}),
          layers: layers.map((layer, order) => ({ ...layer, order })),
        },
      };
      const next = [...current];
      next[index] = item;
      const result = backupAndWrite(targetPath, next, config.file.replace('.json', ''));

      if (config.selectedFile) {
        const selectedPathForSource = path.join(dbDir, config.selectedFile);
        const selected = readJson(selectedPathForSource, []);
        const selectedIndex = selected.findIndex((entry) => String(entry?.id) === String(req.params.id));
        if (selectedIndex >= 0) {
          const nextSelected = [...selected];
          nextSelected[selectedIndex] = {
            ...selected[selectedIndex],
            structure: { ...(selected[selectedIndex].structure || {}), layers: item.structure.layers },
          };
          backupAndWrite(selectedPathForSource, nextSelected, config.selectedFile.replace('.json', ''));
        }
      }
      return sendJson(res, { ok: true, item: result.items[index], versionFile: result.file });
    } catch (error) {
      return withApiError(res, error);
    }
  });

  app.post('/api/structures/generate', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const incoming = Array.isArray(payload.components) ? payload.components : null;
      if (!incoming) return sendJson(res, { ok: false, error: 'components[] attendu.' }, 400);
      const tools = await loadGenerationTools();
      // Resolve and calculate before any file write; unresolved references abort the batch.
      const prepared = incoming.map(tools.recalculate);
      const runId = newId();
      const comparisonFiles = [...new Set(componentSourceFiles().concat(['components_unified.json', 'components_generated.json']))];
      const states = new Map(comparisonFiles.map((file) => [file, {
        file,
        items: readJson(path.join(dbDir, file), []),
        changed: false,
      }]));
      const locationsBySignature = new Map();
      states.forEach((state) => state.items.forEach((component, index) => {
        const signature = componentCompositionSignature(tools.component(component));
        if (!locationsBySignature.has(signature)) locationsBySignature.set(signature, []);
        locationsBySignature.get(signature).push({ state, index });
      }));
      const signatures = new Set(locationsBySignature.keys());
      const created = [];
      const updated = new Map();
      const reused = new Map();
      let skipped = 0;
      prepared.forEach((candidate) => {
        const signature = componentCompositionSignature(candidate);
        if (signatures.has(signature)) {
          let changed = false;
          (locationsBySignature.get(signature) || []).forEach(({ state, index }) => {
            const currentComponent = state.items[index];
            if (currentComponent.source?.databaseId === 'generated') reused.set(currentComponent.id, currentComponent);
            const currentLayers = currentComponent.structure?.layers || [];
            const incomingLayers = candidate.structure?.layers || [];
            if (!incomingLayers.some((layer, layerIndex) => layerMetadataDiffers(currentLayers[layerIndex], layer))) return;
            const nextComponent = applyLayerIdentification(currentComponent, candidate);
            state.items[index] = nextComponent;
            state.changed = true;
            changed = true;
            const updateKey = `${currentComponent.source?.databaseId || state.file}:${currentComponent.id}`;
            updated.set(updateKey, nextComponent);
          });
          if (!changed) skipped += 1;
          return;
        }
        signatures.add(signature);
        const id = newId();
        created.push({
          ...candidate,
          id,
          source: { name: 'AutoSpec – variantes générées', databaseId: 'generated', externalId: id },
          generated: true,
          generationRunId: runId,
          generationSignature: signature,
          generatedAt: new Date().toISOString(),
        });
      });
      if (created.length) {
        const generatedState = states.get('components_generated.json');
        generatedState.items.push(...created);
        generatedState.changed = true;
      }
      const versions = [];
      states.forEach((state) => {
        if (!state.changed) return;
        const result = backupAndWrite(path.join(dbDir, state.file), state.items, state.file.replace('.json', ''));
        versions.push(result.file);
      });
      const tracked = [...created, ...updated.values(), ...reused.values()].filter((item) => item.source?.databaseId === 'generated');
      if (prepared.length) {
        const now = new Date().toISOString();
        const previousGenerated = states.get('components_generated.json').items.filter((item) => item.generationRunId !== runId);
        const history = reconcileGenerationHistory(previousGenerated, readJson(generationHistoryPath, [])).history;
        history.push({
          id: runId, name: String(payload.name || `Génération ${now}`).slice(0, 200),
          createdAt: now, updatedAt: now, revision: 1,
          componentIds: [...new Set(tracked.map((item) => item.id))],
          createdComponentIds: created.map((item) => item.id),
          reusedComponentIds: [...reused.keys()],
          parameters: payload.parameters || null,
          events: [{ at: now, type: 'generation', createdIds: created.map((item) => item.id), updatedIds: [...updated.values()].map((item) => item.id) }],
        });
        saveHistory(history);
      }
      return sendJson(res, {
        ok: true,
        created,
        updated: [...updated.values()],
        skipped,
        count: states.get('components_generated.json')?.items.length || 0,
        versionFile: versions.find((file) => String(file).includes('components_generated')) || versions[0] || null,
        versionFiles: versions,
      });
    } catch (error) {
      return withApiError(res, error);
    }
  });

  app.post('/api/lignum/unify', async (req, res) => {
    try {
      const de = readJson(path.join(sourceComponentsDir, 'Lignum_components_de.json'));
      const en = readJson(path.join(sourceComponentsDir, 'Lignum_components_en.json'));
      const fr = readJson(path.join(sourceComponentsDir, 'Lignum_components_fr.json'));
      if (!de.length || de.length !== en.length || de.length !== fr.length) {
        throw new Error(`Sources Lignum incomplètes ou désalignées (de=${de.length}, en=${en.length}, fr=${fr.length}).`);
      }
      const result = saveVersioned({
        activeFile: unifiedPath,
        versionsDir: path.join(versionsDir, 'components_unified'),
        baseName: 'components_unified',
        items: buildUnifiedComponents(de, en, fr),
      });
      sendJson(res, { ok: true, count: result.count, versionFile: result.file });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.post('/api/lignum/selection', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const selectedIds = new Set((payload.selectedIds || []).map(String));
      const unified = readJson(unifiedPath, []);
      const chosen = unified.filter((item) => selectedIds.has(String(item.id)));
      if (chosen.length !== selectedIds.size) throw new Error('Certains composants sélectionnés ne sont plus présents dans la base unifiée. Rechargez la page.');
      const [{ calculateComponentProperties }, { applyCustomFireTimingToComponent }] = await Promise.all([
        import('../src/utils/componentPropriety.js'),
        import('../src/utils/customFireTiming.js'),
      ]);
      const materials = readJson(materialsPath, []);
      const products = readJson(productsPath, []);
      const kbob = readJson(path.resolve(__dirname, '../src/data/KBOB_mat_db.json'), []);
      const categories = readJson(categoriesPath, {}).categories || [];
      const mapped = preserveSelectedComponents(
        applyMappings(chosen, ensureMappings(), true),
        readJson(selectedPath, []),
        (component) => applyCustomFireTimingToComponent(
          calculateComponentProperties(component, materials, products, kbob, {
            categories, componentServiceLifeYears: 60,
          }),
          materials, products,
        ),
      );
      const result = saveVersioned({
        activeFile: selectedPath,
        versionsDir: path.join(versionsDir, 'components_lignum_selected'),
        baseName: 'components_lignum_selected',
        items: mapped,
      });
      sendJson(res, { ok: true, count: result.count, versionFile: result.file });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.get('/api/lignum/diagnostics', (req, res) => {
    try {
      const scope = req.query.scope === 'unified' ? 'unified' : 'selected';
      const unified = readJson(unifiedPath, []);
      const selected = readJson(selectedPath, []);
      const selectedIds = new Set(selected.map((item) => String(item.id)));
      const components = scope === 'unified'
        ? unified
        : unified.filter((item) => selectedIds.has(String(item.id)));
      sendJson(res, {
        ok: true,
        scope,
        ...validateComponents(components, readJson(materialsPath, []), readJson(productsPath, []), {
          mappings: ensureMappings(),
          selectedComponents: scope === 'selected' ? selected : [],
        }),
      });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.get('/api/lignum/mappings', (req, res) => {
    try {
      const mappings = ensureMappings();
      const mapBySource = new Map(mappings.map((item) => [String(item.lignumId), item]));
      const selectedIds = new Set(readJson(selectedPath, []).map((item) => String(item.id)));
      const references = new Map();
      readJson(unifiedPath, []).forEach((component) => (component.structure?.layers || []).forEach((layer) => {
        if (!layer.productId) return;
        const lignumId = String(layer.productId);
        const existing = references.get(lignumId);
        if (!existing) {
          references.set(lignumId, {
            layer,
            usedBySelected: selectedIds.has(String(component.id)),
            componentCount: 1,
          });
        } else {
          existing.usedBySelected = existing.usedBySelected || selectedIds.has(String(component.id));
          existing.componentCount += 1;
        }
      }));
      const sourceProducts = new Map(readJson(path.join(sourceProductsDir, 'Lignum_Products_de.json'), []).map((item) => [String(item.id), item]));
      const tbzItems = [...readJson(materialsPath, []).map((item) => ({ ...item, kind: 'material' })), ...readJson(productsPath, []).map((item) => ({ ...item, kind: 'product' }))];
      const rows = Array.from(references, ([lignumId, reference]) => {
        const { layer } = reference;
        const source = sourceProducts.get(lignumId) || {};
        return {
          lignumId,
          usedBySelected: reference.usedBySelected,
          componentCount: reference.componentCount,
          tbzId: mapBySource.get(lignumId)?.tbzId || '',
          workingtitle: source.workingtitle || layer.productName || layer.translations?.de?.name || '',
          translations: layer.translations || {},
          materialTypeId: source.materialtyp?.workingtitle || source.materialtyp?.name || null,
          materialcategoryId: source.materialkategorie?.workingtitle || source.materialkategorie?.name || null,
          functionId: source.funktionen?.workingtitle || source.funktionen?.name || null,
          kbobId: source.kbobherstellung?.kbobId || layer.kbobId || null,
          siaId: source.siaid || null,
          density_kg_m3: source.dichte ?? null,
          thermalConductivity_W_mK: source.waermeleitfaehigkeit ?? null,
          specificHeat_Wh_kgK: source.waermespeicherfaehigkeitwattstunden ?? null,
          specificHeat_J_kgK: source.waermespeicherfaehigkeitjoule ?? null,
          waterVaporDiffusionResistanceCoefficientDry: source.wasserdampfdiffusionswiderstandszahltrocken ?? null,
          waterVaporDiffusionResistanceCoefficientWet: source.wasserdampfdiffusionswiderstandszahlfeucht ?? null,
          fireClassification: source.klassifizierung ?? null,
          reactionToFire: source.brandverhaltensgruppe ?? layer.reactionToFire ?? null,
        };
      });
      sendJson(res, { ok: true, rows, tbzItems });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.put('/api/lignum/mappings', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const incoming = Array.isArray(payload.mappings) ? payload.mappings : [];
      const now = new Date().toISOString();
      const previous = new Map(ensureMappings().map((item) => [String(item.lignumId), item]));
      const mappings = incoming.map((item) => {
        const old = previous.get(String(item.lignumId));
        return { lignumId: String(item.lignumId), tbzId: item.tbzId ? String(item.tbzId) : '', updated_at: old?.tbzId === item.tbzId ? old.updated_at : now };
      });
      const versionFile = saveVersioned({ activeFile: mappingsPath, versionsDir: path.join(versionsDir, 'lignum_product_tbz'), baseName: 'lignum_product_tbz', items: mappings, audit: false }).file;
      sendJson(res, { ok: true, count: mappings.filter((item) => item.tbzId).length, versionFile });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.post('/api/lignum/component', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const item = payload.item;
      if (!item || !item.id) throw new Error('Composant avec id attendu.');
      const current = readJson(unifiedPath, []);
      const index = current.findIndex((entry) => String(entry.id) === String(item.id));
      const next = [...current];
      if (index >= 0) next[index] = item; else next.push(item);
      const result = saveVersioned({ activeFile: unifiedPath, versionsDir: path.join(versionsDir, 'components_unified'), baseName: 'components_unified', items: next, previousItems: current });
      sendJson(res, { ok: true, item: result.items.find((entry) => String(entry.id) === String(item.id)), versionFile: result.file });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.post('/api/catalog/:kind', async (req, res) => {
    try {
      const config = req.params.kind === 'materials'
        ? { file: materialsPath, dir: 'tbz_materials', base: 'tbz_materials' }
        : req.params.kind === 'products'
          ? { file: productsPath, dir: 'tbz_products_composites', base: 'tbz_products_composites' }
          : null;
      if (!config) throw new Error('Catalogue inconnu.');
      const payload = await readRequestBody(req);
      const item = { ...(payload.item || {}) };
      if (!item.id) item.id = newId();
      if (!item.workingtitle) throw new Error('workingtitle est obligatoire.');
      const current = readJson(config.file, []);
      const index = current.findIndex((entry) => String(entry.id) === String(item.id));
      const next = [...current];
      if (index >= 0) next[index] = item; else next.push(item);
      const result = saveVersioned({ activeFile: config.file, versionsDir: path.join(versionsDir, config.dir), baseName: config.base, items: next, previousItems: current });
      sendJson(res, { ok: true, item: result.items.find((entry) => String(entry.id) === String(item.id)), versionFile: result.file });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.post('/api/components-custom', async (req, res) => {
    try {
      const payload = await readRequestBody(req);
      const incoming = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.components)
          ? payload.components
          : [payload.component ?? payload];

      if (incoming.some((component) => !component?.id)) {
        return sendJson(res, { ok: false, error: 'Chaque composant Custom doit avoir un nouvel ID.' }, 400);
      }
      const collisions = customSourceCollisions(incoming);
      if (collisions.length) {
        return sendJson(res, {
          ok: false,
          error: `ID deja utilise dans une base source: ${collisions.map(({ id, sourceFile }) => `${id} (${sourceFile})`).join(', ')}`,
          collisions,
        }, 409);
      }

      const merged = mergeById([...readJsonArray(), ...incoming]);
      fs.mkdirSync(path.dirname(customComponentsPath), { recursive: true });
      fs.writeFileSync(customComponentsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, count: merged.length }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });

  app.post('/api/components-source/:file', async (req, res) => {
    try {
      if (req.auth?.rawUser?.role !== 'admin') return sendJson(res, { ok: false, error: 'Accès administrateur requis.' }, 403);
      requireCsrf(req);
      const file = req.params.file;
      const manifest = readJson(dbManifestPath, []).map((entry) => typeof entry === 'string' ? { file: entry, label: entry } : entry);
      if (!manifest.some((entry) => entry.file === file)) return sendJson(res, { ok: false, error: 'Base de destination inconnue.' }, 400);
      const payload = await readRequestBody(req);
      const databases = manifest.map((entry) => ({ ...entry, items: readJsonArray(resolveDbFilePath(entry.file)) }));
      const component = prepareSystemComponentCreation({ actor: req.auth.rawUser, file, component: payload.component, databases });
      const destination = databases.find((database) => database.file === file);
      const targetPath = resolveDbFilePath(file);
      const backupDirectory = path.join(versionsDir, 'component_creation', new Date().toISOString().replace(/[:.]/g, '-'));
      writeJson(path.join(backupDirectory, file), destination.items);
      writeJson(targetPath, [...destination.items, component]);
      return sendJson(res, { ok: true, component: { ...component, __sourceFile: file }, file, backupDirectory: path.relative(dbDir, backupDirectory) }, 201);
    } catch (error) {
      return sendJson(res, { ok: false, error: error.message }, error.statusCode || 500);
    }
  });

  app.put('/api/components-source/:file/:id', async (req, res) => {
    try {
      const file = req.params.file;
      if (!componentSourceFiles().includes(file)) {
        return sendJson(res, { ok: false, error: 'Base source inconnue ou non modifiable.' }, 400);
      }
      const targetPath = resolveDbFilePath(file);
      const current = readJsonArray(targetPath);
      const index = current.findIndex((item) => String(item?.id) === String(req.params.id));
      if (index < 0) return sendJson(res, { ok: false, error: 'Composant introuvable dans sa base source.' }, 404);

      const payload = await readRequestBody(req);
      const incoming = payload.component ?? payload;
      if (!incoming || String(incoming.id) !== String(req.params.id)) {
        return sendJson(res, { ok: false, error: "L'ID d'un composant existant ne peut pas etre change." }, 400);
      }
      if (readJsonArray(customComponentsPath).some((item) => String(item?.id) === String(incoming.id))) {
        return sendJson(res, { ok: false, error: 'Cet ID existe encore dans components_custom.json.' }, 409);
      }

      const nextComponent = { ...incoming, source: current[index]?.source ?? incoming.source };
      delete nextComponent.__sourceFile;
      const next = [...current];
      next[index] = nextComponent;

      const backupDirectory = path.join(versionsDir, 'component_edits', new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(backupDirectory, { recursive: true });
      fs.copyFileSync(targetPath, path.join(backupDirectory, file));
      fs.writeFileSync(targetPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      return sendJson(res, { ok: true, file, id: incoming.id, backupDirectory: path.relative(dbDir, backupDirectory) });
    } catch (error) {
      return withApiError(res, error);
    }
  });

  app.delete('/api/components-source/:file/:id', async (req, res) => {
    try {
      const file = req.params.file;
      if (!componentSourceFiles().includes(file)) {
        return sendJson(res, { ok: false, error: 'Base source inconnue ou non modifiable.' }, 400);
      }
      const targetPath = resolveDbFilePath(file);
      const current = readJsonArray(targetPath);
      const index = current.findIndex((item) => String(item?.id) === String(req.params.id));
      if (index < 0) return sendJson(res, { ok: false, error: 'Composant introuvable dans sa base source.' }, 404);

      const next = current.filter((_, itemIndex) => itemIndex !== index);
      const backupDirectory = path.join(versionsDir, 'component_edits', new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(backupDirectory, { recursive: true });
      fs.copyFileSync(targetPath, path.join(backupDirectory, file));
      fs.writeFileSync(targetPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      return sendJson(res, {
        ok: true,
        file,
        id: req.params.id,
        count: next.length,
        backupDirectory: path.relative(dbDir, backupDirectory),
      });
    } catch (error) {
      return withApiError(res, error);
    }
  });

  app.delete('/api/components-custom/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const nextItems = readJsonArray(customComponentsPath).filter((item) => String(item?.id) !== String(id));
      fs.mkdirSync(path.dirname(customComponentsPath), { recursive: true });
      fs.writeFileSync(customComponentsPath, `${JSON.stringify(nextItems, null, 2)}\n`, 'utf8');

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, count: nextItems.length }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });

  app.put('/api/db/:file', async (req, res) => {
    try {
      const targetPath = resolveDbFilePath(req.params.file);
      const payload = await readRequestBody(req);
      const components = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.components)
          ? payload.components
          : null;

      if (!components) {
        throw new Error('Payload invalide: components[] attendu.');
      }
      if (req.params.file === 'components_custom.json') {
        const collisions = customSourceCollisions(components);
        if (collisions.length) {
          return sendJson(res, { ok: false, error: 'components_custom.json contient des IDs de bases sources.', collisions }, 409);
        }
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, `${JSON.stringify(components, null, 2)}\n`, 'utf8');

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, file: req.params.file, count: components.length }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });
};
