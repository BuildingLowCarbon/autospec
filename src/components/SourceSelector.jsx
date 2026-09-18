import React, { useMemo, useState } from 'react';

function SourceSelector({ label, options, selected, onChange, allLabel }) {
  const [open, setOpen] = useState(false);

  const selectedLabels = useMemo(() => {
    if (!selected.length) return allLabel;
    const labels = options.filter((opt) => selected.includes(opt.value)).map((opt) => opt.label);
    return labels.length ? labels.join(', ') : allLabel;
  }, [allLabel, options, selected]);

  const toggleValue = (value) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleToggleAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map((opt) => opt.value));
    }
  };

  return (
    <div style={{ marginBottom: '12px', position: 'relative' }}>
      <label style={{ display: 'block', marginBottom: '6px' }}>{label}</label>
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '6px',
            backgroundColor: '#fff',
          }}
        >
          {selectedLabels}
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              zIndex: 10,
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '6px',
              width: '100%',
              marginTop: '4px',
              padding: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <input
                type="checkbox"
                checked={selected.length === options.length}
                onChange={handleToggleAll}
              />
              {allLabel}
            </label>
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'grid', gap: '4px' }}>
              {options.map((opt) => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggleValue(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SourceSelector;
