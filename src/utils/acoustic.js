const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const pickLargestAbsoluteCorrector = (entries) => {
  return entries.reduce((selected, entry) => {
    const value = toNumberOrNull(entry.value);
    if (value === null) return selected;
    if (!selected || Math.abs(value) > Math.abs(selected.value)) {
      return { ...entry, value };
    }
    return selected;
  }, null);
};

const normalizeCorrectors = (entries) =>
  entries
    .map((entry) => {
      const value = toNumberOrNull(entry.value);
      return value === null ? null : { ...entry, value };
    })
    .filter(Boolean);

export const getAcousticInsulation = (component) => {
  const airborneSound = component?.sound_insulation?.airborneSound ?? null;
  const impactSound = component?.sound_insulation?.impactSound ?? null;
  const legacyAcoustic = component?.acoustic ?? null;

  const rw = toNumberOrNull(airborneSound?.Rw_dB ?? legacyAcoustic?.Rw_dB);
  const lnw = toNumberOrNull(impactSound?.Lnw_dB ?? legacyAcoustic?.Lnw_dB);

  const rwCorrectors = normalizeCorrectors([
    { key: 'c100_3150_dB', label: 'C100-3150', value: airborneSound?.c100_3150_dB },
    { key: 'c50_3150_dB', label: 'C50-3150', value: airborneSound?.c50_3150_dB },
    { key: 'ctr100_3150_dB', label: 'Ctr100-3150', value: airborneSound?.ctr100_3150_dB },
    { key: 'ctr50_3150_dB', label: 'Ctr50-3150', value: airborneSound?.ctr50_3150_dB },
  ]);

  const lnwCorrectors = normalizeCorrectors([
    { key: 'ci100_2500_dB', label: 'CI100-2500', value: impactSound?.ci100_2500_dB },
    { key: 'ci50_2500_dB', label: 'CI50-2500', value: impactSound?.ci50_2500_dB },
  ]);
  const rwCorrector = pickLargestAbsoluteCorrector(rwCorrectors);
  const lnwCorrector = pickLargestAbsoluteCorrector(lnwCorrectors);

  return {
    rw,
    lnw,
    rwCorrectors,
    lnwCorrectors,
    rwCorrector,
    lnwCorrector,
    rwCorrected: rw === null ? null : rw + (rwCorrector?.value ?? 0),
    lnwCorrected: lnw === null ? null : lnw + (lnwCorrector?.value ?? 0),
    airborneSound,
    impactSound,
  };
};

export default getAcousticInsulation;
