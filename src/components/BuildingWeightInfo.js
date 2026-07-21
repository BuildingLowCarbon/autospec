import React, { useMemo } from 'react';
import { getBuildingPart } from './BuildingDiagram';

const GRAVITY_M_S2 = 9.81;

const itemWeight = (item) => {
  if (item?.weight_kg_m2 === null || item?.weight_kg_m2 === undefined || item?.weight_kg_m2 === '') return null;
  const value = Number(item.weight_kg_m2);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const massRange = (items) => {
  const values = items.map(itemWeight).filter((value) => value !== null);
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
};

const scaleRange = (range, factor) => range ? ({ min: range.min * factor, max: range.max * factor }) : null;

const addRanges = (...ranges) => {
  if (ranges.some((range) => !range)) return null;
  return ranges.reduce((total, range) => ({
    min: total.min + range.min,
    max: total.max + range.max,
  }), { min: 0, max: 0 });
};

const formatMass = (value) => {
  if (!Number.isFinite(value)) return 'N/A';
  if (value >= 1000) return `${(value / 1000).toLocaleString('fr-CH', { maximumFractionDigits: 1 })} t`;
  return `${Math.round(value).toLocaleString('fr-CH')} kg`;
};

const formatRange = (range) => {
  if (!range) return 'N/A';
  const tolerance = Math.max(1, range.max) * 0.0001;
  if (Math.abs(range.max - range.min) <= tolerance) return formatMass(range.min);
  return `${formatMass(range.min)} – ${formatMass(range.max)}`;
};

function BuildingWeightInfo({ building, selectedItems = [], candidatesByPart = {} }) {
  const result = useMemo(() => {
    const floorCount = Math.max(1, Math.round(Number(building?.floorCount) || 1));
    const length = Math.max(0, Number(building?.length) || 0);
    const width = Math.max(0, Number(building?.width) || 0);
    const floorHeight = Math.max(0, Number(building?.floorHeight) || 0);
    const sre = Math.max(0, Number(building?.sre) || 0);
    const partitionRate = Math.max(0, Number(building?.partitionRate) || 0);
    const footprint = length * width;
    const perimeter = 2 * length + 2 * width;
    const srePerFloor = sre / floorCount;
    const partitionAreaPerFloor = partitionRate * srePerFloor * floorHeight;
    const totalHeight = Math.max(0, Number(building?.totalHeight) || floorCount * floorHeight);
    const thermalEnvelopeArea = Math.max(
      0,
      Number(building?.thermalEnvelopeArea) || 2 * footprint + perimeter * totalHeight,
    );
    const occupancyMassPerFloor =
      (Math.max(0, Number(building?.occupancyLoadKnM2) || 0) * 1000 / GRAVITY_M_S2) * srePerFloor;

    const candidatesFor = (partId) => {
      const categories = getBuildingPart(partId).categories;
      const selected = selectedItems.filter((item) => categories.includes(item.categoryId));
      return selected.length ? selected : candidatesByPart[partId] ?? [];
    };

    const roof = scaleRange(massRange(candidatesFor('roof')), footprint);
    const floor = scaleRange(massRange(candidatesFor('floors')), footprint);
    const outerWalls = scaleRange(massRange(candidatesFor('outer_walls')), perimeter * floorHeight);
    const partitions = scaleRange(massRange(candidatesFor('partitions')), partitionAreaPerFloor);
    const occupancy = { min: occupancyMassPerFloor, max: occupancyMassPerFloor };
    const storey = addRanges(floor, outerWalls, partitions, occupancy);

    return {
      floorCount,
      footprint,
      perimeter,
      sre,
      totalHeight,
      thermalEnvelopeArea,
      roof,
      floor,
      outerWalls,
      partitions,
      occupancy,
      storey,
    };
  }, [building, candidatesByPart, selectedItems]);

  return (
    <section className="building-panel building-weight-info">
      <h3>Infos bâtiment</h3>
      <div className="building-weight-summary">
        <span>Emprise : <strong>{result.footprint.toLocaleString('fr-CH')} m²</strong></span>
        <span>SRE : <strong>{result.sre.toLocaleString('fr-CH')} m²</strong></span>
        <span>Ath : <strong>{result.thermalEnvelopeArea.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} m²</strong></span>
        <span>Hauteur : <strong>{result.totalHeight.toLocaleString('fr-CH', { maximumFractionDigits: 2 })} m</strong></span>
        <span>Occupation : <strong>{building?.occupancyLabel ?? 'N/A'}</strong></span>
      </div>
      <div className="building-weight-rows">
        <div className="building-weight-row building-weight-total">
          <span>Toiture</span>
          <strong>{formatRange(result.roof)}</strong>
        </div>
        {Array.from({ length: result.floorCount }, (_, index) => (
          <div className="building-weight-row building-weight-total" key={index}>
            <span>Étage {result.floorCount - index}</span>
            <strong>{formatRange(result.storey)}</strong>
          </div>
        ))}
      </div>
      <details className="building-weight-details">
        <summary>Détail d’un étage</summary>
        <div><span>Plancher</span><strong>{formatRange(result.floor)}</strong></div>
        <div><span>Murs extérieurs</span><strong>{formatRange(result.outerWalls)}</strong></div>
        <div><span>Cloisons</span><strong>{formatRange(result.partitions)}</strong></div>
        <div><span>Charge d’occupation équivalente</span><strong>{formatRange(result.occupancy)}</strong></div>
      </details>
      <p className="building-weight-note">
        Sans macro-composant sélectionné pour une partie, la plage min–max des composants filtrés est utilisée.
      </p>
    </section>
  );
}

export default BuildingWeightInfo;
