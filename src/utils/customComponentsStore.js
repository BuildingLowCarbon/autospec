const CUSTOM_COMPONENTS_STORAGE_KEY = 'autospec.components_custom.v1';
export const createCustomComponentId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeArray = (payload) => (Array.isArray(payload) ? payload : []);

const normalizeSoundInsulation = (item) => {
  if (!item || typeof item !== 'object') return item;
  const next = { ...item };
  const legacy = next.acoustic ?? {};
  const current = next.sound_insulation ?? {};
  const airborne = current.airborneSound ?? {};
  const impact = current.impactSound ?? {};

  next.sound_insulation = {
    airborneSound: {
      Rw_dB: airborne.Rw_dB ?? legacy.Rw_dB ?? null,
      c100_3150_dB: airborne.c100_3150_dB ?? null,
      c50_3150_dB: airborne.c50_3150_dB ?? null,
      ctr100_3150_dB: airborne.ctr100_3150_dB ?? null,
    },
    impactSound: {
      Lnw_dB: impact.Lnw_dB ?? legacy.Lnw_dB ?? null,
      ci100_2500_dB: impact.ci100_2500_dB ?? null,
      ci50_2500_dB: impact.ci50_2500_dB ?? null,
    },
  };
  delete next.acoustic;
  return next;
};

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
  return normalizeArray(safeJsonParse(raw, [])).map(normalizeSoundInsulation);
};

export const writeLocalCustomComponents = (components) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    CUSTOM_COMPONENTS_STORAGE_KEY,
    JSON.stringify(normalizeArray(components).map(normalizeSoundInsulation)),
  );
};

export const writeFileCustomComponent = async (component) => {
  const normalizedComponent = normalizeSoundInsulation(component);
  const response = await fetch('/api/components-custom', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ component: normalizedComponent }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Ecriture components_custom.json impossible (${response.status})`);
  }

  return response.json();
};

export const writeFileSourceComponent = async (sourceFile, component) => {
  const normalizedComponent = normalizeSoundInsulation(component);
  const response = await fetch(
    `/api/components-source/${encodeURIComponent(sourceFile)}/${encodeURIComponent(component.id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ component: normalizedComponent }),
    },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Ecriture ${sourceFile} impossible (${response.status})`);
  }

  return response.json();
};

export const writeDbComponentsFile = async (file, components) => {
  const response = await fetch(`/api/db/${encodeURIComponent(file)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ components: normalizeArray(components).map(normalizeSoundInsulation) }),
  });

  if (!response.ok) {
    throw new Error(`Ecriture ${file} impossible (${response.status})`);
  }

  return response.json();
};

export const deleteFileCustomComponent = async (componentId) => {
  const response = await fetch(`/api/components-custom/${encodeURIComponent(componentId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Suppression components_custom.json impossible (${response.status})`);
  }

  return response.json();
};

export const deleteLocalCustomComponent = (componentId) => {
  const next = readLocalCustomComponents().filter((item) => String(item?.id) !== String(componentId));
  writeLocalCustomComponents(next);
  return next;
};

export const mergeById = (items) => {
  const map = new Map();
  normalizeArray(items).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const normalizedItem = normalizeSoundInsulation(item);
    const key = normalizedItem.id ?? normalizedItem.serialNo ?? createCustomComponentId();
    map.set(String(key), normalizedItem);
  });
  return Array.from(map.values());
};

export const withCustomSource = (item) => ({
  ...normalizeSoundInsulation(item),
  source: {
    name: 'Custom',
    databaseId: 'custom',
  },
  __sourceFile: 'components_custom.json',
});
