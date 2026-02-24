import React, { useContext, useMemo, useState } from 'react';
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

function ENtebTool({ lang, t }) {
  const { selectedFactors, setSelectedFactors } = useContext(SelectedFactorsContext);
  const [envelopeFactor, setEnvelopeFactor] = useState('3.39');

  const computed = useMemo(() => {
    const allFilled = Object.keys(factorsData).every((key) => selectedFactors[key] !== undefined && selectedFactors[key] !== '');
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

  return (
    <>
      <h2>{t.building}</h2>
      <div
        style={{
          border: '2px solid #007bff',
          padding: '8px',
          borderRadius: '6px',
          marginBottom: '12px',
          backgroundColor: '#fff',
        }}
      >
        <div
          style={{
            border: '1px solid #ccc',
            padding: '8px',
            borderRadius: '6px',
            marginBottom: '12px',
            backgroundColor: '#fff',
          }}
        >
          {Object.entries(factorsData).map(([factorKey, entries]) => (
            <div key={factorKey} style={{ marginBottom: '12px' }}>
              <label style={{ fontWeight: 'bold' }}>{factorKey}</label>
              <select
                style={{ width: '100%', marginTop: '4px' }}
                value={selectedFactors[factorKey] ?? ''}
                onChange={(e) =>
                  setSelectedFactors({
                    ...selectedFactors,
                    [factorKey]: e.target.value,
                  })
                }
              >
                <option value="">-- {t.select} --</option>
                {entries.map((item, index) => (
                  <option key={index} value={item.id ?? item.value}>
                    {item[`name_${lang}`] ?? item.name_fr ?? JSON.stringify(item)}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontWeight: 'bold' }}>{t.envelope_factors ?? 'envelope factor'}</label>
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
              style={{ width: '100%', marginTop: '4px' }}
              placeholder="ex: 3.39"
            />
          </div>
        </div>

        <div
          style={{
            border: '1px solid #ccc',
            padding: '12px',
            borderRadius: '8px',
            marginTop: '20px',
            backgroundColor: '#fff',
            fontSize: '18px',
          }}
        >
          <div>
            {t.qh_estimated ?? 'Estimated Qh'} :
            <span style={{ marginLeft: '8px' }}>
              {computed.qh !== null ? `${computed.qh.toFixed(1)} kWh/m²` : t.not_calculated ?? 'not calculated'}
            </span>
          </div>
          <div>
            Qh,li :
            <span style={{ marginLeft: '8px' }}>
              {computed.qhli !== null ? `${computed.qhli.toFixed(1)} kWh/m²` : t.not_calculated ?? 'not calculated'}
              <InfoTooltip text={t.info_qhli} link="https://ton-lien.com/details" lang={lang} />
            </span>
          </div>
          <div>
            {t.uvalue_max ?? 'Max U value'} :
            <span style={{ marginLeft: '8px' }}>
              {computed.uValue !== null ? `${computed.uValue.toFixed(3)} W/m²K` : t.not_calculated ?? 'not calculated'}
              <InfoTooltip2 text={t.info_qhli} link="https://ton-lien.com/details" lang={lang} />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export default ENtebTool;
