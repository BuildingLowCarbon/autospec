import React, { useEffect, useMemo, useState } from 'react';
import factorsData from './ENteb/data/factors.json';
import thermalData from './ENteb/data/data.json';
import fireRequirements from '../data/fire_requirements.json';
import acousticRequirements from '../data/acoustic_requirements.json';
import sia261Data from '../data/sia261.json';
import partitionRatioImageDe from '../assets/illustrations/parameters/partition-ratio-Minergie_DE.png';
import partitionRatioImageFr from '../assets/illustrations/parameters/partition-ratio-Minergie_FR.png';
import partitionRatioImageEn from '../assets/illustrations/parameters/partition-ratio-Minergie_EN.png';
import partitionRatioImageIt from '../assets/illustrations/parameters/partition-ratio-Minergie_IT.png';

const FIRE_R_VALUES = ['R0', 'R30', 'R60'];
const FIRE_EI_VALUES = ['EI0', 'EI30', 'EI60'];

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

const FACTOR_ORDER = [
  'building_type',
  'station',
  'Regelungsfaktor',
  'heat_storage_capacity',
  'wall_u_value',
  'windows_u_value',
  'windows_g_value',
  'windows_ratio',
  'window_ventilation',
];

const formatters = {
  building_type: (value) => String(parseInt(value, 10)),
  station: (value) => String(parseInt(value, 10)).padStart(2, '0'),
  Regelungsfaktor: (value) => String(parseInt(value, 10)),
  heat_storage_capacity: (value) => String(parseInt(value, 10)),
  wall_u_value: (value) => Number(value).toFixed(2),
  windows_u_value: (value) => Number(value).toFixed(2),
  windows_g_value: (value) => Number(value).toFixed(2),
  windows_ratio: (value) => Number(value).toFixed(2),
  window_ventilation: (value) => Number(value).toFixed(3),
};

const tr = (value, lang) => value?.[lang] ?? value?.fr ?? value?.en ?? '';
const optionLabel = (item, lang) => item?.[`name_${lang}`] ?? item?.name_fr ?? String(item?.id ?? item?.value ?? '');
const optionValue = (item) => String(item?.id ?? item?.value ?? '');
const thermalBuildingType = (buildingType) => (buildingType === 'multi_family' ? '1' : '2');

const buildVariant = (variables) =>
  FACTOR_ORDER.map((key) => formatters[key](variables[key])).join('-');

const getThermalValue = (variables, envelopeFactor, key) => {
  const row = thermalData?.[buildVariant(variables)];
  const building = factorsData.building_type?.find((item) => Number(item.id) === Number(variables.building_type));
  const station = factorsData.station?.find((item) => Number(item.id) === Number(variables.station));
  if (!row || !building || !station) return null;
  if (key === 'qh') {
    return (Number(row.c) + Number(envelopeFactor) * Number(row.m)) * (1 + Number(building.surcharge ?? 0) / 100);
  }
  const correction = 1 + (9.4 - Number(station.t_mean)) * 0.06;
  return (Number(building.Qli0) + Number(building.dQli) * Number(envelopeFactor)) * correction;
};

const getRecommendedUValue = (variables, envelopeFactor) => {
  const values = (factorsData.wall_u_value ?? [])
    .map((item) => Number(item.value))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  for (const value of values) {
    const next = { ...variables, wall_u_value: value };
    const qh = getThermalValue(next, envelopeFactor, 'qh');
    const qhli = getThermalValue(next, envelopeFactor, 'qhli');
    if (qh !== null && qhli !== null && qh <= qhli) return value;
  }
  return values.at(-1) ?? null;
};

const pickFireValue = (requirements, categoryId, key, scale) => {
  const indexes = requirements
    .filter((requirement) => requirement.applies_to?.some((target) => target.categoryId === categoryId))
    .map((requirement) => scale.indexOf(requirement.filter?.[key]))
    .filter((index) => index >= 0);
  return indexes.length ? scale[Math.min(...indexes)] : scale[0];
};

const pickAcousticValue = (requirements, categoryId, key, mode) => {
  const values = requirements
    .filter((requirement) => requirement.applies_to?.some((target) => target.categoryId === categoryId))
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

function BuildingCriteria({ lang = 'fr', selectedCategories = [], onCriteriaChange }) {
  const [buildingType, setBuildingType] = useState('single_family');
  const [neighborDistance, setNeighborDistance] = useState('gt_10');
  const [acousticLevel, setAcousticLevel] = useState('normal');
  const [uncertainty, setUncertainty] = useState(2);
  const [requiredSpan, setRequiredSpan] = useState(0);
  const [floorCount, setFloorCount] = useState(2);
  const [buildingLength, setBuildingLength] = useState(10);
  const [buildingWidth, setBuildingWidth] = useState(10);
  const [partitionRate, setPartitionRate] = useState('0.4');
  const [floorHeight, setFloorHeight] = useState(2.5);
  const [sreOverride, setSreOverride] = useState('');
  const [factors, setFactors] = useState(DEFAULT_FACTORS);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const normalizedFloorCount = Math.max(1, Math.round(Number(floorCount) || 1));
  const normalizedLength = Math.max(0, Number(buildingLength) || 0);
  const normalizedWidth = Math.max(0, Number(buildingWidth) || 0);
  const normalizedFloorHeight = Math.max(0, Number(floorHeight) || 2.5);
  const footprint = normalizedLength * normalizedWidth;
  const perimeter = 2 * normalizedLength + 2 * normalizedWidth;
  const totalHeight = normalizedFloorCount * normalizedFloorHeight;
  const automaticSre = normalizedFloorCount * footprint;
  const resolvedSre = Math.max(0, Number(sreOverride) || automaticSre);
  const thermalEnvelopeArea = 2 * footprint + perimeter * totalHeight;
  const envelopeFactor = resolvedSre > 0 ? thermalEnvelopeArea / resolvedSre : 0;
  const buildingHeight = totalHeight < 11 ? 'lt_11' : totalHeight <= 30 ? 'btw_11_30' : 'gt_30';
  const buildingHeightLabel = tr(fireRequirements.i18n?.building_height?.[buildingHeight], lang) || buildingHeight;

  const variables = useMemo(() => ({
    ...factors,
    building_type: thermalBuildingType(buildingType),
  }), [buildingType, factors]);

  const recommendedUValue = useMemo(
    () => getRecommendedUValue(variables, Number(envelopeFactor)),
    [envelopeFactor, variables],
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
      requiredSpan: Math.max(0, Number(requiredSpan) || 0),
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
    occupancy,
    partitionRate,
    recommendedUValue,
    requiredSpan,
    resolvedSre,
    selectedCategories,
    thermalEnvelopeArea,
    totalHeight,
    uncertainty,
  ]);

  useEffect(() => {
    if (typeof onCriteriaChange === 'function') onCriteriaChange(resolved);
  }, [onCriteriaChange, resolved]);

  const updateFactor = (key, value) => setFactors((current) => ({ ...current, [key]: value }));
  const factorOptions = (key) => (factorsData[key] ?? []).map((item) => ({
    value: optionValue(item),
    label: optionLabel(item, lang),
  }));
  const dbOptions = (ids, labels) => ids.map((id) => ({ value: id, label: tr(labels?.[id], lang) || id }));

  return (
    <aside className="building-criteria">
      <h2>Critères du bâtiment</h2>
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
          <span>Portée max.</span>
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
