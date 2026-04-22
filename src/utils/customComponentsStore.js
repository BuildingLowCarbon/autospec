const CUSTOM_COMPONENTS_STORAGE_KEY = 'autospec.components_custom.v1';
const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeArray = (payload) => (Array.isArray(payload) ? payload : []);

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export const readLocalCustomComponents = () => {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(CUSTOM_COMPONENTS_STORAGE_KEY);
  if (!raw) return [];
  return normalizeArray(safeJsonParse(raw, []));
};

export const writeLocalCustomComponents = (components) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CUSTOM_COMPONENTS_STORAGE_KEY, JSON.stringify(normalizeArray(components)));
};

export const mergeById = (items) => {
  const map = new Map();
  normalizeArray(items).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = item.id ?? item.serialNo ?? randomId();
    map.set(String(key), item);
  });
  return Array.from(map.values());
};

export const withCustomSource = (item) => ({
  ...item,
  source: {
    ...(item?.source ?? {}),
    name: item?.source?.name ?? 'Custom',
    databaseId: item?.source?.databaseId ?? 'custom',
  },
  __sourceFile: 'components_custom.json',
});
