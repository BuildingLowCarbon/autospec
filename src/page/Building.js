import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import BuildingCriteria from '../components/BuildingCriteria';
import BuildingDiagram, { getBuildingPart, getRoofCategory } from '../components/BuildingDiagram';
import BuildingWeightInfo from '../components/BuildingWeightInfo';
import ComponentCard from '../components/ComponentCard';
import { R_OPTIONS, EI_OPTIONS } from '../components/FireFilter';
import RangeSlider from '../components/RangeSlider';
import SourceSelector from '../components/SourceSelector';
import LangContext from '../context/LangContext';
import SelectedItemsContext from '../context/SelectedItemsContext';
import translations from '../language/translations';
import { getAcousticInsulation } from '../utils/acoustic';
import loadComponents, { fetchDbSources } from '../utils/loadComponents';
import './Building.css';

const PAGE_SIZE = 50;

const finiteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const extent = (items, accessor, fallback = [0, 1]) => {
  const values = items.map(accessor).map(finiteNumber).filter((value) => value !== null);
  if (!values.length) return fallback;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? [min, min + 1] : [min, max];
};

const histogram = (items, accessor, min, max, buckets = 20) => {
  const counts = Array(buckets).fill(0);
  const span = max - min || 1;
  items.forEach((item) => {
    const value = finiteNumber(accessor(item));
    if (value === null) return;
    const index = Math.min(buckets - 1, Math.max(0, Math.floor(((value - min) / span) * buckets)));
    counts[index] += 1;
  });
  return counts;
};

const clampRange = (range, bounds) => [
  Math.max(bounds[0], Math.min(range?.[0] ?? bounds[0], bounds[1])),
  Math.max(bounds[0], Math.min(range?.[1] ?? bounds[1], bounds[1])),
];

const ratingIndex = (rating, scale) => {
  const direct = scale.indexOf(rating);
  if (direct >= 0) return direct;
  const minutes = Number(String(rating ?? '').match(/\d+/)?.[0] ?? 0);
  return scale.findIndex((value) => Number(value.match(/\d+/)?.[0] ?? 0) >= minutes);
};

const fireRating = (item, type) => {
  const fire = item?.fire_resistance ?? {};
  if (fire[type]) return fire[type];
  const rei = fire.REI_min;
  if (rei === null || rei === undefined || rei === '') return type === 'R' ? R_OPTIONS[0] : EI_OPTIONS[0];
  const minutes = String(rei).match(/\d+/)?.[0] ?? '0';
  return `${type}${minutes}`;
};

const getFloorSpanForRating = (item, rating) => {
  if (item?.categoryId !== 'floor_assembly') return null;
  const fire = item?.fire_resistance ?? {};
  const rows = fire.wood_capacity_table?.type === 'floor_span' ? fire.wood_capacity_table.rows : null;
  if (Array.isArray(rows) && rows.length) {
    const row = rows.find((entry) => String(entry?.label ?? '').toLowerCase().includes('gouvernante')) ?? rows[0];
    const column = rating === 'R0' ? 'normal_temperature' : rating;
    const value = finiteNumber(row?.[column]?.value);
    if (value !== null) return value;
  }
  const spans = fire.wood_beam_span;
  if (!spans || spans.error) return null;
  if (rating === 'R0') return finiteNumber(spans.ambient?.L_ambient_governing_m);
  const minutes = Number(rating.match(/\d+/)?.[0]);
  return finiteNumber(spans.fire?.find((entry) => Number(entry?.fireMinutes) === minutes)?.Max_span);
};

const getGoverningSpan = (item) => {
  const values = R_OPTIONS.map((rating) => getFloorSpanForRating(item, rating)).filter((value) => value !== null);
  return values.length ? Math.min(...values) : finiteNumber(item?.spanMax_m);
};

const displayName = (item, lang) => item?.translations?.[lang]?.name || item?.serialNo || item?.id || 'Composant';

function Building() {
  const { lang, setLang } = useContext(LangContext);
  const { selectedItems, setSelectedItems } = useContext(SelectedItemsContext);
  const navigate = useNavigate();
  const t = translations[lang];
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPart, setSelectedPart] = useState('roof');
  const [roofType, setRoofType] = useState('pitched');
  const [criteria, setCriteria] = useState({
    recommendedUValue: null,
    fireR: R_OPTIONS[0],
    fireEI: EI_OPTIONS[0],
    acousticRwLimit: null,
    acousticLnwLimit: null,
    acousticRwMin: null,
    acousticLnwMax: null,
    requiredSpan: 0,
    building: {
      floorCount: 2,
      length: 10,
      width: 10,
      partitionRate: 0.4,
      floorHeight: 2.5,
      totalHeight: 5,
      sre: 200,
      thermalEnvelopeArea: 400,
      envelopeFactor: 2,
      occupancyKey: 'A1_habitation',
      occupancyLabel: 'Habitation',
      occupancyLoadKnM2: 2,
    },
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);
  const [page, setPage] = useState(0);
  const [advancedRanges, setAdvancedRanges] = useState(null);

  const activePart = getBuildingPart(selectedPart);
  const activeCategories = useMemo(
    () => selectedPart === 'roof' ? [getRoofCategory(roofType)] : activePart.categories,
    [activePart.categories, roofType, selectedPart],
  );
  const floorFireRating = criteria.fireR || R_OPTIONS[0];
  const getActiveFloorSpan = useCallback(
    (item) => getFloorSpanForRating(item, floorFireRating) ?? getGoverningSpan(item),
    [floorFireRating],
  );

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [components, sources] = await Promise.all([loadComponents(), fetchDbSources()]);
        if (cancelled) return;
        setData(components);
        const options = sources.map((source) => ({ value: source.file, label: source.label }));
        setSourceOptions(options);
        setSelectedSources(options.map((option) => option.value));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const bounds = useMemo(() => ({
    thickness: extent(data, (item) => item.thickness_mm, [0, 1000]),
    gwp: extent(data, (item) => item.gwp_kgco2e_m2, [0, 100]),
    span: extent(data.filter((item) => item.categoryId === 'floor_assembly'), getActiveFloorSpan, [0, 10]),
    uValue: extent(data, (item) => item.uValue_W_m2K, [0, 1]),
    rw: extent(data, (item) => getAcousticInsulation(item).rwCorrected, [0, 100]),
    lnw: extent(data, (item) => getAcousticInsulation(item).lnwCorrected, [0, 100]),
  }), [data, getActiveFloorSpan]);

  useEffect(() => {
    if (!data.length) return;
    setAdvancedRanges((current) => current ?? {
      thickness: bounds.thickness,
      gwp: bounds.gwp,
      span: bounds.span,
      uValue: bounds.uValue,
      rw: bounds.rw,
      lnw: bounds.lnw,
    });
  }, [bounds, data.length]);

  const ranges = useMemo(() => ({
    thickness: clampRange(advancedRanges?.thickness, bounds.thickness),
    gwp: clampRange(advancedRanges?.gwp, bounds.gwp),
    span: clampRange(advancedRanges?.span, bounds.span),
    uValue: clampRange(advancedRanges?.uValue, bounds.uValue),
    rw: clampRange(advancedRanges?.rw, bounds.rw),
    lnw: clampRange(advancedRanges?.lnw, bounds.lnw),
  }), [advancedRanges, bounds]);

  const setRange = (key, value) => setAdvancedRanges((current) => ({ ...current, [key]: value }));
  const handleCriteriaChange = useCallback((nextCriteria) => setCriteria(nextCriteria), []);

  const categoryData = useMemo(
    () => data.filter((item) => activeCategories.includes(item.categoryId)),
    [activeCategories, data],
  );

  const fireThresholdR = criteria.fireR;
  const fireThresholdEI = criteria.fireEI;

  const filteredData = useMemo(() => categoryData.filter((item) => {
    if (sourceOptions.length && !selectedSources.includes(item.__sourceFile || '')) return false;
    const thickness = finiteNumber(item.thickness_mm) ?? 0;
    const gwp = finiteNumber(item.gwp_kgco2e_m2) ?? 0;
    const uValue = finiteNumber(item.uValue_W_m2K);
    const span = getActiveFloorSpan(item);
    const acoustic = getAcousticInsulation(item);
    const passesThermal = selectedPart !== 'outer_walls' || criteria.recommendedUValue === null || uValue === null || uValue <= criteria.recommendedUValue;
    const passesFire = selectedPart === 'roof' || (
      ratingIndex(fireRating(item, 'R'), R_OPTIONS) >= ratingIndex(fireThresholdR, R_OPTIONS) &&
      ratingIndex(fireRating(item, 'EI'), EI_OPTIONS) >= ratingIndex(fireThresholdEI, EI_OPTIONS)
    );
    const passesAcoustic =
      (criteria.acousticRwMin === null || acoustic.rwCorrected === null || acoustic.rwCorrected >= criteria.acousticRwMin) &&
      (selectedPart !== 'floors' || criteria.acousticLnwMax === null || acoustic.lnwCorrected === null || acoustic.lnwCorrected <= criteria.acousticLnwMax);
    const passesRequiredSpan = criteria.requiredSpan <= 0 || item.categoryId !== 'floor_assembly' || (span !== null && span >= criteria.requiredSpan);
    const passesAdvancedSpan = item.categoryId !== 'floor_assembly' || span === null || (span >= ranges.span[0] && span <= ranges.span[1]);
    return passesThermal && passesFire && passesAcoustic && passesRequiredSpan && passesAdvancedSpan &&
      thickness >= ranges.thickness[0] && thickness <= ranges.thickness[1] &&
      gwp >= ranges.gwp[0] && gwp <= ranges.gwp[1] &&
      (uValue === null || (uValue >= ranges.uValue[0] && uValue <= ranges.uValue[1])) &&
      (acoustic.rwCorrected === null || (acoustic.rwCorrected >= ranges.rw[0] && acoustic.rwCorrected <= ranges.rw[1])) &&
      (selectedPart !== 'floors' || acoustic.lnwCorrected === null || (acoustic.lnwCorrected >= ranges.lnw[0] && acoustic.lnwCorrected <= ranges.lnw[1]));
  }), [categoryData, criteria, fireThresholdEI, fireThresholdR, getActiveFloorSpan, ranges, selectedPart, selectedSources, sourceOptions.length]);

  const weightCandidatesByPart = useMemo(() => {
    const matchesCommonFilters = (item, partId) => {
      if (sourceOptions.length && !selectedSources.includes(item.__sourceFile || '')) return false;
      const thickness = finiteNumber(item.thickness_mm) ?? 0;
      const gwp = finiteNumber(item.gwp_kgco2e_m2) ?? 0;
      const uValue = finiteNumber(item.uValue_W_m2K);
      const acoustic = getAcousticInsulation(item);
      const span = partId === 'floors' ? getActiveFloorSpan(item) : null;
      return thickness >= ranges.thickness[0] && thickness <= ranges.thickness[1] &&
        gwp >= ranges.gwp[0] && gwp <= ranges.gwp[1] &&
        (uValue === null || (uValue >= ranges.uValue[0] && uValue <= ranges.uValue[1])) &&
        (acoustic.rwCorrected === null || (acoustic.rwCorrected >= ranges.rw[0] && acoustic.rwCorrected <= ranges.rw[1])) &&
        (partId !== 'floors' || acoustic.lnwCorrected === null || (acoustic.lnwCorrected >= ranges.lnw[0] && acoustic.lnwCorrected <= ranges.lnw[1])) &&
        (partId !== 'floors' || span === null || (span >= ranges.span[0] && span <= ranges.span[1]));
    };

    const result = {};
    ['roof', 'outer_walls', 'partitions', 'floors'].forEach((partId) => {
      const part = getBuildingPart(partId);
      const categories = partId === 'roof' ? [getRoofCategory(roofType)] : part.categories;
      result[partId] = data.filter((item) =>
        categories.includes(item.categoryId) && matchesCommonFilters(item, partId)
      );
    });
    result[selectedPart] = filteredData;
    return result;
  }, [data, filteredData, getActiveFloorSpan, ranges, roofType, selectedPart, selectedSources, sourceOptions.length]);

  const bars = useMemo(() => ({
    thickness: histogram(categoryData, (item) => item.thickness_mm, ...bounds.thickness),
    gwp: histogram(categoryData, (item) => item.gwp_kgco2e_m2, ...bounds.gwp),
    span: histogram(categoryData, getActiveFloorSpan, ...bounds.span),
    uValue: histogram(categoryData, (item) => item.uValue_W_m2K, ...bounds.uValue),
    rw: histogram(categoryData, (item) => getAcousticInsulation(item).rwCorrected, ...bounds.rw),
    lnw: histogram(categoryData, (item) => getAcousticInsulation(item).lnwCorrected, ...bounds.lnw),
  }), [bounds, categoryData, getActiveFloorSpan]);

  useEffect(() => setPage(0), [criteria, ranges, selectedPart, selectedSources]);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const visibleData = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSelectedItem = (item) => setSelectedItems((current) =>
    current.some((selected) => selected.id === item.id)
      ? current.filter((selected) => selected.id !== item.id)
      : [...current, item]
  );

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <main className="building-page">
        <div className="building-layout">
          <BuildingCriteria lang={lang} selectedCategories={activeCategories} onCriteriaChange={handleCriteriaChange} />

          <div className="building-content">
            <BuildingDiagram
              selectedPart={selectedPart}
              onSelectPart={setSelectedPart}
              roofType={roofType}
              onRoofTypeChange={setRoofType}
            />

            <BuildingWeightInfo
              building={criteria.building}
              selectedItems={selectedItems}
              candidatesByPart={weightCandidatesByPart}
            />

            <section className="building-panel">
              <h3>Macro-composants sélectionnés</h3>
              {selectedItems.length === 0 ? (
                <p className="building-muted">Aucun macro-composant sélectionné.</p>
              ) : (
                <ul className="building-selected-list">
                  {selectedItems.map((item) => (
                    <li key={item.id}>
                      <Link to={`/element/${item.id}`}>{displayName(item, lang)}</Link>
                      <button type="button" onClick={() => setSelectedItems((current) => current.filter((selected) => selected.id !== item.id))} aria-label={`Retirer ${displayName(item, lang)}`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="building-panel">
              <h3>Informations — {activePart.label}</h3>
              <div className="building-requirement-values">
                {selectedPart === 'outer_walls' && <div><span>Valeur U max.</span><strong>{criteria.recommendedUValue === null ? 'N/A' : `${criteria.recommendedUValue.toFixed(3)} W/m²K`}</strong></div>}
                {selectedPart !== 'roof' && <div><span>Feu</span><strong>{fireThresholdR} / {fireThresholdEI}</strong></div>}
                <div><span>Rw min.</span><strong>{criteria.acousticRwLimit === null ? 'N/A' : `${criteria.acousticRwLimit} dB`}</strong></div>
                {selectedPart === 'floors' && <div><span>Ln,w max.</span><strong>{criteria.acousticLnwLimit === null ? 'N/A' : `${criteria.acousticLnwLimit} dB`}</strong></div>}
              </div>

              <button type="button" className="building-text-button" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}>
                Filtres avancés {advancedOpen ? '⌃' : '⌄'}
              </button>

              {advancedOpen && (
                <div className="building-advanced-filters">
                  <SourceSelector label={t.sources} options={sourceOptions} selected={selectedSources} onChange={setSelectedSources} allLabel={t.all} />
                  <RangeSlider label={t.thickness} min={bounds.thickness[0]} max={bounds.thickness[1]} step={1} values={ranges.thickness} onChange={(value) => setRange('thickness', value)} bars={bars.thickness} unit="mm" />
                  <RangeSlider label={t.gwp} min={bounds.gwp[0]} max={bounds.gwp[1]} step={1} values={ranges.gwp} onChange={(value) => setRange('gwp', value)} bars={bars.gwp} unit="kg CO₂-eq/m²" />
                  {selectedPart === 'floors' && <RangeSlider label="Portée max." min={bounds.span[0]} max={bounds.span[1]} step={0.1} values={ranges.span} onChange={(value) => setRange('span', value)} bars={bars.span} unit="m" />}
                  <RangeSlider label={t.uValue} min={bounds.uValue[0]} max={bounds.uValue[1]} step={0.01} values={ranges.uValue} onChange={(value) => setRange('uValue', value)} bars={bars.uValue} unit="W/m²K" />
                  <RangeSlider label={t.acoustic_rw_corrected ?? 'Rw corrigé'} min={bounds.rw[0]} max={bounds.rw[1]} step={1} values={ranges.rw} onChange={(value) => setRange('rw', value)} bars={bars.rw} unit="dB" />
                  {selectedPart === 'floors' && <RangeSlider label={t.acoustic_lnw_corrected ?? 'Ln,w corrigé'} min={bounds.lnw[0]} max={bounds.lnw[1]} step={1} values={ranges.lnw} onChange={(value) => setRange('lnw', value)} bars={bars.lnw} unit="dB" />}
                </div>
              )}
            </section>

            <section className="building-results">
              <h2>
                {activePart.label} — {filteredData.length} / {categoryData.length} résultat{categoryData.length > 1 ? 's' : ''}
              </h2>
              {loading ? <p>Chargement…</p> : null}
              {!loading && filteredData.length === 0 ? <p>Aucun composant ne correspond aux critères actuels.</p> : null}
              <div className="building-results-grid">
                {visibleData.map((item) => (
                  <ComponentCard
                    key={item.id}
                    item={item}
                    selected={selectedItems.some((selected) => selected.id === item.id)}
                    onToggle={() => toggleSelectedItem(item)}
                    onDetails={() => navigate(`/element/${item.id}`)}
                    lang={lang}
                    t={t}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="building-pagination">
                  <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>{t.previous}</button>
                  <span>Page {page + 1} / {totalPages}</span>
                  <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}>{t.next}</button>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export default Building;
