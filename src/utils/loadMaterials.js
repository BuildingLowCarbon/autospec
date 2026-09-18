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

const loadMaterials = async ({ forceRefresh = false } = {}) => {
  if (forceRefresh) cachedMaterials = null;
  if (cachedMaterials) return cachedMaterials;

  const base = process.env.PUBLIC_URL || '';
  const readContent = async (url) => fetch(url, { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : { items: [] })
    .catch(() => ({ items: [] }));
  const [results, publicResponse, userResponse] = await Promise.all([
    Promise.all(MATERIAL_FILES.map((file) => fetchJson(`${base}/db/${file}`))),
    readContent('/api/public/content/materials'),
    readContent('/api/content/materials'),
  ]);
  const visibleMaterials = new Map();
  [...(publicResponse.items || []), ...(userResponse.items || [])]
    .forEach((item) => visibleMaterials.set(String(item.__contentId || item.id), item));
  cachedMaterials = [...results.flat(), ...visibleMaterials.values()];
  return cachedMaterials;
};

export const invalidateMaterialsCache = () => { cachedMaterials = null; };

export default loadMaterials;
