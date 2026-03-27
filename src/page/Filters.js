import React, { useEffect, useState, useContext, useCallback, useMemo } from 'react';
import '../App.css';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import translations from '../language/translations';
import LangContext from '../context/LangContext';
import DropDown from '../components/DropDown';
import FireRequirementsModule from '../components/FireRequirements';
import SelectedItemsContext from '../context/SelectedItemsContext';
import ComponentCard from '../components/ComponentCard';
import FireFilter, { R_OPTIONS as FIRE_R_VALUES, EI_OPTIONS as FIRE_EI_VALUES } from '../components/FireFilter';
import RangeSlider from '../components/RangeSlider';
import loadComponents, { fetchDbSources } from '../utils/loadComponents';
import SourceSelector from '../components/SourceSelector';
import ENtebTool from '../components/ENteb/ENteb_tool';

const valueSatisfies = (itemValue, selectedValue, scale) => {
  const selectedIdx = scale.indexOf(selectedValue);
  if (selectedIdx === -1) return true;
  const normalizedItemValue = itemValue || scale[0];
  const valueIdx = scale.indexOf(normalizedItemValue);
  if (valueIdx === -1) return true;
  return valueIdx >= selectedIdx;
};

const pickLowestRequirementValue = (requirements, categoryId, key, scale) => {
  let bestIdx = Number.POSITIVE_INFINITY;
  requirements.forEach((req) => {
    const reqVal = req?.filter?.[key];
    if (!reqVal) return;
    const targets = req?.categoryTargets?.map((c) => c.categoryId) ?? [];
    const applies = !categoryId || targets.includes(categoryId);
    if (!applies) return;
    const idx = scale.indexOf(reqVal);
    if (idx === -1) return;
    if (idx < bestIdx) bestIdx = idx;
  });
  return Number.isFinite(bestIdx) ? scale[bestIdx] : null;
};

const buildHistogram = (items, accessor, min, max, buckets = 20, options = {}) => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return Array(buckets).fill(0);
  const { capMax } = options;
  const hasCap = Number.isFinite(capMax) && capMax > min && capMax < max && buckets > 1;
  const counts = Array(buckets).fill(0);
  const span = (hasCap ? capMax : max) - min || 1;
  const normalBuckets = hasCap ? buckets - 1 : buckets;
  items.forEach((item) => {
    const val = accessor(item);
    if (val === null || val === undefined) return;
    const num = Number(val);
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

const FILTERS_STORAGE_KEY = 'autospec.filters.v1';

const loadPersistedFilters = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
};

const clampRange = (value, min, max) => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const start = Number(value[0]);
  const end = Number(value[1]);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const lower = Math.max(min, Math.min(start, max));
  const upper = Math.max(min, Math.min(end, max));
  return lower <= upper ? [lower, upper] : [upper, lower];
};

function App() {
  const persistedFilters = useMemo(() => loadPersistedFilters(), []);
  const [data, setData] = useState([]);
  const [page, setPage] = useState(persistedFilters.page ?? 0);
  const itemsPerPage = 100;
  const [thicknessRange, setThicknessRange] = useState([0, 1000]);
  const [gwpRange, setGwpRange] = useState([0, 100]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(persistedFilters.selectedCategory ?? '');
  const [sourceOptions, setSourceOptions] = useState([]);
  const [selectedSources, setSelectedSources] = useState(
    Array.isArray(persistedFilters.selectedSources) ? persistedFilters.selectedSources : []
  );
  const { selectedItems, setSelectedItems } = useContext(SelectedItemsContext);
  const [sortBy, setSortBy] = useState(persistedFilters.sortBy ?? '');
  const [sortOrder, setSortOrder] = useState(persistedFilters.sortOrder ?? 'asc');
  const [selectedThickness, setSelectedThickness] = useState(
    Array.isArray(persistedFilters.selectedThickness) ? persistedFilters.selectedThickness : [0, 1000]
  );
  const [selectedGwp, setSelectedGwp] = useState(
    Array.isArray(persistedFilters.selectedGwp) ? persistedFilters.selectedGwp : [0, 100]
  );
  const [uValueRange, setUValueRange] = useState([0, 1]);
  const [selectedUValue, setSelectedUValue] = useState(
    Array.isArray(persistedFilters.selectedUValue) ? persistedFilters.selectedUValue : [0, 1]
  );
  const [acousticRwRange, setAcousticRwRange] = useState([0, 100]);
  const [selectedAcousticRw, setSelectedAcousticRw] = useState(
    Array.isArray(persistedFilters.selectedAcousticRw) ? persistedFilters.selectedAcousticRw : [0, 100]
  );
  const [acousticLnwRange, setAcousticLnwRange] = useState([0, 100]);
  const [selectedAcousticLnw, setSelectedAcousticLnw] = useState(
    Array.isArray(persistedFilters.selectedAcousticLnw) ? persistedFilters.selectedAcousticLnw : [0, 100]
  );
  const navigate = useNavigate();
  const { lang, setLang } = useContext(LangContext);
  const t = translations[lang];
  const [fireReqApplied, setFireReqApplied] = useState(Boolean(persistedFilters.fireReqApplied));
  const [fireReqSelection, setFireReqSelection] = useState(
    persistedFilters.fireReqSelection ?? {
      use: 'residential',
      building_type: '',
      building_height: '',
      neighbor_distance: 'gt_10',
    }
  );
  const [fireReqRequirements, setFireReqRequirements] = useState([]);
  const [fireRValue, setFireRValue] = useState(
    FIRE_R_VALUES.includes(persistedFilters.fireRValue) ? persistedFilters.fireRValue : FIRE_R_VALUES[0]
  );
  const [fireEIValue, setFireEIValue] = useState(
    FIRE_EI_VALUES.includes(persistedFilters.fireEIValue) ? persistedFilters.fireEIValue : FIRE_EI_VALUES[0]
  );
  const [fireApplyResetSignal, setFireApplyResetSignal] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const base = process.env.PUBLIC_URL || '';
        const [json, dbSources] = await Promise.all([loadComponents(), fetchDbSources(base)]);
        setData(json);

        const thicknessVals = json.map((item) => item.thickness_mm || 0);
        const gwpVals = json.map((item) => item.gwp_kgco2e_m2 || 0);
        const uVals = json
          .map((item) => item.uValue_W_m2K)
          .filter((v) => typeof v === 'number' && !Number.isNaN(v));
        const rwVals = json
          .map((item) => item?.acoustic?.Rw_dB)
          .filter((v) => typeof v === 'number' && !Number.isNaN(v));
        const lnwVals = json
          .map((item) => item?.acoustic?.Lnw_dB)
          .filter((v) => typeof v === 'number' && !Number.isNaN(v));
        const categories = Array.from(new Set(json.map((item) => item.categoryId).filter(Boolean)));
        const minThickness = Math.min(...thicknessVals);
        const maxThickness = Math.max(...thicknessVals);
        const minGwp = Math.min(...gwpVals);
        const maxGwp = Math.max(...gwpVals);
        setThicknessRange([minThickness, maxThickness]);
        setGwpRange([minGwp, maxGwp]);
        if (uVals.length) {
          const uMin = Math.min(...uVals);
          const uMax = Math.max(...uVals);
          setUValueRange([uMin, uMax]);
          setSelectedUValue(clampRange(persistedFilters.selectedUValue, uMin, uMax) ?? [uMin, uMax]);
        }
        if (rwVals.length) {
          const rwMin = Math.min(...rwVals);
          const rwMax = Math.max(...rwVals);
          setAcousticRwRange([rwMin, rwMax]);
          setSelectedAcousticRw(clampRange(persistedFilters.selectedAcousticRw, rwMin, rwMax) ?? [rwMin, rwMax]);
        }
        if (lnwVals.length) {
          const lnwMin = Math.min(...lnwVals);
          const lnwMax = Math.max(...lnwVals);
          setAcousticLnwRange([lnwMin, lnwMax]);
          setSelectedAcousticLnw(clampRange(persistedFilters.selectedAcousticLnw, lnwMin, lnwMax) ?? [lnwMin, lnwMax]);
        }
        setCategoryOptions(categories);
        setSelectedCategory((prev) => (prev && categories.includes(prev) ? prev : ''));
        setSelectedThickness(clampRange(persistedFilters.selectedThickness, minThickness, maxThickness) ?? [minThickness, maxThickness]);
        setSelectedGwp(clampRange(persistedFilters.selectedGwp, minGwp, maxGwp) ?? [minGwp, maxGwp]);

        const sources = dbSources.map((src) => ({
          value: src.file,
          label: src.label,
        }));
        setSourceOptions(sources);
        // Par défaut toutes les sources sont sélectionnées
        const sourceValues = sources.map((s) => s.value);
        const storedSources = Array.isArray(persistedFilters.selectedSources)
          ? persistedFilters.selectedSources.filter((src) => sourceValues.includes(src))
          : [];
        setSelectedSources(storedSources.length > 0 ? storedSources : sourceValues);
      } catch (err) {
        console.error('Erreur de chargement JSON:', err);
      }
    };

    fetchData();
  }, [persistedFilters]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      page,
      sortBy,
      sortOrder,
      selectedCategory,
      selectedSources,
      selectedThickness,
      selectedGwp,
      selectedUValue,
      selectedAcousticRw,
      selectedAcousticLnw,
      fireRValue,
      fireEIValue,
      fireReqApplied,
      fireReqSelection,
    };
    window.sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    page,
    sortBy,
    sortOrder,
    selectedCategory,
    selectedSources,
    selectedThickness,
    selectedGwp,
    selectedUValue,
    selectedAcousticRw,
    selectedAcousticLnw,
    fireRValue,
    fireEIValue,
    fireReqApplied,
    fireReqSelection,
  ]);

  const baseFilteredData = useMemo(() => {
    return data.filter((item) => {
      const thickness = item.thickness_mm || 0;
      const gwp = item.gwp_kgco2e_m2 || 0;
      const uVal = item.uValue_W_m2K;
      const hasUVal = typeof uVal === 'number' && !Number.isNaN(uVal);
      const uValAllowed = !hasUVal || (uVal >= selectedUValue[0] && uVal <= selectedUValue[1]);
      const rwVal = item?.acoustic?.Rw_dB;
      const hasRwVal = typeof rwVal === 'number' && !Number.isNaN(rwVal);
      const rwFilterActive = selectedAcousticRw[0] > acousticRwRange[0] || selectedAcousticRw[1] < acousticRwRange[1];
      const rwAllowed = !rwFilterActive || (hasRwVal && rwVal >= selectedAcousticRw[0] && rwVal <= selectedAcousticRw[1]);
      const lnwVal = item?.acoustic?.Lnw_dB;
      const hasLnwVal = typeof lnwVal === 'number' && !Number.isNaN(lnwVal);
      const lnwFilterActive = selectedAcousticLnw[0] > acousticLnwRange[0] || selectedAcousticLnw[1] < acousticLnwRange[1];
      const lnwAllowed = !lnwFilterActive || (hasLnwVal && lnwVal >= selectedAcousticLnw[0] && lnwVal <= selectedAcousticLnw[1]);
      const category = item.categoryId || '';
      const sourceFile = item.__sourceFile || '';
      const sourceAllowed = selectedSources.length > 0 && selectedSources.includes(sourceFile);
      return (
        thickness >= selectedThickness[0] &&
        thickness <= selectedThickness[1] &&
        gwp >= selectedGwp[0] &&
        gwp <= selectedGwp[1] &&
        uValAllowed &&
        rwAllowed &&
        lnwAllowed &&
        (selectedCategory === '' || category === selectedCategory) &&
        sourceAllowed
      );
    });
  }, [
    data,
    selectedCategory,
    selectedSources,
    selectedThickness,
    selectedGwp,
    selectedUValue,
    selectedAcousticRw,
    selectedAcousticLnw,
    acousticRwRange,
    acousticLnwRange,
  ]);

  const histogramSource = useMemo(() => {
    return data.filter((item) => {
      const inCategory = selectedCategory ? item.categoryId === selectedCategory : true;
      const src = item.__sourceFile || '';
      const inSource = selectedSources.length > 0 && selectedSources.includes(src);
      return inCategory && inSource;
    });
  }, [data, selectedCategory, selectedSources]);

  const matchesFireFilters = useCallback(
    (item) => {
      const fire = item?.fire_resistance || {};
      const passesR = valueSatisfies(fire.R, fireRValue, FIRE_R_VALUES);
      const passesEI = valueSatisfies(fire.EI, fireEIValue, FIRE_EI_VALUES);
      return passesR && passesEI;
    },
    [fireRValue, fireEIValue]
  );

  const filteredData = useMemo(() => baseFilteredData.filter(matchesFireFilters), [baseFilteredData, matchesFireFilters]);

  const fireCounts = useMemo(() => {
    const initCounts = (options) => options.reduce((acc, opt) => ({ ...acc, [opt]: 0 }), {});
    const rCounts = initCounts(FIRE_R_VALUES);
    const eiCounts = initCounts(FIRE_EI_VALUES);

    baseFilteredData.forEach((item) => {
      const fire = item?.fire_resistance || {};
      const normalizedR = fire.R || FIRE_R_VALUES[0];
      const normalizedEI = fire.EI || FIRE_EI_VALUES[0];
      if (rCounts[normalizedR] !== undefined) rCounts[normalizedR] += 1;
      if (eiCounts[normalizedEI] !== undefined) eiCounts[normalizedEI] += 1;
    });

    return { rCounts, eiCounts };
  }, [baseFilteredData]);

  const thicknessBars = useMemo(
    () => buildHistogram(histogramSource, (item) => item.thickness_mm, thicknessRange[0], thicknessRange[1], 24),
    [histogramSource, thicknessRange]
  );
  const gwpBars = useMemo(
    () => buildHistogram(histogramSource, (item) => item.gwp_kgco2e_m2, gwpRange[0], gwpRange[1], 24),
    [histogramSource, gwpRange]
  );
  const uValueBars = useMemo(
    () =>
      buildHistogram(histogramSource, (item) => item.uValue_W_m2K, uValueRange[0], uValueRange[1], 24, {
        capMax: U_VALUE_FOCUS_MAX,
      }),
    [histogramSource, uValueRange]
  );
  const acousticRwBars = useMemo(
    () => buildHistogram(histogramSource, (item) => item?.acoustic?.Rw_dB, acousticRwRange[0], acousticRwRange[1], 24),
    [histogramSource, acousticRwRange]
  );
  const acousticLnwBars = useMemo(
    () => buildHistogram(histogramSource, (item) => item?.acoustic?.Lnw_dB, acousticLnwRange[0], acousticLnwRange[1], 24),
    [histogramSource, acousticLnwRange]
  );
  const safeThicknessValues = useMemo(
    () => clampRange(selectedThickness, thicknessRange[0], thicknessRange[1]) ?? [thicknessRange[0], thicknessRange[1]],
    [selectedThickness, thicknessRange]
  );
  const safeGwpValues = useMemo(
    () => clampRange(selectedGwp, gwpRange[0], gwpRange[1]) ?? [gwpRange[0], gwpRange[1]],
    [selectedGwp, gwpRange]
  );
  const safeUValueValues = useMemo(
    () => clampRange(selectedUValue, uValueRange[0], uValueRange[1]) ?? [uValueRange[0], uValueRange[1]],
    [selectedUValue, uValueRange]
  );
  const safeAcousticRwValues = useMemo(
    () => clampRange(selectedAcousticRw, acousticRwRange[0], acousticRwRange[1]) ?? [acousticRwRange[0], acousticRwRange[1]],
    [selectedAcousticRw, acousticRwRange]
  );
  const safeAcousticLnwValues = useMemo(
    () => clampRange(selectedAcousticLnw, acousticLnwRange[0], acousticLnwRange[1]) ?? [acousticLnwRange[0], acousticLnwRange[1]],
    [selectedAcousticLnw, acousticLnwRange]
  );

  const handleApplyRecommendedUValue = useCallback(
    (recommendedUValue) => {
      if (!Number.isFinite(recommendedUValue)) return;
      setSelectedUValue((prev) => {
        const prevMin = Array.isArray(prev) && Number.isFinite(prev[0]) ? prev[0] : uValueRange[0];
        const boundedMax = Math.max(uValueRange[0], Math.min(recommendedUValue, uValueRange[1]));
        const boundedMin = Math.min(Math.max(prevMin, uValueRange[0]), boundedMax);
        return [boundedMin, boundedMax];
      });
    },
    [uValueRange]
  );

  const handleCheckboxChange = (item) => {
    const isSelected = selectedItems.some((i) => i.id === item.id);
    if (isSelected) {
      setSelectedItems(selectedItems.filter((i) => i.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const removeSelectedItem = (itemId) => {
    setSelectedItems(selectedItems.filter((i) => i.id !== itemId));
  };

  const sortedData = useMemo(() => {
    const copy = [...filteredData];
    return copy.sort((a, b) => {
      let aVal;
      let bVal;
      if (sortBy === 'thickness') {
        aVal = a.thickness_mm || 0;
        bVal = b.thickness_mm || 0;
      } else if (sortBy === 'gwp') {
        aVal = a.gwp_kgco2e_m2 || 0;
        bVal = b.gwp_kgco2e_m2 || 0;
      } else if (sortBy === 'uValue') {
        aVal = a.uValue_W_m2K || 0;
        bVal = b.uValue_W_m2K || 0;
      } else {
        return 0;
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [filteredData, sortBy, sortOrder]);

  useEffect(() => {
    if (!fireReqApplied || !fireReqRequirements.length) return;
    const targetCategory = selectedCategory || null;
    const nextR = pickLowestRequirementValue(fireReqRequirements, targetCategory, 'R', FIRE_R_VALUES);
    const nextEI = pickLowestRequirementValue(fireReqRequirements, targetCategory, 'EI', FIRE_EI_VALUES);
    if (nextR) setFireRValue(nextR);
    if (nextEI) setFireEIValue(nextEI);
  }, [fireReqApplied, fireReqRequirements, selectedCategory]);

  const pagedData = useMemo(
    () => sortedData.slice(page * itemsPerPage, (page + 1) * itemsPerPage),
    [sortedData, page, itemsPerPage]
  );
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(totalPages - 1, 0));
    }
  }, [page, totalPages]);

  const handleFireSliderChange = (type, val) => {
    if (fireReqApplied) {
      setFireApplyResetSignal((s) => s + 1);
      setFireReqApplied(false);
    }
    if (type === 'R') {
      setFireRValue(val);
    } else {
      setFireEIValue(val);
    }
  };
  const handleFireRequirementsChange = useCallback(
    ({ applied, selection, requirements }) => {
      setFireReqApplied(applied);
      setFireReqSelection(selection);
      setFireReqRequirements(requirements);
    },
    []
  );
  const filteredCount = filteredData.length;

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <div style={{ display: 'flex', padding: '16px', gap: '16px' }}>
        {/* Filtres a gauche */}
        <div style={{ width: '25%', padding: '16px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
          <h2>{t.sort}</h2>
          <div
            style={{
              border: '1px solid #ccc',
              padding: '8px',
              borderRadius: '6px',
              marginBottom: '16px',
              backgroundColor: '#fff',
            }}
          >
            <label>{t.criteria}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ width: '100%', marginBottom: '8px', border: '1px solid #ccc', borderRadius: '6px' }}
            >
              <option value="">-- {t.none} --</option>
              <option value="thickness">{t.thickness}</option>
              <option value="gwp">{t.gwp}</option>
              <option value="uValue">{t.uValue}</option>
            </select>

            {/*
            <DropDown
              title={t.criteria}
              lang={lang}
              selected={sortBy}
              setSelected={setSortBy}
              options={[
                { value: 'thickness', label: t.thickness },
                { value: 'gwp', label: t.gwp },
                { value: 'uValue', label: t.uValue },
              ]}
            />
            */}
            <label>{t.order}</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={{ width: '100%' }}>
              <option value="asc">{t.ascending}</option>
              <option value="desc">{t.descending}</option>
            </select>
          </div>

          <h2>
            {t.filters} ({filteredCount} {filteredCount > 1 ? t.building_components : t.building_component})
          </h2>
          <div
            style={{
              border: '2px solid #007bff',
              padding: '8px',
              borderRadius: '6px',
              marginBottom: '12px',
              backgroundColor: '#fff',
            }}
          >
            <label>{t.category}</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ width: '100%', marginBottom: '12px' }}
            >
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
              values={safeThicknessValues}
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
              values={safeGwpValues}
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
              values={safeUValueValues}
              onChange={setSelectedUValue}
              bars={uValueBars}
              focusMax={U_VALUE_FOCUS_MAX}
              tailRatio={0.15}
              unit="W/m²K"
              formatValue={(v) => `${v.toFixed(3)} W/m²K`}
            />

             <RangeSlider
              label={"acoustic insulation Rw (dB)"}
              min={acousticRwRange[0]}
              max={acousticRwRange[1]}
              step={1}
              values={safeAcousticRwValues}
              onChange={setSelectedAcousticRw}
              bars={acousticRwBars}
              unit="dB"
              formatValue={(v) => `${Math.round(v)} dB`}
            />
            <RangeSlider
              label={"acoustic insulation Ln,w (dB)"}
              min={acousticLnwRange[0]}
              max={acousticLnwRange[1]}
              step={1}
              values={safeAcousticLnwValues}
              onChange={setSelectedAcousticLnw}
              bars={acousticLnwBars}
              unit="dB"
              formatValue={(v) => `${Math.round(v)} dB`}
            />
            

            <div style={{ marginTop: '16px' }}>
              <FireFilter
                rValue={fireRValue}
                eiValue={fireEIValue}
                rCounts={fireCounts.rCounts}
                eiCounts={fireCounts.eiCounts}
                onChangeR={(val) => handleFireSliderChange('R', val)}
                onChangeEI={(val) => handleFireSliderChange('EI', val)}
              />
            </div>
          </div>

          <h4>{t.selected_components}</h4>
          <div style={{ border: '1px solid #ccc', padding: '8px', borderRadius: '6px', marginBottom: '12px', backgroundColor: '#fff' }}>
            {Object.entries(
              selectedItems.reduce((acc, item) => {
                const group = item.categoryId || 'Others';
                if (!acc[group]) acc[group] = [];
                acc[group].push(item);
                return acc;
              }, {})
            ).map(([group, items]) => (
              <div key={group}>
                <strong>{group}:</strong>
                <ul>
                  {items.map((item) => (
                    <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {item.serialNo || item.id}
                      <button onClick={() => removeSelectedItem(item.id)} style={{ marginLeft: '10px' }}>
                        x
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <ENtebTool lang={lang} t={t} onApplyRecommendedUValue={handleApplyRecommendedUValue} />
        
          <FireRequirementsModule
            lang={lang}
            resetApplySignal={fireApplyResetSignal}
            initialSelection={fireReqSelection}
            initialApplied={fireReqApplied}
            onApplyChange={handleFireRequirementsChange}
          />
        </div>

        {/* Results on the right */}
        <div style={{ width: '75%' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(700px, 1fr))',
              gap: '16px',
            }}
          >
            {pagedData.map((item) => (
              <ComponentCard
                key={item.id}
                item={item}
                selected={selectedItems.some((i) => i.id === item.id)}
                onToggle={() => handleCheckboxChange(item)}
                onDetails={() => navigate(`/element/${item.id}`)}
                lang={lang}
                t={t}
              />
            ))}
          </div>

          {/* Pagination */}
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <button onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0}>
              {t.previous}
            </button>
            <span>
              Page {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))} disabled={page >= totalPages - 1}>
              {t.next}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
