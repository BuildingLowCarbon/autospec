let cachedComponents = null;

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

export const fetchDbFilesList = async (base = process.env.PUBLIC_URL || '') => {
  const manifestUrl = `${base}/db/db_files.json`;
  const files = await fetchJson(manifestUrl);
  if (Array.isArray(files) && files.length) {
    return Array.from(
      new Set(
        files
          .filter((f) => typeof f === 'string' && f.toLowerCase().endsWith('.json'))
          .map((f) => f.trim())
      )
    );
  }
  console.warn('Manifest db_files.json introuvable ou vide.');
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
