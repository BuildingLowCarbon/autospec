import React, { useContext, useEffect, useMemo, useState } from 'react';
import factorsData from './data/factors.json';
import dataTable from './data/data.json';
import SelectedFactorsContext from '../../context/SelectedFactorsContext';
import InfoTooltip from '../InfoTooltip';
import InfoTooltip2 from '../InfoTooltip2';

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

const FACTOR_FIELDS = [
  { key: 'building_type', labelKey: 'enteb_building_type', fallback: 'Building type' },
  { key: 'station', labelKey: 'enteb_climate_station', fallback: 'Climate station' },
  { key: 'heat_storage_capacity', labelKey: 'enteb_thermal_capacity', fallback: 'Thermal capacity' },
  { key: 'wall_u_value', labelKey: 'enteb_wall_u_value', fallback: 'Wall U value' },
  { key: 'windows_u_value', labelKey: 'enteb_windows_u_value', fallback: 'Windows U value' },
  { key: 'windows_g_value', labelKey: 'enteb_windows_g_value', fallback: 'Windows g value' },
  { key: 'windows_ratio', labelKey: 'enteb_glass_part', fallback: 'Glass part' },
  { key: 'window_ventilation', labelKey: 'enteb_ventilation_type', fallback: 'Ventilation type' },
];

const SIMPLE_VISIBLE_FIELDS = [
  { key: 'building_type', labelKey: 'enteb_building_type', fallback: 'Type de batiment' },
  { key: 'windows_ratio', labelKey: 'enteb_glass_part', fallback: 'Part vitree' },
  { key: 'station', labelKey: 'enteb_climate_station', fallback: 'Station climatique' },
  { key: 'window_ventilation', labelKey: 'enteb_ventilation_type', fallback: 'Type de ventilation' },
];

const SIMPLE_ADVANCED_FIELDS = [
  { key: 'heat_storage_capacity', labelKey: 'enteb_thermal_capacity', fallback: 'Capacite thermique' },
  { key: 'windows_u_value', labelKey: 'enteb_windows_u_value', fallback: 'Valeur U fenetre' },
  { key: 'windows_g_value', labelKey: 'enteb_windows_g_value', fallback: 'Valeur g' },
  { key: 'wall_u_value', labelKey: 'enteb_wall_u_value', fallback: 'Valeur U mur' },
];

const DEFAULT_SIMPLE_FACTORS = {
  building_type: '1',
  station: '5',
  Regelungsfaktor: '1',
  heat_storage_capacity: '2',
  wall_u_value: '0.17',
  windows_u_value: '1',
  windows_g_value: '0.4',
  windows_ratio: '0.2',
  window_ventilation: '0.838',
};

const toInt = (value) => String(parseInt(value, 10));
const twoDigits = (value) => String(parseInt(value, 10)).padStart(2, '0');
const toFixed2 = (value) => Number(value).toFixed(2);
const toFixed3 = (value) => Number(value).toFixed(3);

const formatters = {
  building_type: toInt,
  station: twoDigits,
  Regelungsfaktor: toInt,
  heat_storage_capacity: toInt,
  wall_u_value: toFixed2,
  windows_u_value: toFixed2,
  windows_g_value: toFixed2,
  windows_ratio: toFixed2,
  window_ventilation: toFixed3,
};

const getBuildingItem = (buildingType) =>
  factorsData.building_type?.find((item) => Number(item.id) === Number(buildingType)) ?? null;

const getStationItem = (station) =>
  factorsData.station?.find((item) => Number(item.id) === Number(station)) ?? null;

const getOptionValue = (item) => String(item.id ?? item.value);

const getOptionLabel = (item, lang) => item[`name_${lang}`] ?? item.name_fr ?? JSON.stringify(item);

const buildVariant = (rawVariables) => {
  const vars = { ...rawVariables };
  if (!vars.Regelungsfaktor) vars.Regelungsfaktor = 1;
  return FACTOR_ORDER.map((key) => formatters[key](vars[key])).join('-');
};

const getQh = (variables, envelopeFactor) => {
  const variant = buildVariant(variables);
  const row = dataTable?.[variant];
  const buildingItem = getBuildingItem(variables.building_type);
  if (!row || !buildingItem) return null;
  const surcharge = Number(buildingItem.surcharge ?? 0);
  return (Number(row.c) + Number(envelopeFactor) * Number(row.m)) * (1 + surcharge / 100);
};

const getQhli = (variables, envelopeFactor) => {
  const buildingItem = getBuildingItem(variables.building_type);
  const stationItem = getStationItem(variables.station);
  if (!buildingItem || !stationItem) return null;

  const qli0 = Number(buildingItem.Qli0);
  const dQli = Number(buildingItem.dQli);
  const tMean = Number(stationItem.t_mean);
  const fcor = 1 + (9.4 - tMean) * 0.06;
  return (qli0 + dQli * Number(envelopeFactor)) * fcor;
};

const selectMaxWallUValue = (variables, envelopeFactor) => {
  const values = (factorsData.wall_u_value ?? [])
    .map((item) => Number(item.value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  if (!values.length) return null;

  for (const value of values) {
    const nextVariables = { ...variables, wall_u_value: value };
    const qh = getQh(nextVariables, envelopeFactor);
    const qhli = getQhli(nextVariables, envelopeFactor);
    if (qh === null || qhli === null) return null;
    if (qh <= qhli) return value;
  }
  return values[values.length - 1];
};

function ENtebTool({ lang, t, onApplyRecommendedUValue }) {
  const { selectedFactors, setSelectedFactors } = useContext(SelectedFactorsContext);
  const [envelopeFactor, setEnvelopeFactor] = useState('3.39');
  const [applyToUFilter, setApplyToUFilter] = useState(false);
  const [simpleFactors, setSimpleFactors] = useState(DEFAULT_SIMPLE_FACTORS);
  const [simpleEnvelopeFactor, setSimpleEnvelopeFactor] = useState('1.2');
  const [showAdvancedSimple, setShowAdvancedSimple] = useState(false);

  const computed = useMemo(() => {
    const allFilled = FACTOR_FIELDS.every((field) => selectedFactors[field.key] !== undefined && selectedFactors[field.key] !== '');
    const envValue = Number.parseFloat(envelopeFactor);
    if (!allFilled || Number.isNaN(envValue)) {
      return { qh: null, qhli: null, uValue: null };
    }

    try {
      const qh = getQh(selectedFactors, envValue);
      const qhli = getQhli(selectedFactors, envValue);
      const uValue = selectMaxWallUValue(selectedFactors, envValue);
      return { qh, qhli, uValue };
    } catch (error) {
      return { qh: null, qhli: null, uValue: null };
    }
  }, [selectedFactors, envelopeFactor]);

  const computedSimple = useMemo(() => {
    const allFilled = FACTOR_FIELDS.every((field) => simpleFactors[field.key] !== undefined && simpleFactors[field.key] !== '');
    const envValue = Number.parseFloat(simpleEnvelopeFactor);
    if (!allFilled || Number.isNaN(envValue)) {
      return { qh: null, qhli: null, uValue: null };
    }

    try {
      const qh = getQh(simpleFactors, envValue);
      const qhli = getQhli(simpleFactors, envValue);
      const uValue = selectMaxWallUValue(simpleFactors, envValue);
      return { qh, qhli, uValue };
    } catch (error) {
      return { qh: null, qhli: null, uValue: null };
    }
  }, [simpleFactors, simpleEnvelopeFactor]);

  const handleEnvelopeFactorChange = (value) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setEnvelopeFactor(value);
    }
  };

  const handleSimpleEnvelopeFactorChange = (value) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setSimpleEnvelopeFactor(value);
    }
  };

  const handleFactorChange = (factorKey, value) => {
    setSelectedFactors({
      ...selectedFactors,
      [factorKey]: value,
    });
  };

  const handleSimpleFactorChange = (factorKey, value) => {
    setSimpleFactors((prev) => ({
      ...prev,
      [factorKey]: value,
    }));
  };

  const renderSimpleSelect = ({ key, labelKey, fallback }) => {
    const entries = factorsData[key] ?? [];
    return (
      <div key={key} style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
        <label style={{ fontWeight: 'bold' }}>{t[labelKey] ?? fallback}</label>
        <select
          style={{ width: '100%' }}
          value={simpleFactors[key] ?? ''}
          onChange={(e) => handleSimpleFactorChange(key, e.target.value)}
        >
          {entries.map((item, index) => (
            <option key={index} value={getOptionValue(item)}>
              {getOptionLabel(item, lang)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  useEffect(() => {
    if (!applyToUFilter || !Number.isFinite(computed.uValue)) return;
    if (typeof onApplyRecommendedUValue === 'function') {
      onApplyRecommendedUValue(computed.uValue);
    }
  }, [applyToUFilter, computed.uValue, onApplyRecommendedUValue]);

  return (
    <>
      
      <div
        style={{
          border: '1px solid #b8b5da',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '12px',
          backgroundColor: '#d5d1ef',
        }}
      >
        <h2>{t.enteb_thermal_assistance ?? 'Thermal assistance'}</h2>
        <div style={{ marginBottom: '12px' }}>
          {FACTOR_FIELDS.map(({ key, labelKey, fallback }) => {
            const entries = factorsData[key] ?? [];
            return (
              <div key={key} style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
                <label style={{ fontWeight: 'bold' }}>{t[labelKey] ?? fallback}</label>
                <select
                  style={{ width: '100%' }}
                  value={selectedFactors[key] ?? ''}
                  onChange={(e) => handleFactorChange(key, e.target.value)}
                >
                  <option value="">-- {t.select} --</option>
                  {entries.map((item, index) => (
                    <option key={index} value={getOptionValue(item)}>
                      {getOptionLabel(item, lang)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
              <label style={{ fontWeight: 'bold' }}>{t.envelope_factors ?? 'Envelope factor'}</label>
              <input
                type="text"
                inputMode="decimal"
                pattern="^\\d*\\.?\\d*$"
                value={envelopeFactor}
                onChange={(e) => handleEnvelopeFactorChange(e.target.value)}
                onBlur={(e) => handleEnvelopeFactorChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.target.blur();
                }}
                style={{ width: '100%' }}
                placeholder="1.22"
              />
            </div>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #ccc',
            padding: '12px',
            borderRadius: '8px',
            marginTop: '20px',
            backgroundColor: '#fff',
            fontSize: '16px',
          }}
        >
          <div>
            {t.qh_estimated ?? 'Estimated Qh'} :
            <span style={{ marginLeft: '8px' }}>
              {computed.qh !== null ? `${computed.qh.toFixed(1)} kWh/m2` : t.not_calculated ?? 'not calculated'}
            </span>
          </div>
          <div>
            Qh,li :
            <span style={{ marginLeft: '8px' }}>
              {computed.qhli !== null ? `${computed.qhli.toFixed(1)} kWh/m2` : t.not_calculated ?? 'not calculated'}
              <InfoTooltip text={t.info_qhli} link="https://ton-lien.com/details" lang={lang} />
            </span>
          </div>
          <div>
            {t.enteb_max_recommended_wall_u ?? 'Max wall U value recommended'} :
            <span style={{ marginLeft: '8px' }}>
              {computed.uValue !== null ? `${computed.uValue.toFixed(3)} W/m2K` : t.not_calculated ?? 'not calculated'}
              <InfoTooltip2 text={t.info_qhli} link="https://ton-lien.com/details" lang={lang} />
            </span>
          </div>
          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={applyToUFilter}
                onChange={(e) => setApplyToUFilter(e.target.checked)}
              />
              <span>{t.enteb_apply_uvalue_filter ?? 'Use maximum wall U value in filters'}</span>
            </label>
          </div>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #9fc4b2',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '12px',
          backgroundColor: '#e7f3ec',
        }}
      >
        <h2>{t.enteb_thermal_assistance ?? 'Thermal assistance'} simplifiee</h2>

        {SIMPLE_VISIBLE_FIELDS.map(renderSimpleSelect)}

        <div style={{ marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'center' }}>
          <label style={{ display: 'block', fontWeight: 700 }}>{t.envelope_factors ?? 'Facteur de forme'}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <input
              type="number"
              step={0.1}
              min={0.1}
              max={5}
              value={simpleEnvelopeFactor}
              onChange={(e) => handleSimpleEnvelopeFactorChange(e.target.value)}
              onBlur={(e) => handleSimpleEnvelopeFactorChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur();
              }}
              style={{ width: 60, fontSize: 13, padding: '2px 6px', border: '1px solid #000000', borderRadius: '6px' }}
            />
            </div>
            </div>


        <div
          style={{
            border: '1px solid #ccc',
            padding: '12px',
            borderRadius: '8px',
            marginTop: '14px',
            backgroundColor: '#fff',
            fontSize: '16px',
          }}
        >
          <div>
            {t.enteb_max_recommended_wall_u ?? 'Valeur U max recommandee'} :
            <span style={{ marginLeft: '8px' }}>
              {computedSimple.uValue !== null ? `${computedSimple.uValue.toFixed(3)} W/m2K` : t.not_calculated ?? 'non calcule'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvancedSimple((prev) => !prev)}
          style={{
            marginTop: '14px',
            border: 'none',
            background: 'transparent',
            padding: 0,
            fontWeight: 700,
            cursor: 'pointer',
            color: '#204d38',
          }}
        >
          Options avancees {showAdvancedSimple ? 'v' : '>'}
        </button>

        {showAdvancedSimple ? (
          <div style={{ marginTop: '12px' }}>
            {SIMPLE_ADVANCED_FIELDS.map(renderSimpleSelect)}

            <div
              style={{
                border: '1px solid #ccc',
                padding: '12px',
                borderRadius: '8px',
                marginTop: '14px',
                backgroundColor: '#fff',
                fontSize: '16px',
              }}
            >
              <div>
                {t.qh_estimated ?? 'Qh estime'} :
                <span style={{ marginLeft: '8px' }}>
                  {computedSimple.qh !== null ? `${computedSimple.qh.toFixed(1)} kWh/m2` : t.not_calculated ?? 'non calcule'}
                </span>
              </div>
              <div>
                Qh,li :
                <span style={{ marginLeft: '8px' }}>
                  {computedSimple.qhli !== null ? `${computedSimple.qhli.toFixed(1)} kWh/m2` : t.not_calculated ?? 'non calcule'}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

export default ENtebTool;
