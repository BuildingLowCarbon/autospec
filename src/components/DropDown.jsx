import React from 'react';

function DropDown({ title, options, selected, setSelected }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        border: '1px solid #ccc',
        borderRadius: '999px',
        backgroundColor: selected ? '#444' : '#eee',
        color: selected ? 'white' : 'black',
        minWidth: '220px',
        marginBottom: '6px',
        marginTop: '6px',
        position: 'relative',
        cursor: 'pointer'
      }}
    >
      {/* Texte affiché dans le champ */}
      <span>
        {selected
          ? `${title}: ${options.find(opt => opt.value === selected)?.label}`
          : title}
      </span>

      {/* Croix pour effacer la sélection */}
      {selected && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setSelected('');
          }}
          style={{
            marginLeft: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: 2
          }}
        >
          ✕
        </div>
      )}

      {/* Select transparent pour déclencher le menu déroulant natif */}
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: selected ? 'calc(100% - 36px)' : '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          zIndex: 1,
          color: 'black' // ✅ empêche le texte blanc sur blanc
        }}
      >
        {/* Affiche un placeholder si rien n’est sélectionné */}
        {selected === '' && (
          <option value="" disabled hidden>{title}</option>
        )}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default DropDown;
