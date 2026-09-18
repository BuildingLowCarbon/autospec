import React from 'react';

export const ROOF_TYPES = [
  { id: 'flat', label: 'Toit plat', category: 'flat_roof_shed_roof' },
  { id: 'pitched', label: 'Toit en pente', category: 'steep_roof' },
];

export const BUILDING_PARTS = [
  { id: 'roof', label: 'Toit', categories: ROOF_TYPES.map((type) => type.category) },
  { id: 'floors', label: 'Plancher', categories: ['floor_assembly'] },
  { id: 'partitions', label: 'Cloisons', categories: ['partition_wall'] },
  { id: 'interior_walls', label: 'Parois intérieures', categories: ['inner_wall'] },
  { id: 'outer_walls', label: 'Mur extérieur hors terrain', categories: ['outer_wall'], subcategories: ['above_ground'] },
  { id: 'underground_walls', label: 'Mur extérieur sous-terrain', categories: ['outer_wall'], subcategories: ['below_ground'] },
  { id: 'foundation', label: 'Radier', categories: ['foundation'] },
  { id: 'balcony', label: 'Balcon', categories: ['balcony'] },
  { id: 'windows', label: 'Fenêtres', categories: [] },
];

const DEFAULT_STROKE = '#8b8785';
const SELECTED_STROKE = '#e23d3d';

export const getBuildingPart = (partId) =>
  BUILDING_PARTS.find((part) => part.id === partId) ?? BUILDING_PARTS[0];

export const getRoofCategory = (roofType) =>
  ROOF_TYPES.find((type) => type.id === roofType)?.category ?? ROOF_TYPES[0].category;

function BuildingDiagram({
  selectedPart = 'roof',
  onSelectPart,
  roofType = 'pitched',
  onRoofTypeChange,
}) {
  const activePart = getBuildingPart(selectedPart);
  const strokeFor = (partId) => selectedPart === partId ? SELECTED_STROKE : DEFAULT_STROKE;
  const selectPart = (partId) => {
    if (typeof onSelectPart === 'function') onSelectPart(partId);
  };
  const interactiveProps = (partId, label) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-pressed': selectedPart === partId,
    onClick: () => selectPart(partId),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectPart(partId);
      }
    },
    style: { cursor: 'pointer' },
  });

  return (
    <section className="building-diagram-card" aria-label="Sélection d'une partie du bâtiment">
      <div className="building-part-buttons">
        {BUILDING_PARTS.map((part) => {
          const active = selectedPart === part.id;
          return (
            <button
              key={part.id}
              type="button"
              onClick={() => selectPart(part.id)}
              aria-pressed={active}
              style={{
                borderColor: active ? SELECTED_STROKE : '#bbb',
                background: active ? SELECTED_STROKE : '#fff',
                color: active ? '#fff' : '#222',
              }}
            >
              {part.label}
            </button>
          );
        })}
      </div>

      <div className="building-roof-type" aria-label="Forme de la toiture">
        {ROOF_TYPES.map((type) => (
          <label key={type.id}>
            <input
              type="radio"
              name="building-roof-type"
              value={type.id}
              checked={roofType === type.id}
              onChange={() => {
                if (typeof onRoofTypeChange === 'function') onRoofTypeChange(type.id);
              }}
            />
            {type.label}
          </label>
        ))}
      </div>

      <div className="building-diagram-scroll">
        <svg
          viewBox="0 0 367 364"
          role="img"
          aria-label={`Schéma du bâtiment, ${activePart.label} sélectionné`}
          className="building-diagram-svg"
          fill="none"
        >
          <rect width="367" height="364" fill="#fff" />

          <g {...interactiveProps('roof', 'Sélectionner le toit')} stroke={strokeFor('roof')} strokeWidth="4">
            {roofType === 'pitched' ? (
              <>
                <path d="M41 89L81.5 59.5" />
                <path d="M241 33V27H194.5L159.5 2.5L105 42.5" />
                <path d="M241 52V60L279 88" />
              </>
            ) : (
              <>
              <path d="M69 78L252 78" />
              <path d="M4 303H65M256 247H295M362 247H323" />
              </>
            )}
          </g>

          <g {...interactiveProps('outer_walls', 'Sélectionner les murs extérieurs')} stroke={strokeFor('outer_walls')} strokeWidth="4">
            <path d="M67 76V89M67 120V138M67 174V200M67 232V301" />
            <path d="M254 76V89M254 120V144M254 174V191M254 191V249" />
          </g>

          <g {...interactiveProps('underground_walls', 'Sélectionner les murs extérieurs sous-terrain')} stroke={strokeFor('underground_walls')} strokeWidth="4">
            <path d="M2 359V301M364 359V303M364 303V288M364 255V230" />
          </g>

          <g {...interactiveProps('interior_walls', 'Sélectionner les parois intérieures')} stroke={strokeFor('interior_walls')} strokeWidth="4">
            <path d="M142 301V246V193M142 193V138" />
          </g>

          <g {...interactiveProps('partitions', 'Sélectionner les cloisons')} stroke={strokeFor('partitions')} strokeWidth="3">
            <path d="M105 190V140M210 245V195" />
          </g>

          <g {...interactiveProps('floors', 'Sélectionner les planchers')} stroke={strokeFor('floors')} strokeWidth="4">
            <path d="M69 136H252M69 191H252M69 247H252M69 303H362" />
          </g>

          <g {...interactiveProps('foundation', 'Sélectionner le radier')} stroke={strokeFor('foundation')} strokeWidth="4">
            <path d="M0 361H366" />
          </g>

          <g {...interactiveProps('balcony', 'Sélectionner les balcons')} stroke={strokeFor('balcony')} strokeWidth="4">
            <path d="M30 238H65M256 191H289" />

            <path d="M289 189V167" strokeWidth="1" />
          </g>

          <g {...interactiveProps('windows', 'Sélectionner les fenêtres')} stroke={strokeFor('windows')} strokeWidth="1">
            <path d="M65 89V120M65 200V232M256 89V120M256 143V174M366 255V288" />
            <path d="M295 244H323" />
            {roofType === 'pitched' && <path d="M80 57L104 40M243 33V52" />}
          </g>
        </svg>
      </div>
    </section>
  );
}

export default BuildingDiagram;
