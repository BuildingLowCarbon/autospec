const fs = require('fs');
const path = require('path');
const {
  applyMappings,
  buildUnifiedComponents,
  deriveMappings,
  newId,
  preserveCalculatedIfUnchanged,
  readJson,
  saveVersioned,
  validateComponents,
  writeJson,
} = require('../server/lignumDatabase');

const customComponentsPath = path.resolve(__dirname, '../public/db/components_custom.json');
const dbDir = path.resolve(__dirname, '../public/db');
const versionsDir = path.join(dbDir, 'versions');
const sourceComponentsDir = path.join(dbDir, 'source_database', 'lignum', 'components');
const sourceProductsDir = path.join(dbDir, 'source_database', 'lignum', 'products');
const unifiedPath = path.join(dbDir, 'components_unified.json');
const selectedPath = path.join(dbDir, 'components_lignum_selected.json');
const materialsPath = path.join(dbDir, 'materials', 'tbz_materials.json');
const productsPath = path.join(dbDir, 'products', 'tbz_products_composites.json');
const mappingsPath = path.join(dbDir, 'mappings', 'lignum_product_tbz.json');

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

module.exports = function setupProxy(app) {
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
      const mapped = preserveCalculatedIfUnchanged(
        applyMappings(chosen, ensureMappings(), true),
        readJson(selectedPath, []),
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
      const components = readJson(scope === 'unified' ? unifiedPath : selectedPath, []);
      sendJson(res, { ok: true, scope, ...validateComponents(components, readJson(materialsPath, []), readJson(productsPath, [])) });
    } catch (error) {
      withApiError(res, error);
    }
  });

  app.get('/api/lignum/mappings', (req, res) => {
    try {
      const mappings = ensureMappings();
      const mapBySource = new Map(mappings.map((item) => [String(item.lignumId), item]));
      const references = new Map();
      readJson(unifiedPath, []).forEach((component) => (component.structure?.layers || []).forEach((layer) => {
        if (layer.productId && !references.has(String(layer.productId))) references.set(String(layer.productId), layer);
      }));
      const sourceProducts = new Map(readJson(path.join(sourceProductsDir, 'Lignum_Products_de.json'), []).map((item) => [String(item.id), item]));
      const tbzItems = [...readJson(materialsPath, []).map((item) => ({ ...item, kind: 'material' })), ...readJson(productsPath, []).map((item) => ({ ...item, kind: 'product' }))];
      const rows = Array.from(references, ([lignumId, layer]) => {
        const source = sourceProducts.get(lignumId) || {};
        return {
          lignumId,
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
