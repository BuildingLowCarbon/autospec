const VERSION_KEY = '__surfaceRowsVersion';
const SELECTION_KEY = '__surfaceSelectionIds';
const objectEntry = (entry) => entry && typeof entry === 'object' ? entry : { value: entry, auto: false };
export const surfaceRows = (surfaces, partId) => Object.entries(surfaces)
  .filter(([, entry]) => entry?.surfaceRow === true && (!partId || entry.partId === partId))
  .map(([key, entry]) => ({ key, ...entry }));

const newRowKey = (surfaces, partId) => {
  let index = 1;
  while (`surface:${partId}:${index}` in surfaces) index++;
  return `surface:${partId}:${index}`;
};

export const reconcileSurfaceRows = (surfaces = {}, selectedByPart, defaults, additionalParts = []) => {
  let next = { ...surfaces };
  const selectedIds = Object.values(selectedByPart).flatMap((items) => items.map((item) => item.id));
  if (surfaces[VERSION_KEY] !== 1) {
    next = { [VERSION_KEY]: 1, [SELECTION_KEY]: selectedIds };
    for (const [partId, items] of Object.entries(selectedByPart)) {
      const range = surfaces[`range:${partId}`];
      if (!items.length) next[`range:${partId}`] = {
        ...(range === undefined ? { value: defaults[partId], auto: true } : objectEntry(range)),
        partId, surfaceRow: true, basis: 'primary', assignedItemId: null,
      };
      items.forEach((item, index) => {
        const key = `component:${item.id}`;
        const saved = surfaces[key] ?? (index === 0 ? range : undefined);
        next[key] = {
          ...(saved === undefined ? { value: index === 0 ? defaults[partId] : 0, auto: true } : objectEntry(saved)),
          partId, surfaceRow: true, basis: index === 0 ? 'primary' : 'additional', assignedItemId: item.id,
        };
      });
    }
    // Recover additional legacy surfaces even if their component is no longer selected.
    for (const [key, entry] of Object.entries(surfaces)) {
      if (key.startsWith('component:') && !next[key] && selectedByPart[entry?.partId]) {
        next[key] = { ...objectEntry(entry), surfaceRow: true, assignedItemId: null, basis: entry.basis || 'additional' };
      }
    }
  }
  // Introduce new optional categories in saved buildings without recreating
  // any row that the user has already explicitly deleted.
  for (const partId of additionalParts) {
    if (!(next.__surfacePartIds || []).includes(partId) && !surfaceRows(next, partId).length) {
      next[`range:${partId}`] = { value: defaults[partId], auto: true, basis: 'primary', partId, surfaceRow: true, assignedItemId: null };
    }
  }
  next.__surfacePartIds = Object.keys(selectedByPart);
  const knownIds = new Set(next[SELECTION_KEY] || []);
  const presentIds = new Set(selectedIds);
  for (const { key, ...entry } of surfaceRows(next)) {
    if (entry.assignedItemId && !presentIds.has(entry.assignedItemId)) next[key] = { ...entry, assignedItemId: null };
    if (entry.auto !== false) next[key] = { ...next[key], value: entry.basis === 'primary' ? defaults[entry.partId] : 0 };
  }
  const replaced = [];
  for (const [partId, items] of Object.entries(selectedByPart)) for (const item of items) {
    if (knownIds.has(item.id) || surfaceRows(next).some((row) => row.assignedItemId === item.id)) continue;
    const rows = surfaceRows(next, partId);
    const target = rows.find((row) => row.target) || rows.find((row) => !row.assignedItemId);
    const key = target?.key || newRowKey(next, partId);
    if (target?.assignedItemId) replaced.push(target.assignedItemId);
    next[key] = { ...(target || { value: 0, auto: true, basis: 'additional' }),
      partId, surfaceRow: true, assignedItemId: item.id, target: false };
    delete next[key].key;
  }
  next[SELECTION_KEY] = selectedIds;
  const assigned = new Set(surfaceRows(next).map((row) => row.assignedItemId));
  return { surfaces: next, unselectedIds: replaced.filter((id) => !assigned.has(id)) };
};

export const targetSurfaceRow = (surfaces, key) => {
  const target = surfaces[key];
  if (!target?.surfaceRow) return surfaces;
  const next = { ...surfaces };
  for (const row of surfaceRows(next, target.partId)) next[row.key] = { ...next[row.key], target: row.key === key };
  return next;
};

export const addSurfaceRow = (surfaces, partId) => {
  const key = newRowKey(surfaces, partId);
  return targetSurfaceRow({ ...surfaces, [key]: { surfaceRow: true, partId, value: 0, auto: false, basis: 'additional', assignedItemId: null } }, key);
};

export const removeSurfaceRow = (surfaces, key) => {
  const next = { ...surfaces };
  const removed = next[key];
  delete next[key];
  const id = removed?.assignedItemId;
  return { surfaces: next, unselectedIds: id && !surfaceRows(next).some((row) => row.assignedItemId === id) ? [id] : [] };
};

export const assignSurfaceRow = (surfaces, key, itemId) => {
  const row = surfaces[key];
  if (!row?.surfaceRow) return { surfaces, unselectedIds: [] };
  const next = { ...surfaces, [key]: { ...row, assignedItemId: itemId, target: !itemId } };
  const previousId = row.assignedItemId;
  return { surfaces: next, unselectedIds: previousId && previousId !== itemId
    && !surfaceRows(next).some((entry) => entry.assignedItemId === previousId) ? [previousId] : [] };
};
