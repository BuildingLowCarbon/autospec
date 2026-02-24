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

  const handleEnvelopeFactorChange = (value) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setEnvelopeFactor(value);
    }
  };

  const handleFactorChange = (factorKey, value) => {
    setSelectedFactors({
      ...selectedFactors,
      [factorKey]: value,
    });
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
                    <option key={index} value={item.id ?? item.value}>
                      {item[`name_${lang}`] ?? item.name_fr ?? JSON.stringify(item)}
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
    </>
  );
}

export default ENtebTool;
