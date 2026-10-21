import React from 'react';
import { ViewSVG, DEFAULT_PX_PER_MM_X } from './Graphic';
import './ComponentPreviewViews.css';

export default function ComponentPreviewViews({ layers = [] }) {
  if (!layers.length) return <span>Aucun aperçu</span>;
  return (
    <div className="component-preview-views">
      {[
        ['transverse', 'Coupe transverse'],
        ['longitudinal', 'Coupe longitudinale'],
      ].map(([view, title]) => (
        <div key={view} role="img" aria-label={title}>
          <ViewSVG
            title={title}
            layers={layers}
            view={view}
            pxPerMmY={0.15}
            pxPerMmX={DEFAULT_PX_PER_MM_X * 0.15}
            showDimensions={false}
          />
        </div>
      ))}
    </div>
  );
}
