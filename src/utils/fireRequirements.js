const finiteLevelCount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.round(number)) : null;
};

export const matchesFireRuleConditions = (conditions, selection) => {
  if (!conditions || !selection) return false;
  const allowedBuildingTypes = Array.isArray(conditions.building_types)
    ? conditions.building_types
    : [conditions.building_type].filter(Boolean);
  const levels = finiteLevelCount(selection.aboveGroundLevels);
  const minLevels = finiteLevelCount(conditions.min_above_ground_levels);
  const maxLevels = finiteLevelCount(conditions.max_above_ground_levels);

  return conditions.use === selection.use &&
    allowedBuildingTypes.includes(selection.buildingType) &&
    conditions.building_height === selection.buildingHeight &&
    (minLevels === null || (levels !== null && levels >= minLevels)) &&
    (maxLevels === null || (levels !== null && levels <= maxLevels));
};
