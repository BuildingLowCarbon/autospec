import React, { useEffect, useMemo, useState } from 'react';
import factorsData from './ENteb/data/factors.json';
import fireRequirements from '../data/fire_requirements.json';
import acousticRequirements from '../data/acoustic_requirements.json';
import sia261Data from '../data/sia261.json';
import partitionRatioImageDe from '../assets/illustrations/parameters/partition-ratio-Minergie_DE.png';
import partitionRatioImageFr from '../assets/illustrations/parameters/partition-ratio-Minergie_FR.png';
import partitionRatioImageEn from '../assets/illustrations/parameters/partition-ratio-Minergie_EN.png';
import partitionRatioImageIt from '../assets/illustrations/parameters/partition-ratio-Minergie_IT.png';
import { getRequirementCategoryIds } from '../utils/componentTaxonomy';

const FIRE_R_VALUES = ['R0', 'R30', 'R60'];
const FIRE_EI_VALUES = ['EI0', 'EI30', 'EI60'];
const BUILDING_CRITERIA_STORAGE_KEY = 'autospec-building-criteria';

const DEFAULT_FACTORS = {
  station: '5',
  Regelungsfaktor: '1',
  heat_storage_capacity: '2',
  wall_u_value: '0.17',
  windows_u_value: '1',
  windows_g_value: '0.4',
  windows_ratio: '0.2',
  window_ventilation: '0.838',
};

const loadPersistedCriteria = () => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(BUILDING_CRITERIA_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
};

const tr = (value, lang) => value?.[lang] ?? value?.fr ?? value?.en ?? '';
const optionLabel = (item, lang) => item?.[`name_${lang}`] ?? item?.name_fr ?? String(item?.id ?? item?.value ?? '');
const optionValue = (item) => String(item?.id ?? item?.value ?? '');

const pickFireValue = (requirements, categoryId, key, scale) => {
  const indexes = requirements
    .filter((requirement) => getRequirementCategoryIds(requirement).includes(categoryId))
    .map((requirement) => scale.indexOf(requirement.filter?.[key]))
    .filter((index) => index >= 0);
  return indexes.length ? scale[Math.min(...indexes)] : scale[0];
};

const pickAcousticValue = (requirements, categoryId, key, mode) => {
  const values = requirements
    .filter((requirement) => getRequirementCategoryIds(requirement).includes(categoryId))
    .map((requirement) => requirement.filter?.[key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  if (!values.length) return null;
  return mode === 'max' ? Math.max(...values) : Math.min(...values);
};

function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="building-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function PartitionRatioHelp({ lang }) {
  const images = { de: partitionRatioImageDe, fr: partitionRatioImageFr, en: partitionRatioImageEn, it: partitionRatioImageIt };
  const image = images[lang] ?? images.de;
  const sourceLabel = {
    fr: 'Source',
    de: 'Quelle',
    en: 'Source',
    it: 'Fonte',
  }[lang] ?? 'Source';
  return (
    <span className="building-illustration-tooltip">
      <button type="button" className="building-help-icon" aria-label="Afficher l’illustration du taux de cloison">?</button>
      <span className="building-illustration-popup" role="tooltip">
        <img src={image} alt="Définition Minergie du taux de cloison" />
        <small>
          {sourceLabel} :{' '}
          <a
            href="https://www.minergie.ch/media/231031_me-eco_berechnung_graue_energie-thge_v2023-2_de.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Minergie
          </a>
        </small>
      </span>
    </span>
  );
}

function BuildingCriteria({ lang = 'fr', selectedCategories = [], onCriteriaChange, onReset }) {
  const persistedCriteria = useMemo(() => loadPersistedCriteria(), []);
  const [buildingType, setBuildingType] = useState(persistedCriteria.buildingType ?? 'single_family');
  const [neighborDistance, setNeighborDistance] = useState(persistedCriteria.neighborDistance ?? 'gt_10');
  const [acousticLevel, setAcousticLevel] = useState(persistedCriteria.acousticLevel ?? 'normal');
  const [uncertainty, setUncertainty] = useState(persistedCriteria.uncertainty ?? 2);
  const [requiredSpan, setRequiredSpan] = useState(persistedCriteria.requiredSpan ?? 0);
  const [spanDirection, setSpanDirection] = useState(persistedCriteria.spanDirection ?? 'width');
  const [floorLoadDistribution, setFloorLoadDistribution] = useState(persistedCriteria.floorLoadDistribution ?? 'one_way');
  const [interiorBearingLinesOverride, setInteriorBearingLinesOverride] = useState(
    persistedCriteria.interiorBearingLinesOverride ?? '',
  );
  const [floorCount, setFloorCount] = useState(persistedCriteria.floorCount ?? 2);
  const [buildingLength, setBuildingLength] = useState(persistedCriteria.buildingLength ?? 10);
  const [buildingWidth, setBuildingWidth] = useState(persistedCriteria.buildingWidth ?? 10);
  const [partitionRate, setPartitionRate] = useState(persistedCriteria.partitionRate ?? '0.4');
  const [floorHeight, setFloorHeight] = useState(persistedCriteria.floorHeight ?? 2.9);
  const [sreOverride, setSreOverride] = useState(persistedCriteria.sreOverride ?? '');
  const [factors, setFactors] = useState({ ...DEFAULT_FACTORS, ...persistedCriteria.factors });
  const [advancedOpen, setAdvancedOpen] = useState(persistedCriteria.advancedOpen ?? false);

  const normalizedFloorCount = Math.max(1, Math.round(Number(floorCount) || 1));
  const normalizedLength = Math.max(0, Number(buildingLength) || 0);
  const normalizedWidth = Math.max(0, Number(buildingWidth) || 0);
  const normalizedFloorHeight = Math.max(0, Number(floorHeight) || 2.9);
  const footprint = normalizedLength * normalizedWidth;
  const perimeter = 2 * normalizedLength + 2 * normalizedWidth;
  const totalHeight = normalizedFloorCount * normalizedFloorHeight;
  const automaticSre = normalizedFloorCount * footprint;
  const resolvedSre = Math.max(0, Number(sreOverride) || automaticSre);
  const thermalEnvelopeArea = 2 * footprint + perimeter * totalHeight;
  const envelopeFactor = resolvedSre > 0 ? thermalEnvelopeArea / resolvedSre : 0;
  const buildingHeight = totalHeight < 11 ? 'lt_11' : totalHeight <= 30 ? 'btw_11_30' : 'gt_30';
  const buildingHeightLabel = tr(fireRequirements.i18n?.building_height?.[buildingHeight], lang) || buildingHeight;
  const spanDirectionLength = spanDirection === 'length' ? normalizedLength : normalizedWidth;
  const normalizedRequiredSpan = Math.max(0, Number(requiredSpan) || 0);
  const automaticInteriorBearingLines = normalizedRequiredSpan > 0 && spanDirectionLength > 0
    ? Math.max(0, Math.ceil(spanDirectionLength / normalizedRequiredSpan) - 1)
    : 0;
  const parsedBearingLinesOverride = Number(interiorBearingLinesOverride);
  const interiorBearingLines = interiorBearingLinesOverride !== '' && Number.isFinite(parsedBearingLinesOverride)
    ? Math.max(0, Math.round(parsedBearingLinesOverride))
    : automaticInteriorBearingLines;

  const recommendedUValue = useMemo(
    () => {
      const value = Number(factors.wall_u_value);
      return Number.isFinite(value) ? value : null;
    },
    [factors.wall_u_value],
  );

  const matchedFireRule = useMemo(
    () => fireRequirements.rules?.find((rule) =>
      rule.conditions?.use === 'residential' &&
      rule.conditions?.building_type === buildingType &&
      rule.conditions?.building_height === buildingHeight
    ) ?? null,
    [buildingHeight, buildingType],
  );

  const acousticRule = useMemo(
    () => acousticRequirements.rules?.find((rule) => rule.requirement_level === acousticLevel) ?? null,
    [acousticLevel],
  );

  const occupancy = sia261Data.occupancy?.A1_habitation;

  const resolved = useMemo(() => {
    const categoryId = selectedCategories[0] ?? '';
    const neighborCondition = neighborDistance === 'gt_10' ? '>10' : '<=10';
    const fireRules = (matchedFireRule?.requirements ?? []).filter((requirement) => {
      const requiredDistance = requirement.conditions_extra?.['neighbor_façade_distance_m'];
      return !requiredDistance || requiredDistance === neighborCondition;
    });
    const acousticRules = acousticRule?.requirements ?? [];
    const uncertaintyValue = Number.isFinite(Number(uncertainty)) ? Number(uncertainty) : 0;
    const rwBase = pickAcousticValue(acousticRules, categoryId, 'Rw_min', 'max');
    const lnwBase = pickAcousticValue(acousticRules, categoryId, 'Lnw_max', 'min');
    return {
      recommendedUValue,
      fireR: pickFireValue(fireRules, categoryId, 'R', FIRE_R_VALUES),
      fireEI: pickFireValue(fireRules, categoryId, 'EI', FIRE_EI_VALUES),
      acousticRwLimit: rwBase,
      acousticLnwLimit: lnwBase,
      acousticRwMin: rwBase === null ? null : rwBase + uncertaintyValue,
      acousticLnwMax: lnwBase === null ? null : lnwBase - uncertaintyValue,
      requiredSpan: normalizedRequiredSpan,
      building: {
        floorCount: normalizedFloorCount,
        length: normalizedLength,
        width: normalizedWidth,
        partitionRate: Number(partitionRate) || 0.4,
        floorHeight: normalizedFloorHeight,
        totalHeight,
        sre: resolvedSre,
        thermalEnvelopeArea,
        envelopeFactor,
        occupancyKey: 'A1_habitation',
        occupancyLabel: occupancy?.label ?? 'Habitation',
        occupancyLoadKnM2: Number(occupancy?.qk_kN_m2) || 0,
        maxBuildingSpan: normalizedRequiredSpan,
        spanDirection,
        floorLoadDistribution,
        interiorBearingLines,
        automaticInteriorBearingLines,
        interiorBearingLinesOverridden: interiorBearingLinesOverride !== '',
      },
    };
  }, [
    acousticRule,
    envelopeFactor,
    matchedFireRule,
    neighborDistance,
    normalizedFloorCount,
    normalizedFloorHeight,
    normalizedLength,
    normalizedWidth,
    normalizedRequiredSpan,
    occupancy,
    partitionRate,
    recommendedUValue,
    resolvedSre,
    selectedCategories,
    thermalEnvelopeArea,
    totalHeight,
    uncertainty,
    spanDirection,
    floorLoadDistribution,
    interiorBearingLines,
    automaticInteriorBearingLines,
    interiorBearingLinesOverride,
  ]);

  useEffect(() => {
    if (typeof onCriteriaChange === 'function') onCriteriaChange(resolved);
  }, [onCriteriaChange, resolved]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(BUILDING_CRITERIA_STORAGE_KEY, JSON.stringify({
        buildingType,
        neighborDistance,
        acousticLevel,
        uncertainty,
        requiredSpan,
        spanDirection,
        floorLoadDistribution,
        interiorBearingLinesOverride,
        floorCount,
        buildingLength,
        buildingWidth,
        partitionRate,
        floorHeight,
        sreOverride,
        factors,
        advancedOpen,
      }));
    } catch (error) {
      // Storage can be unavailable (for example in private browsing); the form remains usable.
    }
  }, [
    acousticLevel,
    advancedOpen,
    buildingLength,
    buildingType,
    buildingWidth,
    factors,
    floorCount,
    floorHeight,
    neighborDistance,
    partitionRate,
    requiredSpan,
    spanDirection,
    floorLoadDistribution,
    interiorBearingLinesOverride,
    sreOverride,
    uncertainty,
  ]);

  const updateFactor = (key, value) => setFactors((current) => ({ ...current, [key]: value }));
  const resetCriteria = () => {
    setBuildingType('single_family');
    setNeighborDistance('gt_10');
    setAcousticLevel('normal');
    setUncertainty(2);
    setRequiredSpan(0);
    setSpanDirection('width');
    setFloorLoadDistribution('one_way');
    setInteriorBearingLinesOverride('');
    setFloorCount(2);
    setBuildingLength(10);
    setBuildingWidth(10);
    setPartitionRate('0.4');
    setFloorHeight(2.9);
    setSreOverride('');
    setFactors(DEFAULT_FACTORS);
    setAdvancedOpen(false);
    if (typeof onReset === 'function') onReset();
  };
  const factorOptions = (key) => (factorsData[key] ?? []).map((item) => ({
    value: optionValue(item),
    label: optionLabel(item, lang),
  }));
  const dbOptions = (ids, labels) => ids.map((id) => ({ value: id, label: tr(labels?.[id], lang) || id }));

  return (
    <aside className="building-criteria">
      <h2>Critères du bâtiment</h2>
      <button type="button" className="building-reset-button" onClick={resetCriteria}>
        Réinitialiser filtres
      </button>
      <div className="building-fields">
        <SelectField
          label="Type de bâtiment"
          value={buildingType}
          onChange={setBuildingType}
          options={dbOptions(fireRequirements.dropdowns?.building_type ?? [], fireRequirements.i18n?.building_type)}
        />
        <label className="building-field">
          <span>Nombre d’étages</span>
          <input type="number" min="1" step="1" value={floorCount} onChange={(event) => setFloorCount(event.target.value)} />
        </label>
        <div className="building-dimension-fields">
          <label className="building-field">
            <span>Longueur</span>
            <span className="building-input-unit"><input type="number" min="0" step="0.1" value={buildingLength} onChange={(event) => setBuildingLength(event.target.value)} /><b>m</b></span>
          </label>
          <label className="building-field">
            <span>Largeur</span>
            <span className="building-input-unit"><input type="number" min="0" step="0.1" value={buildingWidth} onChange={(event) => setBuildingWidth(event.target.value)} /><b>m</b></span>
          </label>
        </div>
        <SelectField
          label={<span className="building-label-with-help">Taux de cloison <PartitionRatioHelp lang={lang} /></span>}
          value={partitionRate}
          onChange={setPartitionRate}
          options={['0.25', '0.4', '0.5'].map((value) => ({ value, label: `${value} m/m² SRE` }))}
        />
        <SelectField label="Part vitrée" value={factors.windows_ratio} onChange={(value) => updateFactor('windows_ratio', value)} options={factorOptions('windows_ratio')} />
        <SelectField label="Station climatique" value={factors.station} onChange={(value) => updateFactor('station', value)} options={factorOptions('station')} />
        <SelectField label="Type de ventilation" value={factors.window_ventilation} onChange={(value) => updateFactor('window_ventilation', value)} options={factorOptions('window_ventilation')} />
        <SelectField
          label="Exigences acoustiques"
          value={acousticLevel}
          onChange={setAcousticLevel}
          options={dbOptions(acousticRequirements.dropdowns?.requirement_level ?? [], acousticRequirements.i18n?.requirement_level)}
        />
        <label className="building-field">
          <span>Portée max. du bâtiment</span>
          <span className="building-input-unit"><input type="number" min="0" step="0.1" value={requiredSpan} onChange={(event) => setRequiredSpan(event.target.value)} /><b>m</b></span>
        </label>
      </div>

      <button type="button" className="building-text-button" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}>
        Options avancées {advancedOpen ? '⌃' : '⌄'}
      </button>

      {advancedOpen && (
        <div className="building-fields building-advanced-options">
          <SelectField
            label="Distance façade voisine"
            value={neighborDistance}
            onChange={setNeighborDistance}
            options={dbOptions(fireRequirements.dropdowns?.['neighbor_façade_distance'] ?? [], fireRequirements.i18n?.neighbor_distance)}
          />
          <label className="building-field">
            <span>Incertitude acoustique</span>
            <span className="building-input-unit"><input type="number" min="0" step="0.5" value={uncertainty} onChange={(event) => setUncertainty(event.target.value)} /><b>dB</b></span>
          </label>
          <SelectField
            label="Direction de portée"
            value={spanDirection}
            onChange={setSpanDirection}
            options={[
              { value: 'width', label: 'Largeur' },
              { value: 'length', label: 'Longueur' },
            ]}
          />
          <SelectField
            label="Répartition du plancher"
            value={floorLoadDistribution}
            onChange={setFloorLoadDistribution}
            options={[
              { value: 'one_way', label: 'Unidirectionnelle' },
              { value: 'two_way', label: 'Bidirectionnelle' },
            ]}
          />
          <label className="building-field">
            <span>Lignes intérieures porteuses</span>
            <input
              type="number"
              min="0"
              step="1"
              value={interiorBearingLinesOverride === '' ? automaticInteriorBearingLines : interiorBearingLinesOverride}
              onChange={(event) => setInteriorBearingLinesOverride(event.target.value)}
            />
            <small>
              {interiorBearingLinesOverride === ''
                ? `Calcul automatique : ${automaticInteriorBearingLines}`
                : `Valeur modifiée (automatique : ${automaticInteriorBearingLines})`}
            </small>
            {interiorBearingLinesOverride !== '' ? (
              <button type="button" className="building-inline-reset" onClick={() => setInteriorBearingLinesOverride('')}>
                Reprendre le calcul automatique
              </button>
            ) : null}
          </label>
          <label className="building-field">
            <span>Hauteur d’étage</span>
            <span className="building-input-unit"><input type="number" min="0" step="0.1" value={floorHeight} onChange={(event) => setFloorHeight(event.target.value)} /><b>m</b></span>
          </label>
          <label className="building-field">
            <span>Hauteur</span>
            <input type="text" value={`${totalHeight.toFixed(2)} m — ${buildingHeightLabel}`} readOnly />
          </label>
          <label className="building-field">
            <span>SRE</span>
            <span className="building-input-unit">
              <input
                type="number"
                min="0"
                step="0.1"
                value={sreOverride || Number(automaticSre.toFixed(2))}
                onChange={(event) => setSreOverride(event.target.value)}
                onBlur={(event) => {
                  if (!event.target.value) setSreOverride('');
                }}
              />
              <b>m²</b>
            </span>
          </label>
          <label className="building-field">
            <span>Facteur de forme (Ath/SRE)</span>
            <input type="text" value={envelopeFactor.toFixed(2)} readOnly />
          </label>
          <SelectField label="Capacité thermique" value={factors.heat_storage_capacity} onChange={(value) => updateFactor('heat_storage_capacity', value)} options={factorOptions('heat_storage_capacity')} />
          <SelectField label="Valeur U fenêtre" value={factors.windows_u_value} onChange={(value) => updateFactor('windows_u_value', value)} options={factorOptions('windows_u_value')} />
          <SelectField label="Valeur g" value={factors.windows_g_value} onChange={(value) => updateFactor('windows_g_value', value)} options={factorOptions('windows_g_value')} />
          <SelectField label="Valeur U mur" value={factors.wall_u_value} onChange={(value) => updateFactor('wall_u_value', value)} options={factorOptions('wall_u_value')} />
        </div>
      )}
    </aside>
  );
}

export default BuildingCriteria;
