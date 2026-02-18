const PRODUCT_FILES = ['products/tbz_products_composites.json'];

let cachedProducts = null;

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

const loadProducts = async () => {
  if (cachedProducts) return cachedProducts;

  const base = process.env.PUBLIC_URL || '';
  const results = await Promise.all(PRODUCT_FILES.map((file) => fetchJson(`${base}/db/${file}`)));
  cachedProducts = results.flat();
  return cachedProducts;
};

export default loadProducts;
