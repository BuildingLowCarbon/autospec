import React, { useContext, useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import translations from '../language/translations';
import RangeSlider from '../components/RangeSlider';
import SourceSelector from '../components/SourceSelector';
import loadComponents, { fetchDbSources } from '../utils/loadComponents';
import FireFilter, { R_OPTIONS as FIRE_R_VALUES, EI_OPTIONS as FIRE_EI_VALUES } from '../components/FireFilter';

const formatCategoryLabel = (value) => {
  if (!value) return 'Unknown';
  const normalized = String(value).replace(/_assembly$/i, '').replace(/_/g, ' ').trim();
  return normalized ? normalized.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown';
};

const clampRange = (value, min, max) => {
  if (!Array.isArray(value) || value.length !== 2) return [min, max];
  const low = Number(value[0]);
  const high = Number(value[1]);
  if (Number.isNaN(low) || Number.isNaN(high)) return [min, max];
  const clampedLow = Math.max(min, Math.min(low, max));
  const clampedHigh = Math.max(min, Math.min(high, max));
  return clampedLow <= clampedHigh ? [clampedLow, clampedHigh] : [clampedHigh, clampedLow];
};

const valueSatisfies = (itemValue, selectedValue, scale) => {
  const selectedIdx = scale.indexOf(selectedValue);
  if (selectedIdx === -1) return true;
  if (!itemValue) return true;
  const valueIdx = scale.indexOf(itemValue);
  if (valueIdx === -1) return true;
  return valueIdx >= selectedIdx;
};

const quantile = (sortedValues, q) => {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sortedValues[low];
  const weight = index - low;
  return sortedValues[low] * (1 - weight) + sortedValues[high] * weight;
};

const makeBoxStats = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = (q3 ?? 0) - (q1 ?? 0);
  const lowFence = (q1 ?? 0) - 1.5 * iqr;
  const highFence = (q3 ?? 0) + 1.5 * iqr;
  const inliers = sorted.filter((v) => v >= lowFence && v <= highFence);
  const outliers = sorted.filter((v) => v < lowFence || v > highFence);

  return {
    min: inliers.length ? inliers[0] : sorted[0],
    q1: q1 ?? sorted[0],
    median: median ?? sorted[0],
    q3: q3 ?? sorted[sorted.length - 1],
    max: inliers.length ? inliers[inliers.length - 1] : sorted[sorted.length - 1],
    outliers,
  };
};

const buildHistogram = (items, accessor, min, max, buckets = 20, options = {}) => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return Array(buckets).fill(0);
  const { capMax } = options;
  const hasCap = Number.isFinite(capMax) && capMax > min && capMax < max && buckets > 1;
  const counts = Array(buckets).fill(0);
  const span = (hasCap ? capMax : max) - min || 1;
  const normalBuckets = hasCap ? buckets - 1 : buckets;
  items.forEach((item) => {
    const raw = accessor(item);
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    if (hasCap && num > capMax) {
      counts[buckets - 1] += 1;
      return;
    }
    const clamped = Math.max(min, Math.min(hasCap ? capMax : max, num));
    const idx = Math.min(normalBuckets - 1, Math.floor(((clamped - min) / span) * normalBuckets));
    counts[idx] += 1;
  });
  return counts;
};

const U_VALUE_FOCUS_MAX = 0.3;

function GwpBoxplot({ series, minValue, maxValue }) {
  const width = 980;
  const height = 460;
  const margin = { top: 40, right: 32, bottom: 130, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const yScale = (value) => {
    const span = maxValue - minValue || 1;
    return margin.top + ((maxValue - value) / span) * plotHeight;
  };

  const spacing = plotWidth / Math.max(series.length, 1);
  const boxWidth = Math.min(48, spacing * 0.45);
  const ticks = 6;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Boxplot GWP par categorie">
      <rect x="0" y="0" width={width} height={height} fill="#f1f1f1" />

      {Array.from({ length: ticks + 1 }).map((_, idx) => {
        const value = minValue + ((maxValue - minValue) * idx) / ticks;
        const y = yScale(value);
        return (
          <g key={`grid-${idx}`}>
            <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="#c7c7c7" strokeDasharray="2 4" />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#333">
              {Math.round(value)}
            </text>
          </g>
        );
      })}

      <line x1={margin.left} y1={margin.top} x2={margin.left} y2={height - margin.bottom} stroke="#222" />
      <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} stroke="#222" />

      {series.map((entry, idx) => {
        const cx = margin.left + spacing * idx + spacing / 2;
        const stats = entry.stats;
        if (!stats) return null;

        const yMin = yScale(stats.min);
        const yQ1 = yScale(stats.q1);
        const yMedian = yScale(stats.median);
        const yQ3 = yScale(stats.q3);
        const yMax = yScale(stats.max);

        return (
          <g key={entry.category}>
            <line x1={cx} y1={yMax} x2={cx} y2={yQ3} stroke="#222" strokeWidth="2" />
            <line x1={cx} y1={yQ1} x2={cx} y2={yMin} stroke="#222" strokeWidth="2" />
            <line x1={cx - 10} y1={yMax} x2={cx + 10} y2={yMax} stroke="#222" strokeWidth="2" />
            <line x1={cx - 10} y1={yMin} x2={cx + 10} y2={yMin} stroke="#222" strokeWidth="2" />

            <rect
              x={cx - boxWidth / 2}
              y={yQ3}
              width={boxWidth}
              height={Math.max(2, yQ1 - yQ3)}
              fill="#e9b3b3"
              stroke="#222"
            />
            <line x1={cx - boxWidth / 2} y1={yMedian} x2={cx + boxWidth / 2} y2={yMedian} stroke="#222" strokeWidth="2" />

            {stats.outliers.map((outlier, outlierIdx) => (
              <circle key={`${entry.category}-outlier-${outlierIdx}`} cx={cx} cy={yScale(outlier)} r="3" fill="#000" />
            ))}

            <text
              x={cx}
              y={height - margin.bottom + 18}
              textAnchor="start"
              transform={`rotate(90 ${cx} ${height - margin.bottom + 18})`}
              fontSize="12"
              fill="#222"
            >
              {entry.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TbzResult() {
  const { lang, setLang } = useContext(LangContext);
  const t = translations[lang];
  const [data, setData] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sourceOptions, setSourceOptions] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [thicknessRange, setThicknessRange] = useState([0, 1000]);
  const [selectedThickness, setSelectedThickness] = useState([0, 1000]);
  const [gwpRange, setGwpRange] = useState([0, 100]);
  const [selectedGwp, setSelectedGwp] = useState([0, 100]);
  const [uValueRange, setUValueRange] = useState([0, 1]);
  const [selectedUValue, setSelectedUValue] = useState([0, 1]);
  const [fireRValue, setFireRValue] = useState(FIRE_R_VALUES[0]);
  const [fireEIValue, setFireEIValue] = useState(FIRE_EI_VALUES[0]);

  useEffect(() => {
    const fetchData = async () => {
      const base = process.env.PUBLIC_URL || '';
      const [components, dbSources] = await Promise.all([loadComponents(), fetchDbSources(base)]);
      setData(components);

      const categories = Array.from(new Set(components.map((item) => item.categoryId).filter(Boolean))).sort();
      setCategoryOptions(categories);

      const thicknessValues = components.map((item) => Number(item.thickness_mm)).filter((v) => !Number.isNaN(v));
      const gwpValues = components.map((item) => Number(item.gwp_kgco2e_m2)).filter((v) => !Number.isNaN(v));
      const uValueValues = components.map((item) => Number(item.uValue_W_m2K)).filter((v) => !Number.isNaN(v));
      const thicknessMin = thicknessValues.length ? Math.min(...thicknessValues) : 0;
      const thicknessMax = thicknessValues.length ? Math.max(...thicknessValues) : 1000;
      const gwpMin = gwpValues.length ? Math.min(...gwpValues) : 0;
      const gwpMax = gwpValues.length ? Math.max(...gwpValues) : 100;
      const uValueMin = uValueValues.length ? Math.min(...uValueValues) : 0;
      const uValueMax = uValueValues.length ? Math.max(...uValueValues) : 1;
      setThicknessRange([thicknessMin, thicknessMax]);
      setGwpRange([gwpMin, gwpMax]);
      setUValueRange([uValueMin, uValueMax]);
      setSelectedThickness([thicknessMin, thicknessMax]);
      setSelectedGwp([gwpMin, gwpMax]);
      setSelectedUValue([uValueMin, uValueMax]);

      const sources = dbSources.map((src) => ({
        value: src.file,
        label: src.label,
      }));
      setSourceOptions(sources);
      setSelectedSources(sources.map((src) => src.value));
    };

    fetchData().catch((error) => {
      console.error('Erreur de chargement TBZ result:', error);
      setData([]);
    });
  }, []);

  const safeThickness = useMemo(
    () => clampRange(selectedThickness, thicknessRange[0], thicknessRange[1]),
    [selectedThickness, thicknessRange]
  );
  const safeGwp = useMemo(() => clampRange(selectedGwp, gwpRange[0], gwpRange[1]), [selectedGwp, gwpRange]);
  const safeUValue = useMemo(() => clampRange(selectedUValue, uValueRange[0], uValueRange[1]), [selectedUValue, uValueRange]);

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const thickness = Number(item.thickness_mm);
      const gwp = Number(item.gwp_kgco2e_m2);
      const uValue = Number(item.uValue_W_m2K);
      const source = item.__sourceFile || '';
      const category = item.categoryId || '';
      const fire = item?.fire_resistance || {};
      const sourceAllowed = selectedSources.length > 0 && selectedSources.includes(source);
      const categoryAllowed = !selectedCategory || category === selectedCategory;
      const thicknessAllowed = Number.isNaN(thickness) || (thickness >= safeThickness[0] && thickness <= safeThickness[1]);
      const gwpAllowed = Number.isNaN(gwp) || (gwp >= safeGwp[0] && gwp <= safeGwp[1]);
      const uValueAllowed = Number.isNaN(uValue) || (uValue >= safeUValue[0] && uValue <= safeUValue[1]);
      const fireAllowed =
        valueSatisfies(fire.R, fireRValue, FIRE_R_VALUES) && valueSatisfies(fire.EI, fireEIValue, FIRE_EI_VALUES);
      return sourceAllowed && categoryAllowed && thicknessAllowed && gwpAllowed && uValueAllowed && fireAllowed;
    });
  }, [data, selectedCategory, selectedSources, safeThickness, safeGwp, safeUValue, fireRValue, fireEIValue]);

  const fireCounts = useMemo(() => {
    const initCounts = (options) => options.reduce((acc, opt) => ({ ...acc, [opt]: 0 }), {});
    const rCounts = initCounts(FIRE_R_VALUES);
    const eiCounts = initCounts(FIRE_EI_VALUES);

    data.forEach((item) => {
      const source = item.__sourceFile || '';
      const category = item.categoryId || '';
      const sourceAllowed = selectedSources.length > 0 && selectedSources.includes(source);
      const categoryAllowed = !selectedCategory || category === selectedCategory;
      const thickness = Number(item.thickness_mm);
      const gwp = Number(item.gwp_kgco2e_m2);
      const uValue = Number(item.uValue_W_m2K);
      const thicknessAllowed = Number.isNaN(thickness) || (thickness >= safeThickness[0] && thickness <= safeThickness[1]);
      const gwpAllowed = Number.isNaN(gwp) || (gwp >= safeGwp[0] && gwp <= safeGwp[1]);
      const uValueAllowed = Number.isNaN(uValue) || (uValue >= safeUValue[0] && uValue <= safeUValue[1]);
      if (!sourceAllowed || !categoryAllowed || !thicknessAllowed || !gwpAllowed || !uValueAllowed) return;
      const fire = item?.fire_resistance || {};
      if (fire.R && rCounts[fire.R] !== undefined) rCounts[fire.R] += 1;
      if (fire.EI && eiCounts[fire.EI] !== undefined) eiCounts[fire.EI] += 1;
    });

    return { rCounts, eiCounts };
  }, [data, selectedSources, selectedCategory, safeThickness, safeGwp, safeUValue]);

  const thicknessBars = useMemo(
    () => buildHistogram(filteredData, (item) => item.thickness_mm, thicknessRange[0], thicknessRange[1], 24),
    [filteredData, thicknessRange]
  );
  const gwpBars = useMemo(
    () => buildHistogram(filteredData, (item) => item.gwp_kgco2e_m2, gwpRange[0], gwpRange[1], 24),
    [filteredData, gwpRange]
  );
  const uValueBars = useMemo(
    () =>
      buildHistogram(filteredData, (item) => item.uValue_W_m2K, uValueRange[0], uValueRange[1], 24, {
        capMax: U_VALUE_FOCUS_MAX,
      }),
    [filteredData, uValueRange]
  );

  const boxplotSeries = useMemo(() => {
    const grouped = filteredData.reduce((acc, item) => {
      const cat = item.categoryId || 'unknown';
      const gwp = Number(item.gwp_kgco2e_m2);
      if (Number.isNaN(gwp)) return acc;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(gwp);
      return acc;
    }, {});

    return Object.keys(grouped)
      .sort()
      .map((category) => ({
        category,
        label: formatCategoryLabel(category),
        stats: makeBoxStats(grouped[category]),
      }))
      .filter((entry) => entry.stats);
  }, [filteredData]);

  const allSeriesValues = useMemo(() => {
    const values = boxplotSeries.flatMap((entry) => {
      const stats = entry.stats;
      return stats ? [stats.min, stats.q1, stats.median, stats.q3, stats.max, ...stats.outliers] : [];
    });
    return values.length ? values : [0, 1];
  }, [boxplotSeries]);

  const chartMin = Math.min(...allSeriesValues);
  const chartMax = Math.max(...allSeriesValues);
  const paddedMin = Math.floor(Math.max(0, chartMin - (chartMax - chartMin) * 0.1));
  const paddedMax = Math.ceil(chartMax + (chartMax - chartMin) * 0.1 + 1);

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <div style={{ display: 'flex', padding: '16px', gap: '16px' }}>
        <div
          style={{
            width: '28%',
            padding: '16px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9',
          }}
        >
          <h2>{t.filters}</h2>
          <div style={{ border: '2px solid #007bff', padding: '10px', borderRadius: '6px', backgroundColor: '#fff' }}>
            <label>{t.category}</label>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} style={{ width: '100%', marginBottom: '12px' }}>
              <option value="">-- {t.all} --</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <SourceSelector
              label={t.sources}
              options={sourceOptions}
              selected={selectedSources}
              onChange={setSelectedSources}
              allLabel={t.all}
            />

            <RangeSlider
              label={t.thickness}
              min={thicknessRange[0]}
              max={thicknessRange[1]}
              step={1}
              values={safeThickness}
              onChange={setSelectedThickness}
              bars={thicknessBars}
              unit="mm"
              formatValue={(v) => `${Math.round(v)} mm`}
            />

            <RangeSlider
              label={t.gwp}
              min={gwpRange[0]}
              max={gwpRange[1]}
              step={1}
              values={safeGwp}
              onChange={setSelectedGwp}
              bars={gwpBars}
              unit="kg CO₂-eq/m²"
              formatValue={(v) => `${Math.round(v)} kg CO₂-eq/m²`}
            />

            <RangeSlider
              label={t.uValue}
              min={uValueRange[0]}
              max={uValueRange[1]}
              step={0.01}
              values={safeUValue}
              onChange={setSelectedUValue}
              bars={uValueBars}
              focusMax={U_VALUE_FOCUS_MAX}
              tailRatio={0.15}
              unit="W/m²K"
              formatValue={(v) => `${v.toFixed(3)} W/m²K`}
            />

            <div style={{ marginTop: '16px' }}>
              <FireFilter
                rValue={fireRValue}
                eiValue={fireEIValue}
                rCounts={fireCounts.rCounts}
                eiCounts={fireCounts.eiCounts}
                onChangeR={setFireRValue}
                onChangeEI={setFireEIValue}
              />
            </div>
          </div>
        </div>

        <div style={{ width: '72%' }}>
          <div
            style={{
              border: '1px solid #ccc',
              borderRadius: '8px',
              backgroundColor: '#f1f1f1',
              padding: '12px',
              minHeight: '520px',
            }}
          >
            <h3 style={{ marginTop: 0 }}>GWP par categorie (boxplot)</h3>
            {boxplotSeries.length > 0 ? (
              <GwpBoxplot series={boxplotSeries} minValue={paddedMin} maxValue={paddedMax} />
            ) : (
              <p>Aucune donnee disponible avec les filtres actuels.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
