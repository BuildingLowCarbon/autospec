import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import BuildingCriteria from '../components/BuildingCriteria';
import BuildingDiagram, { getBuildingPart, getRoofCategory } from '../components/BuildingDiagram';
import BuildingWeightInfo, { calculateBuildingWeightInfo } from '../components/BuildingWeightInfo';
import BuildingCarbonSummary, { partForComponent } from '../components/BuildingCarbonSummary';
import ComponentCard, { getWallLinearResistance } from '../components/ComponentCard';
import ComponentGroupCard from '../components/ComponentGroupCard';
import { R_OPTIONS, EI_OPTIONS } from '../components/FireFilter';
import RangeSlider from '../components/RangeSlider';
import SourceSelector from '../components/SourceSelector';
import LangContext from '../context/LangContext';
import SelectedItemsContext from '../context/SelectedItemsContext';
import translations from '../language/translations';
import sia3801 from '../data/sia380_1.json';
import { getAcousticInsulation } from '../utils/acoustic';
import { componentMatchesTaxonomy } from '../utils/componentTaxonomy';
import {
  getComponentStructureTypeId,
  getComponentStructureTypeOptions,
} from '../utils/componentStructureType';
import loadComponents, { fetchDbSources } from '../utils/loadComponents';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import {
  getInsulationMaterialOptions,
  getScreedMaterialOptions,
  getStructureMaterialOptions,
  groupBuildingComponents,
  matchesMaterialFilters,
  selectableItemIdentity,
} from '../utils/buildingComponentGroups';
import {
  serializeGroupSelection, restoreGroupSelection, makeGroupCollection,
  hasSelectedGroup, setGroupSelected, setGroupIgnored,
} from '../utils/buildingGroupSelections';
import './Building.css';
import { separateUndergroundRoofState } from '../utils/buildingRoofState';

const PAGE_SIZE = 50;
const BUILDING_STATE_STORAGE_KEY = 'autospec-building-state';
const GRAVITY_M_S2 = 9.81;

const getThermalLimitForPart = (partId) => {
  const mapping = sia3801.application_mapping?.find((entry) => entry.building_part === partId);
  if (!mapping) return null;
  return finiteNumber(sia3801.contexts?.[mapping.context]?.limits?.[mapping.element_type]);
};

const loadPersistedBuildingState = () => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(BUILDING_STATE_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
};

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

const passesRange = (value, range) => {
  const number = finiteNumber(value);
  if (number === null) return true;
  return number >= range[0] && number <= range[1];
};

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
  if (rei === null || rei === undefined || rei === '') return null;
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

const displayName = (item, lang) =>
  item?.translations?.[lang]?.name ||
  item?.translations?.fr?.name ||
  item?.translations?.de?.name ||
  item?.translations?.en?.name ||
  item?.translations?.it?.name ||
  item?.serialNo ||
  item?.source?.externalId ||
  item?.id ||
  'Composant';

const selectedLabels = (options, selected, allLabel = 'Tous') => {
  if (!Array.isArray(selected) || !selected.length || selected.length === options.length) return allLabel;
  return options.filter((option) => selected.includes(option.value)).map((option) => option.label).join(', ') || allLabel;
};

function Building({
  showHeader = true,
  initialProjectState = null,
  onProjectStateChange = null,
  projectToolbar = null,
  projectSessionKey = null,
  projectId = null,
}) {
  const { lang, setLang } = useContext(LangContext);
  const selectionContext = useContext(SelectedItemsContext);
  const navigate = useNavigate();
  const t = translations[lang];
  const projectMode = typeof onProjectStateChange === 'function';
  const persistedState = useMemo(
    () => separateUndergroundRoofState(initialProjectState && typeof initialProjectState === 'object' ? initialProjectState : loadPersistedBuildingState()),
    [],
  );
  const [data, setData] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projectSelectedItems, setProjectSelectedItems] = useState([]);
  const [selectionHydrated, setSelectionHydrated] = useState(!projectMode);
  const [surfaces, setSurfaces] = useState(persistedState.surfaces ?? {});
  const [ignoredGroupIds, setIgnoredGroupIds] = useState(persistedState.ignoredGroupIds || []);
  const [criteriaState, setCriteriaState] = useState(persistedState.criteriaState ?? null);
  const selectedItems = projectMode ? projectSelectedItems : selectionContext.selectedItems;
  const setSelectedItems = projectMode ? setProjectSelectedItems : selectionContext.setSelectedItems;
  const [selectedPart, setSelectedPart] = useState(persistedState.selectedPart ?? 'roof');
  const [roofType, setRoofType] = useState(persistedState.roofType ?? 'pitched');
  const [criteria, setCriteria] = useState({
    recommendedUValue: null,
    fireR: R_OPTIONS[0],
    fireEI: EI_OPTIONS[0],
    acousticRwLimit: null,
    acousticLnwLimit: null,
    acousticRwMin: null,
    acousticLnwMax: null,
      requiredSpan: 4,
    building: {
      floorCount: 2,
      length: 10,
      width: 10,
      partitionRate: 0.4,
      floorHeight: 2.9,
      totalHeight: 5.8,
      sre: 200,
      thermalEnvelopeArea: 400,
      envelopeFactor: 2,
      occupancyKey: 'A1_habitation',
      occupancyLabel: 'Habitation',
      occupancyLoadKnM2: 2,
      maxBuildingSpan: 4,
    },
  });
  const [advancedOpen, setAdvancedOpen] = useState(persistedState.advancedOpen ?? false);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [selectedSources, setSelectedSources] = useState(
    Array.isArray(persistedState.selectedSources) ? persistedState.selectedSources : [],
  );
  const [page, setPage] = useState(0);
  const [advancedRanges, setAdvancedRanges] = useState(persistedState.advancedRanges ?? null);
  const [sortBy, setSortBy] = useState(persistedState.sortBy ?? '');
  const [sortOrder, setSortOrder] = useState(persistedState.sortOrder ?? 'asc');
  const [filtersEnabled, setFiltersEnabled] = useState(persistedState.filtersEnabled ?? true);
  const [selectedStructureTypes, setSelectedStructureTypes] = useState(
    Array.isArray(persistedState.structureTypesByPart?.[persistedState.selectedPart ?? 'roof'])
      ? persistedState.structureTypesByPart[persistedState.selectedPart ?? 'roof']
      : Array.isArray(persistedState.selectedStructureTypes) ? persistedState.selectedStructureTypes : [],
  );
  const [structureTypesByPart, setStructureTypesByPart] = useState(
    persistedState.structureTypesByPart && typeof persistedState.structureTypesByPart === 'object'
      ? persistedState.structureTypesByPart
      : {},
  );
  const [selectedStructureMaterials, setSelectedStructureMaterials] = useState(
    persistedState.structureMaterialsByPart?.[persistedState.selectedPart ?? 'roof'] ?? [],
  );
  const [structureMaterialsByPart, setStructureMaterialsByPart] = useState(
    persistedState.structureMaterialsByPart && typeof persistedState.structureMaterialsByPart === 'object'
      ? persistedState.structureMaterialsByPart
      : {},
  );
  const [selectedInsulationMaterials, setSelectedInsulationMaterials] = useState(
    persistedState.insulationMaterialsByPart?.[persistedState.selectedPart ?? 'roof'] ?? [],
  );
  const [insulationMaterialsByPart, setInsulationMaterialsByPart] = useState(
    persistedState.insulationMaterialsByPart && typeof persistedState.insulationMaterialsByPart === 'object'
      ? persistedState.insulationMaterialsByPart
      : {},
  );

  const [selectedScreedMaterials, setSelectedScreedMaterials] = useState(
    persistedState.selectedScreedMaterials ?? [],
  );

  const activePart = getBuildingPart(selectedPart);
  const activeCategories = useMemo(
    () => selectedPart === 'roof' ? [getRoofCategory(roofType)] : activePart.categories,
    [activePart.categories, roofType, selectedPart],
  );
  const activeSubcategories = useMemo(
    () => activePart.subcategories ?? [],
    [activePart],
  );
  const thermalUValueLimit = getThermalLimitForPart(selectedPart);
  const recommendedUValue = ['roof', 'outer_walls'].includes(selectedPart)
    ? criteria.recommendedUValue
    : null;
  const applicableThermalValues = [thermalUValueLimit, recommendedUValue]
    .map(finiteNumber)
    .filter((value) => value !== null);
  const appliedThermalUValue = applicableThermalValues.length
    ? Math.min(...applicableThermalValues)
    : null;
  const floorFireRating = criteria.fireR || R_OPTIONS[0];
  const getActiveFloorSpan = useCallback(
    (item) => getFloorSpanForRating(item, floorFireRating) ?? (
      floorFireRating === R_OPTIONS[0] ? getGoverningSpan(item) : null
    ),
    [floorFireRating],
  );

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [components, sources, loadedMaterials, loadedProducts] = await Promise.all([
          loadComponents(),
          fetchDbSources(),
          loadMaterials(),
          loadProducts(),
        ]);
        if (cancelled) return;
        setData(components);
        setMaterials(loadedMaterials);
        setProducts(loadedProducts);
        if (projectMode) {
          const selectedIds = new Set(Array.isArray(persistedState.selectedItemIds) ? persistedState.selectedItemIds : []);
          const exactItems = components.filter((component) => selectedIds.has(component.id));
          const savedGroups = (Array.isArray(persistedState.selectedGroups) ? persistedState.selectedGroups : [])
            .map((savedGroup) => restoreGroupSelection(savedGroup, components))
            .filter(Boolean);
          setProjectSelectedItems([...exactItems, ...savedGroups]);
          setSelectionHydrated(true);
        }
        const options = sources.map((source) => ({ value: source.file, label: source.label }));
        setSourceOptions(options);
        setSelectedSources((current) => (
          Array.isArray(persistedState.selectedSources)
            ? current.filter((source) => options.some((option) => option.value === source))
            : options.map((option) => option.value)
        ));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [persistedState, projectMode]);

  useEffect(() => {
    if (projectMode || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(BUILDING_STATE_STORAGE_KEY, JSON.stringify({
        selectedPart,
        roofType,
        advancedOpen,
        selectedSources,
        advancedRanges,
        sortBy,
        sortOrder,
        filtersEnabled,
        selectedStructureTypes,
      }));
    } catch (error) {
      // Storage can be unavailable (for example in private browsing); the page remains usable.
    }
  }, [advancedOpen, advancedRanges, filtersEnabled, projectMode, roofType, selectedPart, selectedSources, selectedStructureTypes, sortBy, sortOrder]);

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
  const resetFilters = useCallback(() => {
    setSelectedPart('roof');
    setRoofType('pitched');
    setAdvancedOpen(false);
    setSortBy('');
    setSortOrder('asc');
    setFiltersEnabled(true);
    setSelectedSources(sourceOptions.map((option) => option.value));
    setSelectedStructureTypes(getComponentStructureTypeOptions(data, lang).map((option) => option.value));
    if (projectMode) {
      setStructureTypesByPart({});
      setSelectedStructureMaterials([]);
      setStructureMaterialsByPart({});
      setSelectedInsulationMaterials([]);
      setInsulationMaterialsByPart({});
      setSelectedScreedMaterials([]);
    }
    setAdvancedRanges({
      thickness: bounds.thickness,
      gwp: bounds.gwp,
      span: bounds.span,
      uValue: bounds.uValue,
      rw: bounds.rw,
      lnw: bounds.lnw,
    });
    setPage(0);
  }, [bounds, data, lang, projectMode, sourceOptions]);

  const categoryData = useMemo(
    () => data.filter((item) => componentMatchesTaxonomy(item, activeCategories, activeSubcategories)),
    [activeCategories, activeSubcategories, data],
  );

  const structureTypeOptions = useMemo(
    () => getComponentStructureTypeOptions(categoryData, lang),
    [categoryData, lang],
  );

  useEffect(() => {
    if (!data.length) return;
    const available = structureTypeOptions.map((option) => option.value);
    setSelectedStructureTypes((current) => {
      const valid = current.filter((typeId) => available.includes(typeId));
      return valid.length ? valid : available;
    });
  }, [data.length, structureTypeOptions]);

  useEffect(() => {
    if (!projectMode || !data.length || !structureTypeOptions.length) return;
    setStructureTypesByPart((current) => {
      const next = { ...current, [selectedPart]: selectedStructureTypes };
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [data.length, projectMode, selectedPart, selectedStructureTypes, structureTypeOptions.length]);

  useEffect(() => {
    if (!projectMode || !selectionHydrated || !criteriaState) return;
    onProjectStateChange({
      selectedPart,
      roofType,
      criteriaState,
      advancedOpen,
      selectedSources,
      advancedRanges,
      sortBy,
      sortOrder,
      filtersEnabled,
      selectedStructureTypes,
      structureTypesByPart,
      selectedStructureMaterials,
      structureMaterialsByPart,
      selectedInsulationMaterials,
      insulationMaterialsByPart,
      selectedScreedMaterials,
      selectedItemIds: selectedItems.map((item) => item.id),
      selectedGroups: selectedItems.filter((item) => item.__isComponentGroup).map(serializeGroupSelection),
      ignoredGroupIds,
      surfaces,
    });
  }, [
    advancedOpen,
    advancedRanges,
    criteriaState,
    filtersEnabled,
    onProjectStateChange,
    projectMode,
    roofType,
    selectedItems,
    ignoredGroupIds,
    selectedPart,
    selectedSources,
    selectedStructureMaterials,
    selectedStructureTypes,
    selectedInsulationMaterials,
    structureMaterialsByPart,
    structureTypesByPart,
    insulationMaterialsByPart,
    selectedScreedMaterials,
    selectionHydrated,
    sortBy,
    sortOrder,
    surfaces,
  ]);

  const fireThresholdR = criteria.fireR;
  const fireThresholdEI = criteria.fireEI;

  const availableCategoryData = useMemo(() => categoryData.filter((item) =>
    (!sourceOptions.length || !selectedSources.length || selectedSources.includes(item.__sourceFile || '')) &&
    (!getComponentStructureTypeId(item) || selectedStructureTypes.includes(getComponentStructureTypeId(item)))
  ), [categoryData, selectedSources, selectedStructureTypes, sourceOptions.length]);

  const materialCatalog = useMemo(() => ({
    materialById: new Map(materials.map((material) => [String(material.id), material])),
    productById: new Map(products.map((product) => [String(product.id), product])),
  }), [materials, products]);

  const structureMaterialOptions = useMemo(
    () => projectMode ? getStructureMaterialOptions(availableCategoryData, lang, materialCatalog) : [],
    [availableCategoryData, lang, materialCatalog, projectMode],
  );
  const insulationMaterialOptions = useMemo(
    () => projectMode ? getInsulationMaterialOptions(availableCategoryData, lang, materialCatalog) : [],
    [availableCategoryData, lang, materialCatalog, projectMode],
  );
  const screedMaterialOptions = useMemo(
    () => projectMode && selectedPart === 'floors'
      ? getScreedMaterialOptions(availableCategoryData, lang, materialCatalog) : [],
    [availableCategoryData, lang, materialCatalog, projectMode, selectedPart],
  );

  useEffect(() => {
    if (!projectMode || !data.length || selectedPart !== 'floors') return;
    const available = screedMaterialOptions.map((option) => option.value);
    setSelectedScreedMaterials((current) => {
      const valid = current.filter((value) => available.includes(value));
      return valid.length ? valid : available;
    });
  }, [data.length, projectMode, screedMaterialOptions, selectedPart]);

  useEffect(() => {
    if (!projectMode || !data.length) return;
    const available = structureMaterialOptions.map((option) => option.value);
    setSelectedStructureMaterials((current) => {
      const valid = current.filter((value) => available.includes(value));
      return valid.length ? valid : available;
    });
  }, [data.length, projectMode, structureMaterialOptions]);

  useEffect(() => {
    if (!projectMode || !data.length) return;
    const available = insulationMaterialOptions.map((option) => option.value);
    setSelectedInsulationMaterials((current) => {
      const valid = current.filter((value) => available.includes(value));
      return valid.length ? valid : available;
    });
  }, [data.length, insulationMaterialOptions, projectMode]);

  useEffect(() => {
    if (!projectMode || !data.length) return;
    setStructureMaterialsByPart((current) => ({ ...current, [selectedPart]: selectedStructureMaterials }));
    setInsulationMaterialsByPart((current) => ({ ...current, [selectedPart]: selectedInsulationMaterials }));
  }, [data.length, projectMode, selectedInsulationMaterials, selectedPart, selectedStructureMaterials]);

  const materialFilteredCategoryData = useMemo(
    () => projectMode
      ? availableCategoryData.filter((item) => matchesMaterialFilters(item, selectedStructureMaterials, selectedInsulationMaterials, selectedScreedMaterials))
      : availableCategoryData,
    [availableCategoryData, projectMode, selectedInsulationMaterials, selectedStructureMaterials, selectedScreedMaterials],
  );

  const weightCandidatesByPart = useMemo(() => {
    const matchesCommonFilters = (item, partId) => {
      if (sourceOptions.length && selectedSources.length && !selectedSources.includes(item.__sourceFile || '')) return false;
      const structureTypeId = getComponentStructureTypeId(item);
      const partStructureTypes = partId === selectedPart
        ? selectedStructureTypes
        : structureTypesByPart[partId];
      if (structureTypeId && Array.isArray(partStructureTypes) && partStructureTypes.length && !partStructureTypes.includes(structureTypeId)) return false;
      if (projectMode) {
        const partStructureMaterials = partId === selectedPart ? selectedStructureMaterials : structureMaterialsByPart[partId];
        const partInsulationMaterials = partId === selectedPart ? selectedInsulationMaterials : insulationMaterialsByPart[partId];
        if (!matchesMaterialFilters(item, partStructureMaterials, partInsulationMaterials, selectedScreedMaterials)) return false;
      }
      if (!filtersEnabled) return true;
      const thickness = finiteNumber(item.thickness_mm);
      const gwp = finiteNumber(item.gwp_kgco2e_m2);
      const uValue = finiteNumber(item.uValue_W_m2K);
      const acoustic = getAcousticInsulation(item);
      const span = partId === 'floors' ? getActiveFloorSpan(item) : null;
      return passesRange(thickness, ranges.thickness) &&
        passesRange(gwp, ranges.gwp) &&
        passesRange(uValue, ranges.uValue) &&
        passesRange(acoustic.rwCorrected, ranges.rw) &&
        (partId !== 'floors' || passesRange(acoustic.lnwCorrected, ranges.lnw)) &&
        (partId !== 'floors' || passesRange(span, ranges.span));
    };

    const result = {};
    ['roof', 'underground_roofs', 'outer_walls', 'underground_walls', 'interior_walls', 'partitions', 'floors', 'foundation', 'balcony'].forEach((partId) => {
      const part = getBuildingPart(partId);
      const categories = partId === 'roof' ? [getRoofCategory(roofType)] : part.categories;
      result[partId] = data.filter((item) =>
        componentMatchesTaxonomy(item, categories, part.subcategories) && matchesCommonFilters(item, partId)
      );
    });
    return result;
  }, [data, filtersEnabled, getActiveFloorSpan, insulationMaterialsByPart, projectMode, ranges, roofType, selectedInsulationMaterials, selectedPart, selectedSources, selectedStructureMaterials, selectedStructureTypes, sourceOptions.length, structureMaterialsByPart, structureTypesByPart, selectedScreedMaterials]);

  const buildingWeightResult = useMemo(
    () => calculateBuildingWeightInfo(criteria.building, selectedItems, weightCandidatesByPart),
    [criteria.building, selectedItems, weightCandidatesByPart],
  );
  const wallLinearLoads = useMemo(() => {
    const lowestLevel = buildingWeightResult.levels.find((level) => level.level === 1)
      ?? buildingWeightResult.levels[buildingWeightResult.levels.length - 1];
    const toForce = (range) => {
      const maximumMass = finiteNumber(range?.max);
      return maximumMass === null ? null : maximumMass * GRAVITY_M_S2 / 1000;
    };
    return {
      outer_walls: toForce(lowestLevel?.exterior),
      interior_walls: toForce(lowestLevel?.interior),
    };
  }, [buildingWeightResult]);
  const requiredWallLinearLoad = wallLinearLoads[selectedPart] ?? null;

  const getItemFilterFailures = useCallback((item) => {
    const failures = new Set();
    const thickness = finiteNumber(item.thickness_mm);
    const gwp = finiteNumber(item.gwp_kgco2e_m2);
    const uValue = finiteNumber(item.uValue_W_m2K);
    const span = getActiveFloorSpan(item);
    const acoustic = getAcousticInsulation(item);
    const passesThermal = appliedThermalUValue === null || uValue === null || uValue <= appliedThermalUValue;
    const declaredFireR = fireRating(item, 'R');
    const declaredFireEI = fireRating(item, 'EI');
    const calculatedFloorFireR = item.categoryId === 'floor_assembly'
      ? getFloorSpanForRating(item, fireThresholdR)
      : null;
    const fireRPasses = calculatedFloorFireR !== null
      ? calculatedFloorFireR > 0
      : declaredFireR === null || ratingIndex(declaredFireR, R_OPTIONS) >= ratingIndex(fireThresholdR, R_OPTIONS);
    const fireEIPasses = declaredFireEI === null ||
      ratingIndex(declaredFireEI, EI_OPTIONS) >= ratingIndex(fireThresholdEI, EI_OPTIONS);
    const passesFire = ['roof', 'underground_roofs'].includes(selectedPart) || (
      fireRPasses && fireEIPasses
    );
    const passesRequiredSpan = criteria.requiredSpan <= 0 || item.categoryId !== 'floor_assembly' || span === null || span >= criteria.requiredSpan;
    const passesAdvancedSpan = item.categoryId !== 'floor_assembly' || passesRange(span, ranges.span);
    const isLoadBearingWallPart = ['outer_walls', 'interior_walls'].includes(selectedPart);
    const wallLinearResistance = isLoadBearingWallPart
      ? getWallLinearResistance(item, fireThresholdR)
      : null;
    const passesWallLinearResistance = !isLoadBearingWallPart ||
      requiredWallLinearLoad === null ||
      wallLinearResistance === null ||
      wallLinearResistance >= requiredWallLinearLoad;
    if (!passesThermal || !passesRange(uValue, ranges.uValue)) failures.add('uValue');
    if (!passesRange(thickness, ranges.thickness)) failures.add('thickness');
    if (!passesRange(gwp, ranges.gwp)) failures.add('gwp');
    if (criteria.acousticRwMin !== null && acoustic.rwCorrected !== null && acoustic.rwCorrected < criteria.acousticRwMin) failures.add('rw');
    if (!passesRange(acoustic.rwCorrected, ranges.rw)) failures.add('rw');
    if (selectedPart === 'floors') {
      if (criteria.acousticLnwMax !== null && acoustic.lnwCorrected !== null && acoustic.lnwCorrected > criteria.acousticLnwMax) failures.add('lnw');
      if (!passesRange(acoustic.lnwCorrected, ranges.lnw)) failures.add('lnw');
      if (!passesRequiredSpan || !passesAdvancedSpan) failures.add(`span:${fireThresholdR}`);
    }
    if (!passesWallLinearResistance) failures.add(`linearResistance:${fireThresholdR}`);
    if (!passesFire) {
      if (!fireRPasses) {
        failures.add('fireR');
        if (item.categoryId === 'floor_assembly') failures.add(`span:${fireThresholdR}`);
      }
      if (!fireEIPasses) failures.add('fireEI');
    }
    return failures;
  }, [appliedThermalUValue, criteria, fireThresholdEI, fireThresholdR, getActiveFloorSpan, ranges, requiredWallLinearLoad, selectedPart]);

  const filteredData = useMemo(
    () => materialFilteredCategoryData.filter((item) => getItemFilterFailures(item).size === 0),
    [getItemFilterFailures, materialFilteredCategoryData],
  );

  const displayedData = filtersEnabled ? filteredData : materialFilteredCategoryData;

  const carbonCandidatesByPart = useMemo(() => {
    const result = { ...weightCandidatesByPart };
    result[selectedPart] = displayedData;
    if (projectMode && ignoredGroupIds.length) {
      const ignored = new Set(ignoredGroupIds);
      Object.keys(result).forEach((partId) => {
        result[partId] = groupBuildingComponents(result[partId] || [])
          .filter((group) => !ignored.has(selectableItemIdentity(group)))
          .flatMap((group) => group.__groupMembers);
      });
    }
    return result;
  }, [displayedData, ignoredGroupIds, projectMode, selectedPart, weightCandidatesByPart]);

  const analysisSelectedItems = useMemo(() => selectedItems.map((item) => {
    // A selected group is the set of variants chosen at selection time.
    // Later filters apply to the catalogue, not to this saved selection.
    if (item.__isComponentGroup) return item;
    const partId = partForComponent(item, roofType);
    const availableIds = new Set((carbonCandidatesByPart[partId] || []).map((candidate) => candidate.id));
    return availableIds.has(item.id) ? item : { ...item, __excludedByFilters: true };
  }), [carbonCandidatesByPart, roofType, selectedItems]);

  const bars = useMemo(() => ({
    thickness: histogram(categoryData, (item) => item.thickness_mm, ...bounds.thickness),
    gwp: histogram(categoryData, (item) => item.gwp_kgco2e_m2, ...bounds.gwp),
    span: histogram(categoryData, getActiveFloorSpan, ...bounds.span),
    uValue: histogram(categoryData, (item) => item.uValue_W_m2K, ...bounds.uValue),
    rw: histogram(categoryData, (item) => getAcousticInsulation(item).rwCorrected, ...bounds.rw),
    lnw: histogram(categoryData, (item) => getAcousticInsulation(item).lnwCorrected, ...bounds.lnw),
  }), [bounds, categoryData, getActiveFloorSpan]);

  const sortedData = useMemo(() => {
    if (!sortBy) return displayedData;
    const direction = sortOrder === 'desc' ? -1 : 1;
    const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true });
    return [...displayedData].sort((a, b) => {
      if (sortBy === 'name') return direction * collator.compare(displayName(a, lang), displayName(b, lang));
      const accessor = {
        thickness: (item) => item.thickness_mm,
        weight: (item) => item.weight_kg_m2,
        uValue: (item) => item.uValue_W_m2K,
        gwp: (item) => item.gwp_kgco2e_m2,
        span: getActiveFloorSpan,
      }[sortBy];
      if (!accessor) return 0;
      const aValue = finiteNumber(accessor(a));
      const bValue = finiteNumber(accessor(b));
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return direction * (aValue - bValue);
    });
  }, [displayedData, getActiveFloorSpan, lang, sortBy, sortOrder]);

  const groupedData = useMemo(
    () => projectMode ? groupBuildingComponents(sortedData, lang) : [],
    [lang, projectMode, sortedData],
  );

  useEffect(() => {
    if (!projectMode || !selectionHydrated) return;
    const currentGroups = new Map(groupedData.map((group) => [selectableItemIdentity(group), group]));
    setProjectSelectedItems((current) => {
      let changed = false;
      const next = current.map((item) => {
        const identity = selectableItemIdentity(item);
        if (!item.__isComponentGroup || item.__isGroupCollection || !currentGroups.has(identity)) return item;
        const replacement = currentGroups.get(identity);
        const oldIds = (item.__groupMembers || []).map((member) => member.id).join('|');
        const newIds = (replacement.__groupMembers || []).map((member) => member.id).join('|');
        if (oldIds === newIds && item.__groupTitle === replacement.__groupTitle) return item;
        changed = true;
        return { ...replacement, id: item.id, __groupSelectionNumber: item.__groupSelectionNumber || 1, __filterSummary: item.__filterSummary || [] };
      });
      return changed ? next : current;
    });
  }, [groupedData, projectMode, selectionHydrated]);

  useEffect(() => {
    if (sortBy === 'span' && selectedPart !== 'floors') setSortBy('');
  }, [selectedPart, sortBy]);

  useEffect(() => setPage(0), [criteria, filtersEnabled, ranges, selectedInsulationMaterials, selectedPart, selectedSources, selectedStructureMaterials, selectedScreedMaterials, sortBy, sortOrder]);
  const cardData = projectMode ? groupedData : sortedData;
  const totalPages = Math.max(1, Math.ceil(cardData.length / PAGE_SIZE));
  const visibleData = cardData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const selectionState = {
    selectedGroups: selectedItems.filter((item) => item.__isComponentGroup).map(serializeGroupSelection),
    ignoredGroupIds,
  };
  const updateGroupSelection = (group, action, checked) => {
    const descriptor = { ...serializeGroupSelection(group), filterSummary: group.__filterSummary || currentFilterSummary() };
    const next = action === 'ignore'
      ? setGroupIgnored(selectionState, descriptor, checked)
      : setGroupSelected(selectionState, descriptor, checked);
    setIgnoredGroupIds(next.ignoredGroupIds);
    const restored = next.selectedGroups.map((saved) => restoreGroupSelection(saved, data, lang)).filter(Boolean);
    setSelectedItems((current) => [...current.filter((item) => !item.__isComponentGroup), ...restored]);
  };
  const eligibleGroups = groupedData.filter((group) => !ignoredGroupIds.includes(selectableItemIdentity(group)));
  const eligibleIdentities = eligibleGroups.map(selectableItemIdentity).sort().join('|');
  const selectedCollection = selectedItems.find((item) => item.__isGroupCollection
    && item.__childGroups.map(selectableItemIdentity).sort().join('|') === eligibleIdentities);
  const toggleFilteredGroups = (checked) => {
    if (!checked) {
      if (selectedCollection) setSelectedItems((current) => current.filter((item) => item.id !== selectedCollection.id));
      return;
    }
    if (!eligibleGroups.length) return;
    const collection = makeGroupCollection(eligibleGroups.map((group) => ({ ...group, __filterSummary: currentFilterSummary() })));
    const identities = new Set(eligibleGroups.map(selectableItemIdentity));
    setSelectedItems((current) => [...current.filter((item) => !identities.has(selectableItemIdentity(item))), collection]);
  };

  const toggleSelectedItem = (item) => item.__isComponentGroup
    ? updateGroupSelection(item, 'select', !hasSelectedGroup(selectionState, serializeGroupSelection(item)))
    : setSelectedItems((current) =>
    current.some((selected) => selectableItemIdentity(selected) === selectableItemIdentity(item))
      ? current.filter((selected) => selectableItemIdentity(selected) !== selectableItemIdentity(item))
      : [...current, item.__isComponentGroup ? {
        ...item,
        __groupSelectionNumber: 1 + Math.max(0, ...current
          .filter((selected) => selected.__isComponentGroup && selected.__groupKey === item.__groupKey)
          .map((selected) => selected.__groupSelectionNumber || 1)),
      } : item]
  );

  const currentFilterSummary = () => {
    const summary = [
      { label: 'Filtrer', value: filtersEnabled ? 'Activé' : 'Désactivé' },
      { label: 'Sources', value: selectedLabels(sourceOptions, selectedSources, t.all) },
      { label: 'Système constructif', value: selectedLabels(structureTypeOptions, selectedStructureTypes, t.all) },
      { label: 'Matériau de la structure', value: selectedLabels(structureMaterialOptions, selectedStructureMaterials, t.all) },
      { label: 'Matériau isolant', value: selectedLabels(insulationMaterialOptions, selectedInsulationMaterials, t.all) },
    ];
    if (selectedPart === 'floors') summary.push({ label: 'Matériau de la chape', value: selectedLabels(screedMaterialOptions, selectedScreedMaterials, t.all) });
    if (filtersEnabled) {
      summary.push(
        { label: 'Épaisseur', value: `${ranges.thickness[0]}–${ranges.thickness[1]} mm` },
        { label: 'GWP', value: `${ranges.gwp[0]}–${ranges.gwp[1]} kg CO₂-eq/m²` },
        { label: 'Valeur U', value: `${ranges.uValue[0]}–${ranges.uValue[1]} W/m²K` },
        { label: 'Rw', value: `${ranges.rw[0]}–${ranges.rw[1]} dB` },
      );
      if (selectedPart === 'floors') summary.push({ label: 'Portée', value: `${ranges.span[0]}–${ranges.span[1]} m` });
    }
    return summary;
  };

  const openGroupDetails = (group) => {
    navigate(`/my-buildings/group/${encodeURIComponent(group.__groupKey)}`, {
      state: {
        matchingIds: (group.__groupMembers || []).map((member) => member.id),
        filterSummary: group.__filterSummary?.length ? group.__filterSummary : currentFilterSummary(),
        filtersEnabled,
        projectSessionKey,
        projectId,
        descriptor: serializeGroupSelection(group),
        selectionState,
      },
    });
  };

  return (
    <>
      {showHeader ? <Header lang={lang} setLang={setLang} /> : null}
      <main className="building-page">
        {projectToolbar}
        <div className="building-layout">
          <BuildingCriteria
            lang={lang}
            selectedCategories={activeCategories}
            onCriteriaChange={handleCriteriaChange}
            onStateChange={projectMode ? setCriteriaState : null}
            onReset={resetFilters}
            initialState={projectMode ? persistedState.criteriaState : null}
            storageKey={projectMode ? null : undefined}
          />

          <div className="building-content">
            <BuildingDiagram
              selectedPart={selectedPart}
              onSelectPart={(partId) => {
                setSelectedPart(partId);
                setSelectedStructureTypes(projectMode && Array.isArray(structureTypesByPart[partId])
                  ? structureTypesByPart[partId]
                  : []);
                setSelectedStructureMaterials(projectMode && Array.isArray(structureMaterialsByPart[partId])
                  ? structureMaterialsByPart[partId]
                  : []);
                setSelectedInsulationMaterials(projectMode && Array.isArray(insulationMaterialsByPart[partId])
                  ? insulationMaterialsByPart[partId]
                  : []);
              }}
              roofType={roofType}
              onRoofTypeChange={(type) => {
                setRoofType(type);
                if (selectedPart !== 'roof') return;
                setSelectedStructureTypes([]);
                setSelectedStructureMaterials([]);
                setSelectedInsulationMaterials([]);
              }}
            />

            {!projectMode ? (
              <BuildingWeightInfo
                building={criteria.building}
                selectedItems={selectedItems}
                candidatesByPart={carbonCandidatesByPart}
              />
            ) : null}

            {projectMode ? (
              <BuildingCarbonSummary
                building={criteria.building}
                selectedItems={analysisSelectedItems}
                selectionReady={selectionHydrated}
                candidatesByPart={carbonCandidatesByPart}
                surfaces={surfaces}
                onSurfacesChange={setSurfaces}
                roofType={roofType}
                lang={lang}
                onOpenGroup={openGroupDetails}
              />
            ) : null}

            <section className="building-panel">
              <h3>Macro-composants sélectionnés</h3>
              {selectedItems.length === 0 ? (
                <p className="building-muted">Aucun macro-composant sélectionné.</p>
              ) : (
                <ul className="building-selected-list">
                  {selectedItems.map((item) => (
                    <li key={item.id}>
                      {partForComponent(item, roofType) ? <span className="building-selected-part">{getBuildingPart(partForComponent(item, roofType)).label} — </span> : null}
                      {item.__isComponentGroup
                        ? item.__isGroupCollection
                          ? <details><summary>{displayName(item, lang)}</summary><ul>{item.__childGroups.map((child) => <li key={child.id}><button type="button" className="building-group-link" onClick={() => openGroupDetails(child)}>{displayName(child, lang)} · {child.__groupMembers.length} variantes</button></li>)}</ul></details>
                          : <button type="button" className="building-group-link" title={(item.__groupMembers || []).map((member) => displayName(member, lang)).join('\n')} onClick={() => openGroupDetails(item)}>{displayName(item, lang)} · sélection {item.__groupSelectionNumber || 1} · {item.__groupMembers?.length || 0} variante(s)</button>
                        : <Link to={`/element/${item.id}`}>{displayName(item, lang)}</Link>}
                      <button type="button" onClick={() => setSelectedItems((current) => current.filter((selected) => selected.id !== item.id))} aria-label={`Retirer ${displayName(item, lang)}`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="building-panel">
              <h3>Informations — {activePart.label}</h3>
              <div className="building-requirement-values">
                {thermalUValueLimit !== null && <div><span>Valeur U limite</span><strong>{thermalUValueLimit.toFixed(3)} W/m²K</strong></div>}
                {recommendedUValue !== null && <div><span>Valeur U recommandée</span><strong>{recommendedUValue.toFixed(3)} W/m²K</strong></div>}
                {['outer_walls', 'interior_walls'].includes(selectedPart) && <div><span>Charge linéique requise</span><strong>{requiredWallLinearLoad === null ? 'N/A' : `${requiredWallLinearLoad.toFixed(1)} kN/m`}</strong></div>}
                {!['roof', 'underground_roofs'].includes(selectedPart) && <div><span>Feu</span><strong>{fireThresholdR} / {fireThresholdEI}</strong></div>}
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
                  {selectedPart === 'floors' && <RangeSlider label="Portée admissible du composant" min={bounds.span[0]} max={bounds.span[1]} step={0.1} values={ranges.span} onChange={(value) => setRange('span', value)} bars={bars.span} unit="m" />}
                  <RangeSlider label={t.uValue} min={bounds.uValue[0]} max={bounds.uValue[1]} step={0.01} values={ranges.uValue} onChange={(value) => setRange('uValue', value)} bars={bars.uValue} unit="W/m²K" />
                  <RangeSlider label={t.acoustic_rw_corrected ?? 'Rw corrigé'} min={bounds.rw[0]} max={bounds.rw[1]} step={1} values={ranges.rw} onChange={(value) => setRange('rw', value)} bars={bars.rw} unit="dB" />
                  {selectedPart === 'floors' && <RangeSlider label={t.acoustic_lnw_corrected ?? 'Ln,w corrigé'} min={bounds.lnw[0]} max={bounds.lnw[1]} step={1} values={ranges.lnw} onChange={(value) => setRange('lnw', value)} bars={bars.lnw} unit="dB" />}
                </div>
              )}
            </section>
          </div>

          <section className="building-results">
              <div className="building-results-header">
                <h2>
                  {activePart.label} — {projectMode ? `${groupedData.length} groupe${groupedData.length > 1 ? 's' : ''} · ` : ''}{displayedData.length} / {availableCategoryData.length} résultat{availableCategoryData.length > 1 ? 's' : ''}
                </h2>
                <div className="building-sort-controls">
                  <label className="building-filter-toggle">
                    <input
                      type="checkbox"
                      checked={filtersEnabled}
                      onChange={(event) => setFiltersEnabled(event.target.checked)}
                    />
                    <span>{t.filter_results ?? 'Filtrer'}</span>
                  </label>
                  <label>
                    <span>Trier par</span>
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                      <option value="">---</option>
                      <option value="name">Nom</option>
                      <option value="thickness">Épaisseur</option>
                      <option value="weight">Masse surfacique</option>
                      <option value="uValue">Valeur U</option>
                      <option value="gwp">GWP</option>
                      {selectedPart === 'floors' ? <option value="span">Portée admissible</option> : null}
                    </select>
                  </label>
                  <label>
                    <span>Ordre</span>
                    <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={!sortBy}>
                      <option value="asc">Croissant</option>
                      <option value="desc">Décroissant</option>
                    </select>
                  </label>
                </div>
              </div>
              {(structureTypeOptions.length > 0 || (projectMode && (structureMaterialOptions.length > 0 || insulationMaterialOptions.length > 0 || screedMaterialOptions.length > 0))) && (
                <div className="building-group-selectors">
                  {structureTypeOptions.length > 0 ? (
                  <SourceSelector
                    label="Système constructif"
                    options={structureTypeOptions}
                    selected={selectedStructureTypes}
                    onChange={setSelectedStructureTypes}
                    allLabel={t.all}
                  />
                  ) : null}
                  {projectMode && structureMaterialOptions.length > 0 ? (
                    <SourceSelector
                      label="Matériau de la structure"
                      options={structureMaterialOptions}
                      selected={selectedStructureMaterials}
                      onChange={setSelectedStructureMaterials}
                      allLabel={t.all}
                    />
                  ) : null}
                  {projectMode && insulationMaterialOptions.length > 0 ? (
                    <SourceSelector
                      label="Matériau isolant"
                      options={insulationMaterialOptions}
                      selected={selectedInsulationMaterials}
                      onChange={setSelectedInsulationMaterials}
                      allLabel={t.all}
                    />
                  ) : null}
                  {projectMode && selectedPart === 'floors' && screedMaterialOptions.length > 0 ? (
                    <SourceSelector
                      label="Matériau de la chape"
                      options={screedMaterialOptions}
                      selected={selectedScreedMaterials}
                      onChange={setSelectedScreedMaterials}
                      allLabel={t.all}
                    />
                  ) : null}
                </div>
              )}
              {loading ? <p>Chargement…</p> : null}
              {!loading && displayedData.length === 0 ? <p>Aucun composant disponible dans cette catégorie et ces sources.</p> : null}
              {projectMode ? <div><label className="building-select-filtered"><input type="checkbox" checked={Boolean(selectedCollection)} disabled={!eligibleGroups.length} onChange={(event) => toggleFilteredGroups(event.target.checked)} /> Sélectionner les groupes filtrés ({eligibleGroups.length})</label><p className="building-muted">Une surface commune et une plage d’impact pour tous les groupes retenus. Les groupes ignorés sont exclus.</p></div> : null}
              <div className="building-results-grid">
                {visibleData.map((item) => projectMode ? (
                  <ComponentGroupCard
                    key={item.id}
                    group={item}
                    selected={hasSelectedGroup(selectionState, serializeGroupSelection(item))}
                    ignored={ignoredGroupIds.includes(selectableItemIdentity(item))}
                    onIgnore={(checked) => updateGroupSelection(item, 'ignore', checked)}
                    onToggle={() => toggleSelectedItem(item)}
                    onDetails={() => openGroupDetails(item)}
                    t={t}
                  />
                ) : (
                  <ComponentCard
                    key={item.id}
                    item={item}
                    selected={selectedItems.some((selected) => selected.id === item.id)}
                    onToggle={() => toggleSelectedItem(item)}
                    onDetails={() => navigate(`/element/${item.id}`)}
                    lang={lang}
                    t={t}
                    failedFilters={filtersEnabled ? [] : [...getItemFilterFailures(item)]}
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
      </main>
    </>
  );
}

export default Building;
