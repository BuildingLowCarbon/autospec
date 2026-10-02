import React, { useEffect, useMemo, useState } from 'react';
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
 * - unit: string (optional)
 * - focusMax: number (optional) compressed point for high values
 * - tailRatio: number (optional) track ratio reserved for values > focusMax
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
  unit = '',
  focusMax,
  tailRatio = 0.2,
  formatValue = (v) => `${v}`,
  bars = [],
}) {
  const lowerValue = values[0];
  const upperValue = values[1];

  const clamp = (value, lower, upper) => Math.min(Math.max(value, lower), upper);

  const getStepPrecision = (value) => {
    if (!Number.isFinite(value)) return 0;
    const asString = String(value);
    if (asString.includes('e-')) {
      const exp = Number(asString.split('e-')[1]);
      return Number.isNaN(exp) ? 0 : exp;
    }
    const parts = asString.split('.');
    return parts[1] ? parts[1].length : 0;
  };

  const precision = useMemo(() => getStepPrecision(step), [step]);

  const roundToStep = (value) => {
    if (!step || !Number.isFinite(step)) return value;
    const rounded = min + Math.round((value - min) / step) * step;
    return Number(rounded.toFixed(precision));
  };

  const formatInputValue = (value) => {
    if (!Number.isFinite(value)) return '';
    return precision > 0 ? Number(value).toFixed(precision) : String(Math.round(value));
  };

  const isCompressed =
    Number.isFinite(focusMax) &&
    focusMax > min &&
    focusMax < max &&
    Number.isFinite(tailRatio) &&
    tailRatio > 0 &&
    tailRatio < 1;

  const maxBar = useMemo(() => {
    const barSet = isCompressed && bars.length > 1 ? bars.slice(0, -1) : bars;
    return barSet.reduce((m, v) => Math.max(m, v), 0) || 1;
  }, [bars, isCompressed]);

  const effectiveFocusMax = isCompressed ? focusMax : max;
  const displaySpan = max - min || 1;
  const mainDisplaySpan = isCompressed ? displaySpan * (1 - tailRatio) : displaySpan;
  const tailDisplaySpan = displaySpan - mainDisplaySpan;
  const mainValueSpan = effectiveFocusMax - min || 1;
  const tailValueSpan = max - effectiveFocusMax || 1;

  const toDisplayValue = (value) => {
    const clamped = clamp(value, min, max);
    if (!isCompressed || clamped <= effectiveFocusMax) {
      const ratio = (clamped - min) / mainValueSpan;
      return min + ratio * mainDisplaySpan;
    }
    const ratio = (clamped - effectiveFocusMax) / tailValueSpan;
    return min + mainDisplaySpan + ratio * tailDisplaySpan;
  };

  const fromDisplayValue = (displayValue) => {
    const clampedDisplay = clamp(displayValue, min, max);
    const splitPoint = min + mainDisplaySpan;
    if (!isCompressed || clampedDisplay <= splitPoint) {
      const ratio = (clampedDisplay - min) / (mainDisplaySpan || 1);
      return min + ratio * mainValueSpan;
    }
    const ratio = (clampedDisplay - splitPoint) / (tailDisplaySpan || 1);
    return effectiveFocusMax + ratio * tailValueSpan;
  };

  const sliderStep = isCompressed
    ? Math.max((step / (mainValueSpan || 1)) * mainDisplaySpan, Number.EPSILON)
    : step;

  const sliderValues = [toDisplayValue(lowerValue), toDisplayValue(upperValue)];

  const [inputValues, setInputValues] = useState([
    formatInputValue(lowerValue),
    formatInputValue(upperValue),
  ]);

  useEffect(() => {
    const nextLower = precision > 0 ? Number(lowerValue).toFixed(precision) : String(Math.round(lowerValue));
    const nextUpper = precision > 0 ? Number(upperValue).toFixed(precision) : String(Math.round(upperValue));
    setInputValues([nextLower, nextUpper]);
  }, [lowerValue, upperValue, precision]);

  const commitInput = (index) => {
    const rawValue = inputValues[index];
    const parsed = Number(String(rawValue).replace(',', '.'));
    if (Number.isNaN(parsed)) {
      setInputValues([formatInputValue(lowerValue), formatInputValue(upperValue)]);
      return;
    }

    const isLower = index === 0;
    const lowerBound = isLower ? min : lowerValue;
    const upperBound = isLower ? upperValue : max;
    const bounded = clamp(roundToStep(parsed), lowerBound, upperBound);
    const nextValues = isLower ? [bounded, upperValue] : [lowerValue, bounded];
    onChange(nextValues);
  };

  const handleSliderChange = (nextDisplayValues) => {
    const mappedLower = roundToStep(fromDisplayValue(nextDisplayValues[0]));
    const mappedUpper = roundToStep(fromDisplayValue(nextDisplayValues[1]));
    const boundedLower = clamp(mappedLower, min, max);
    const boundedUpper = clamp(mappedUpper, min, max);
    onChange(boundedLower <= boundedUpper ? [boundedLower, boundedUpper] : [boundedUpper, boundedLower]);
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '8px', borderRadius: '6px', marginBottom: '12px', backgroundColor: '#fff' }}>
      <label style={{ display: 'block', fontWeight: 700 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <input
          type="number"
          step={step}
          min={min}
          max={upperValue}
          value={inputValues[0]}
          onChange={(e) => setInputValues([e.target.value, inputValues[1]])}
          onBlur={() => commitInput(0)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInput(0);
            if (e.key === 'Escape') setInputValues([formatInputValue(lowerValue), inputValues[1]]);
          }}
          style={{ width: 60, fontSize: 13, padding: '2px 6px', border: '1px solid #000000', borderRadius: '6px' }}
        />
        <span style={{ fontSize: 13 }}>-</span>
        <input
          type="number"
          step={step}
          min={lowerValue}
          max={max}
          value={inputValues[1]}
          onChange={(e) => setInputValues([inputValues[0], e.target.value])}
          onBlur={() => commitInput(1)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInput(1);
            if (e.key === 'Escape') setInputValues([inputValues[0], formatInputValue(upperValue)]);
          }}
          style={{ width: 60, fontSize: 13, padding: '2px 6px', border: '1px solid #000000', borderRadius: '6px'}}
        />
        {unit && <span style={{ fontSize: 13 }}>{unit}</span>}
      </div>
      {/*
      <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
        {formatValue(lowerValue)} - {formatValue(upperValue)}
      </div>
      */}
      {bars.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length}, 1fr)`, alignItems: 'end', gap: 4, marginBottom: 8, padding: '0 4px' }}>
          {bars.map((count, idx) => {
            const isTailBar = isCompressed && bars.length > 1 && idx === bars.length - 1;
            const normalizedHeight = Math.round((count / maxBar) * 60);
            const height = isTailBar ? Math.min(normalizedHeight, 60) : normalizedHeight;
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
        step={sliderStep}
        min={min}
        max={max}
        values={sliderValues}
        onChange={handleSliderChange}
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
