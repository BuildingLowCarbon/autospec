let cachedComponents = null;
let cachedDbSources = null;

const fetchJson = async (path) => {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      console.warn(`Impossible de charger ${path} (status ${res.status})`);
      return [];
    }
    const payload = await res.json();
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.error(`Erreur de chargement pour ${path}:`, error);
    return [];
  }
};

export const fetchDbSources = async (base = process.env.PUBLIC_URL || '') => {
  if (cachedDbSources) return cachedDbSources;
  const manifestUrl = `${base}/db/db_files.json`;
  const entries = await fetchJson(manifestUrl);
  if (Array.isArray(entries) && entries.length) {
    const seen = new Set();
    const normalized = [];
    entries.forEach((entry) => {
      if (typeof entry === 'string') {
        const file = entry.trim();
        if (!file || !file.toLowerCase().endsWith('.json') || seen.has(file)) return;
        seen.add(file);
        normalized.push({
          file,
          label: file.replace('.json', '').replace(/_/g, ' '),
        });
        return;
      }
      if (!entry || typeof entry !== 'object') return;
      const file = typeof entry.file === 'string' ? entry.file.trim() : '';
      if (!file || !file.toLowerCase().endsWith('.json') || seen.has(file)) return;
      seen.add(file);
      const label = typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : file.replace('.json', '').replace(/_/g, ' ');
      normalized.push({ file, label });
    });
    cachedDbSources = normalized;
    return cachedDbSources;
  }
  console.warn('Manifest db_files.json introuvable ou vide.');
  cachedDbSources = [];
  return cachedDbSources;
};

export const fetchDbFilesList = async (base = process.env.PUBLIC_URL || '') => {
  const sources = await fetchDbSources(base);
  if (Array.isArray(sources) && sources.length) {
    return sources.map((source) => source.file);
  }
  return [];
};

export const loadComponents = async () => {
  if (cachedComponents) return cachedComponents;

  const base = process.env.PUBLIC_URL || '';
  const dbFiles = await fetchDbFilesList(base);
  if (!dbFiles.length) {
    cachedComponents = [];
    return cachedComponents;
  }
  const results = await Promise.all(
    dbFiles.map((file) =>
      fetchJson(`${base}/db/${file}`).then((items) => items.map((item) => ({ ...item, __sourceFile: file })))
    )
  );

  const seen = new Set();
  cachedComponents = results
    .flat()
    .filter((item) => {
      const key = item?.id ?? item?.serialNo;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return cachedComponents;
};

export default loadComponents;
