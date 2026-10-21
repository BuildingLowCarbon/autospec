import React from 'react';
import ComponentPreviewViews from './ComponentPreviewViews';
import { getAcousticInsulation } from '../utils/acoustic';
import { getWallLinearResistance } from './ComponentCard';

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const range = (items, accessor, digits = 1) => {
  const values = items.map(accessor).map(finite).filter((value) => value !== null);
  if (!values.length) return 'N/A';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const format = (value) => value.toLocaleString('fr-CH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return min === max ? format(min) : `${format(min)}–${format(max)}`;
};

const floorSpan = (item, rating) => {
  const fire = item?.fire_resistance || {};
  const rows = fire.wood_capacity_table?.type === 'floor_span' ? fire.wood_capacity_table.rows : null;
  if (Array.isArray(rows) && rows.length) {
    const row = rows.find((entry) => /gouvernante/i.test(String(entry?.label || ''))) || rows[0];
    const cell = row?.[rating === 'R0' ? 'normal_temperature' : rating];
    const value = finite(cell && typeof cell === 'object' ? cell.value : cell);
    if (value !== null) return value;
  }
  if (rating === 'R0') return finite(fire.wood_beam_span?.ambient?.L_ambient_governing_m ?? item?.spanMax_m);
  const minutes = Number(rating.replace('R', ''));
  return finite(fire.wood_beam_span?.fire?.find((entry) => Number(entry?.fireMinutes) === minutes)?.Max_span);
};

function RangeRow({ label, value, unit }) {
  return <div className="component-group-value"><span>{label} :</span><strong>{value}{value !== 'N/A' ? ` ${unit}` : ''}</strong></div>;
}

export default function ComponentGroupCard({ group, selected, onToggle, ignored = false, onIgnore, onDetails, t = {} }) {
  const variants = group.__groupMembers || [];
  const representative = group.__representative || variants[0] || group;
  const layers = representative?.structure?.layers || [];
  const isFloor = representative?.categoryId === 'floor_assembly';
  const isWall = ['outer_wall', 'inner_wall'].includes(representative?.categoryId);
  const ratings = ['R0', 'R30', 'R60'];
  return (
    <article className={`component-group-card${ignored ? ' is-ignored' : ''}`}>
      <header>
        <div><h3>{group.__groupTitle || group.__groupFallbackName}</h3><p>{variants.length} variante{variants.length > 1 ? 's' : ''}</p></div>
        <div className="component-group-actions">
          <label><input type="checkbox" checked={selected} onChange={onToggle} /> {t.selected_label ?? 'Sélectionner le groupe'}</label>
          {onIgnore ? <label><input type="checkbox" checked={ignored} onChange={(event) => onIgnore(event.target.checked)} /> Ignorer le groupe</label> : null}
          <button type="button" onClick={onDetails}>{t.details ?? 'Détails'}</button>
        </div>
      </header>
      <div className="component-group-body">
        <div className="component-group-preview">
          <ComponentPreviewViews layers={layers} />
        </div>
        <div className="component-group-values">
          <RangeRow label={t.thickness ?? 'Épaisseur'} value={range(variants, (item) => item.thickness_mm, 0)} unit="mm" />
          <RangeRow label={t.weight ?? 'Masse'} value={range(variants, (item) => item.weight_kg_m2, 0)} unit="kg/m²" />
          <RangeRow label={t.uValue ?? 'Valeur U'} value={range(variants, (item) => item.uValue_W_m2K, 3)} unit="W/m²K" />
          <RangeRow label={t.gwp ?? 'GWP'} value={range(variants, (item) => item.gwp_kgco2e_m2, 1)} unit="kg CO₂-eq/m²" />
          <RangeRow label="Rw" value={range(variants, (item) => getAcousticInsulation(item).rwCorrected, 0)} unit="dB" />
          {isFloor ? <RangeRow label="Ln,w" value={range(variants, (item) => getAcousticInsulation(item).lnwCorrected, 0)} unit="dB" /> : null}
          {isFloor ? ratings.map((rating) => <RangeRow key={rating} label={`Portée max. ${rating}`} value={range(variants, (item) => floorSpan(item, rating), 2)} unit="m" />) : null}
          {isWall ? ratings.map((rating) => <RangeRow key={rating} label={`Résistance ${rating}`} value={range(variants, (item) => getWallLinearResistance(item, rating), 1)} unit="kN/m" />) : null}
        </div>
      </div>
    </article>
  );
}
