const fs = require('fs');
const path = require('path');

const customComponentsPath = path.resolve(__dirname, '../public/db/components_custom.json');
const dbDir = path.resolve(__dirname, '../public/db');

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
