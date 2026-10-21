import kbobData from '../data/KBOB_mat_db.json';

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const kbobById = new Map(kbobData.map((item) => [String(item.kbobId), item]));

export const getKbobIndicators = (kbobId) => {
  const item = kbobId ? kbobById.get(String(kbobId)) : null;
  if (!item) return { gwp: null, gwpPro: null, gwpDis: null, ref: null };
  return {
    gwp: finite(item.gwp),
    gwpPro: finite(item['gwp-pro']),
    gwpDis: finite(item['gwp-dis']),
    ref: item.ref || null,
  };
};

export const calculateProductKbobIndicators = (product, materials = []) => {
  const direct = getKbobIndicators(product?.kbobId);
  if (direct.gwp !== null || direct.gwpPro !== null || direct.gwpDis !== null) return direct;

  const composition = Array.isArray(product?.composition) ? product.composition : [];
  const materialsById = new Map(materials.map((item) => [String(item.id), item]));
  const resolved = composition.map((item) => {
    const material = materialsById.get(String(item?.material?.id)) || item?.material || {};
    const kbob = kbobById.get(String(item?.material?.kbobId || material?.kbobId || '')) || null;
    const density = finite(material?.density_kg_m3) ?? finite(kbob?.density);
    const value = finite(item?.quantity?.value) ?? 0;
    const unit = item?.quantity?.unit;
    const fixedVolume = item?.fill_strategy === 'remainder_volume'
      ? 0
      : unit === 'kg_m3' && density ? value / density : unit === 'm3' ? value : 0;
    return { item, kbob, density, value, unit, fixedVolume };
  });
  const remainingVolume = Math.max(0, 1 - resolved.reduce((sum, item) => sum + item.fixedVolume, 0));
  const totals = { gwp: 0, gwpPro: 0, gwpDis: 0 };
  const available = { gwp: false, gwpPro: false, gwpDis: false };

  resolved.forEach(({ item, kbob, density, value, unit, fixedVolume }) => {
    if (!kbob) return;
    const volume = item?.fill_strategy === 'remainder_volume' ? remainingVolume * value : fixedVolume;
    const mass = unit === 'kg_m3' ? value : density === null ? null : volume * density;
    const factor = kbob.ref === 'kg' ? mass : kbob.ref === 'm3' ? volume : kbob.ref === 'm2' ? value : null;
    if (factor === null) return;
    [['gwp', 'gwp'], ['gwpPro', 'gwp-pro'], ['gwpDis', 'gwp-dis']].forEach(([target, source]) => {
      const indicator = finite(kbob[source]);
      if (indicator === null) return;
      totals[target] += factor * indicator;
      available[target] = true;
    });
  });

  return {
    gwp: available.gwp ? totals.gwp : null,
    gwpPro: available.gwpPro ? totals.gwpPro : null,
    gwpDis: available.gwpDis ? totals.gwpDis : null,
    ref: 'm3',
  };
};
