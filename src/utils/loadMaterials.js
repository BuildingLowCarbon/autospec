const MATERIAL_FILES = ['materials/tbz_materials.json'];

let cachedMaterials = null;

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

const loadMaterials = async () => {
  if (cachedMaterials) return cachedMaterials;

  const base = process.env.PUBLIC_URL || '';
  const results = await Promise.all(MATERIAL_FILES.map((file) => fetchJson(`${base}/db/${file}`)));
  cachedMaterials = results.flat();
  return cachedMaterials;
};

export default loadMaterials;
