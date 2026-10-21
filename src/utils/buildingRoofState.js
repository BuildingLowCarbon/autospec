// Compatibility with drafts saved when underground roofing was a roof shape.
export const separateUndergroundRoofState = (state = {}) => {
  if (state.roofType !== 'underground') return state;
  const next = { ...state, roofType: 'flat' };
  if ((state.selectedPart || 'roof') === 'roof') next.selectedPart = 'underground_roofs';
  for (const key of ['structureTypesByPart', 'structureMaterialsByPart', 'insulationMaterialsByPart']) {
    if (state[key]?.roof && !state[key]?.underground_roofs) {
      next[key] = { ...state[key], underground_roofs: state[key].roof };
    }
  }
  if (state.surfaces?.['range:roof'] !== undefined && state.surfaces?.['range:underground_roofs'] === undefined) {
    const entry = state.surfaces['range:roof'];
    next.surfaces = { ...state.surfaces, 'range:underground_roofs': entry && typeof entry === 'object'
      ? { ...entry, partId: 'underground_roofs' } : entry };
    delete next.surfaces['range:roof'];
  }
  return next;
};
