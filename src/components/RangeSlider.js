import React, { useMemo } from 'react';
import { Range } from 'react-range';

/**
 * Reusable range slider with optional histogram bars.
 *
 * Props:
 * - label: string
 * - values: [number, number]
 * - min, max: numbers
 * - step: number
 * - onChange: (values:number[]) => void
 * - formatValue: (value:number)=>string (optional)
 * - bars: number[] (optional) counts per bucket; shown as vertical bars above the slider
 */
export default function RangeSlider({
  label,
  values,
  min,
  max,
  step = 1,
  onChange,
  formatValue = (v) => `${v}`,
  bars = [],
}) {
  const maxBar = useMemo(() => {
    return bars.reduce((m, v) => Math.max(m, v), 0) || 1;
  }, [bars]);

  return (
    <div style={{ border: '1px solid #ccc', padding: '8px', borderRadius: '6px', marginBottom: '12px', backgroundColor: '#fff' }}>
      <label style={{ display: 'block', fontWeight: 700 }}>{label}</label>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        {formatValue(values[0])} - {formatValue(values[1])}
      </div>

      {bars.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length}, 1fr)`, alignItems: 'end', gap: 4, marginBottom: 8, padding: '0 4px' }}>
          {bars.map((count, idx) => {
            const height = Math.round((count / maxBar) * 60);
            return (
              <div key={idx} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    height: `${height}px`,
                    width: 10,
                    margin: '0 auto',
                    borderRadius: 6,
                    background: '#f2a516',
                    opacity: count === 0 ? 0.2 : 1,
                    transition: 'height 120ms ease',
                  }}
                />
                {/*
                <div style={{ fontSize: 10, color: '#555' }}>{count}</div>
                */}
              </div>
            );
          })}
        </div>
      )}

      <Range
        step={step}
        min={min}
        max={max}
        values={values}
        onChange={onChange}
        renderTrack={({ props, children }) => (
          <div
            {...props}
            style={{
              ...props.style,
              height: '6px',
              background: '#ccc',
              margin: '6px 0 12px 0',
            }}
          >
            {children}
          </div>
        )}
        renderThumb={({ props }) => (
          <div
            {...props}
            style={{
              ...props.style,
              height: '20px',
              width: '20px',
              backgroundColor: '#999',
              borderRadius: '50%',
            }}
          />
        )}
      />
    </div>
  );
}
