const fs = require('fs');
const path = require('path');

const customComponentsPath = path.resolve(__dirname, '../public/db/components_custom.json');

const readJsonArray = () => {
  try {
    if (!fs.existsSync(customComponentsPath)) return [];
    const raw = fs.readFileSync(customComponentsPath, 'utf8');
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
};
