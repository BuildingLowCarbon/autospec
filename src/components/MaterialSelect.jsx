import React, { useMemo, useState } from 'react';
import './MaterialSelect.css';

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const materialOptionLabel = (item, lang = 'fr') => {
  const name = item.name || item.translations?.[lang]?.name || item.translations?.fr?.name || item.label || item.workingtitle || item.id;
  const density = item.density_kg_m3 ?? item.declaredProperties?.density_kg_m3 ?? item.calculatedProperties?.density_kg_m3;
  return `${name} · ρ ${density ?? 'N/A'} kg/m³ · KBOB ${item.kbobId || 'N/A'}`;
};

export default function MaterialSelect({ catalog = [], value = '', onChange, lang = 'fr', emptyLabel = '—', disabled = false, label = 'Matériau / produit' }) {
  const [query, setQuery] = useState('');
  const options = useMemo(() => catalog.map((item) => ({ ...item, optionLabel: materialOptionLabel(item, lang) })), [catalog, lang]);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const visible = options.filter((item) => String(item.id) === String(value) || words.every((word) => normalize(`${item.optionLabel} ${item.id}`).includes(word)));
  return <div className="material-search-select">
    <input type="search" aria-label={`Rechercher ${label.toLowerCase()}`} placeholder="Rechercher nom, densité ou KBOB…" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} />
    <select aria-label={label} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">{emptyLabel}</option>
      {value && !options.some((item) => String(item.id) === String(value)) ? <option value={value}>Référence actuelle · {value}</option> : null}
      {visible.map((item) => <option key={item.id} value={item.id}>{item.optionLabel}</option>)}
    </select>
  </div>;
}
