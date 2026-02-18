import React, { useMemo } from 'react';

const R_OPTIONS = ['R0', 'R30', 'R60'];
const EI_OPTIONS = ['EI0', 'EI30', 'EI60'];

function SliderWithBars({ title, value, options, counts = {}, onChange }) {
  const selectedIndex = options.indexOf(value);

  const maxCount = useMemo(() => {
    return options.reduce((max, opt) => Math.max(max, counts?.[opt] || 0), 0) || 1;
  }, [counts, options]);

  const handleChange = (event) => {
    const idx = Number(event.target.value);
    const next = options[idx] ?? options[0];
    onChange(next);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#444' }}>{value}</div>
      </div>

      <div style={{ position: 'relative', padding: '18px 8px 6px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${options.length}, 1fr)`,
            alignItems: 'flex-end',
            gap: 10,
            padding: '0 4px',
          }}
        >
          {options.map((opt) => {
            const count = counts?.[opt] || 0;
            const height = Math.round((count / maxCount) * 60);
            return (
              <div key={opt} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    height: `${height}px`,
                    width: 10,
                    margin: '0 auto',
                    borderRadius: 999,
                    background: '#f2a516',
                    opacity: count === 0 ? 0.25 : 1,
                    transition: 'height 120ms ease',
                  }}
                />
                <div style={{ fontSize: 11, marginTop: 4, color: '#333' }}>{count}</div>
              </div>
            );
          })}
        </div>

        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={selectedIndex < 0 ? 0 : selectedIndex}
          onChange={handleChange}
          style={{ width: '100%', marginTop: 14 }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${options.length}, 1fr)`,
            textAlign: 'center',
            fontWeight: 600,
            fontSize: 12,
            marginTop: 6,
          }}
        >
          {options.map((opt) => (
            <div key={opt}>{opt}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FireFilter({
  rValue,
  eiValue,
  rCounts,
  eiCounts,
  onChangeR,
  onChangeEI,
}) {
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Protection incendie</div>
      <SliderWithBars
        title="Résistance au feu (R)"
        value={rValue}
        options={R_OPTIONS}
        counts={rCounts}
        onChange={onChangeR}
      />
      <SliderWithBars
        title="Intégrité / isolation (EI)"
        value={eiValue}
        options={EI_OPTIONS}
        counts={eiCounts}
        onChange={onChangeEI}
      />
    </div>
  );
}

export { R_OPTIONS, EI_OPTIONS };
