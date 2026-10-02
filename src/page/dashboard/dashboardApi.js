export const apiJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Erreur HTTP ${response.status}`);
  return payload;
};

export const fetchArray = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Chargement impossible: ${url}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(`Le fichier ${url} ne contient pas une liste.`);
  return payload;
};

export const labelOf = (component, lang = 'fr') => {
  const order = [lang, 'fr', 'de', 'en', 'it'].filter((value, index, all) => value && all.indexOf(value) === index);
  for (const code of order) {
    const name = component?.translations?.[code]?.name;
    if (name !== null && name !== undefined && String(name).trim()) return name;
  }
  return component?.workingtitle || component?.serialNo || component?.id || 'Sans nom';
};
export const normalize = (value) => String(value ?? '').trim().toLowerCase();
