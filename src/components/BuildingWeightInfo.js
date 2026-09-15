import React, { useMemo } from 'react';
import { getBuildingPart } from './BuildingDiagram';
import { componentMatchesTaxonomy, getComponentSubcategoryId } from '../utils/componentTaxonomy';

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

const addKnownRanges = (...ranges) => {
  const known = ranges.filter(Boolean);
  if (!known.length) return null;
  return known.reduce((total, range) => ({
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

const formatLineMass = (value) => {
  if (!Number.isFinite(value)) return 'N/A';
  if (value >= 1000) return `${(value / 1000).toLocaleString('fr-CH', { maximumFractionDigits: 2 })} t/m`;
  return `${Math.round(value).toLocaleString('fr-CH')} kg/m`;
};

const formatLineRange = (range) => {
  if (!range) return 'N/A';
  const tolerance = Math.max(1, range.max) * 0.0001;
  const mass = Math.abs(range.max - range.min) <= tolerance
    ? formatLineMass(range.min)
    : `${formatLineMass(range.min)} – ${formatLineMass(range.max)}`;
  const knMin = range.min * GRAVITY_M_S2 / 1000;
  const knMax = range.max * GRAVITY_M_S2 / 1000;
  const force = Math.abs(knMax - knMin) <= tolerance * GRAVITY_M_S2 / 1000
    ? `${knMin.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} kN/m`
    : `${knMin.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} – ${knMax.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} kN/m`;
  return `${mass} (${force})`;
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
    const totalPartitionLength = partitionRate * srePerFloor;
    const partitionAreaPerFloor = totalPartitionLength * floorHeight;
    const totalHeight = Math.max(0, Number(building?.totalHeight) || floorCount * floorHeight);
    const thermalEnvelopeArea = Math.max(
      0,
      Number(building?.thermalEnvelopeArea) || 2 * footprint + perimeter * totalHeight,
    );
    const occupancyMassPerSre = Math.max(0, Number(building?.occupancyLoadKnM2) || 0) * 1000 / GRAVITY_M_S2;
    const occupancyMassPerFloor = occupancyMassPerSre * srePerFloor;
    const occupancyMassPerArea = footprint > 0 ? occupancyMassPerFloor / footprint : 0;

    const candidatesFor = (partId) => {
      const part = getBuildingPart(partId);
      const selected = selectedItems.filter((item) =>
        componentMatchesTaxonomy(item, part.categories, part.subcategories)
      );
      return selected.length ? selected : candidatesByPart[partId] ?? [];
    };

    const roofMassPerArea = massRange(candidatesFor('roof'));
    const floorMassPerArea = massRange(candidatesFor('floors'));
    const outerWallMassPerArea = massRange(candidatesFor('outer_walls'));
    const partitionCandidates = candidatesFor('partitions');
    const bearingWallCandidates = partitionCandidates.filter((item) => getComponentSubcategoryId(item) === 'load_bearing');
    const nonBearingWallCandidates = partitionCandidates.filter((item) => getComponentSubcategoryId(item) !== 'load_bearing');
    const partitionWallMassPerArea = massRange(partitionCandidates);
    const bearingWallMassPerArea = massRange(bearingWallCandidates);
    const nonBearingWallMassPerArea = massRange(nonBearingWallCandidates);

    const roof = scaleRange(roofMassPerArea, footprint);
    const floor = scaleRange(floorMassPerArea, footprint);
    const outerWalls = scaleRange(outerWallMassPerArea, perimeter * floorHeight);
    const partitions = scaleRange(partitionWallMassPerArea, partitionAreaPerFloor);
    const occupancy = { min: occupancyMassPerFloor, max: occupancyMassPerFloor };
    const storey = addRanges(floor, outerWalls, partitions, occupancy);

    const spanDirection = building?.spanDirection === 'length' ? 'length' : 'width';
    const distribution = building?.floorLoadDistribution === 'two_way' ? 'two_way' : 'one_way';
    const spanDimension = spanDirection === 'length' ? length : width;
    const supportLineLength = spanDirection === 'length' ? width : length;
    const interiorBearingLines = Math.max(0, Math.round(Number(building?.interiorBearingLines) || 0));
    const bayCount = interiorBearingLines + 1;
    const bayWidth = bayCount > 0 ? spanDimension / bayCount : spanDimension;
    const bearingWallLength = interiorBearingLines * supportLineLength;
    const nonBearingPartitionLength = totalPartitionLength;
    const declaredMaxBuildingSpan = Math.max(0, Number(building?.maxBuildingSpan) || 0);
    const loadCalculationSpan = declaredMaxBuildingSpan > 0
      ? Math.min(declaredMaxBuildingSpan, spanDimension)
      : bayWidth;

    const nonBearingPartitionMass = nonBearingPartitionLength > 0
      ? scaleRange(nonBearingWallMassPerArea, nonBearingPartitionLength * floorHeight)
      : { min: 0, max: 0 };
    const nonBearingPartitionMassPerArea = footprint > 0
      ? scaleRange(nonBearingPartitionMass, 1 / footprint)
      : null;
    const permanentFloorMassPerArea = addKnownRanges(floorMassPerArea, nonBearingPartitionMassPerArea);
    const totalFloorMassPerArea = addKnownRanges(
      permanentFloorMassPerArea,
      { min: occupancyMassPerArea, max: occupancyMassPerArea },
    );
    const outerWallSelfMassPerMeter = scaleRange(outerWallMassPerArea, floorHeight);
    const bearingWallSelfMassPerMeter = scaleRange(bearingWallMassPerArea, floorHeight);

    const totalSupportingLength = perimeter + bearingWallLength;
    const reactionPerLine = (surfaceMass, wallType) => {
      if (!surfaceMass) return null;
      if (distribution === 'two_way') {
        return totalSupportingLength > 0
          ? scaleRange(surfaceMass, footprint / totalSupportingLength)
          : null;
      }
      if (wallType === 'exterior') return scaleRange(surfaceMass, loadCalculationSpan / 2);
      return interiorBearingLines > 0 ? scaleRange(surfaceMass, loadCalculationSpan) : null;
    };

    const floorReactionExterior = reactionPerLine(totalFloorMassPerArea, 'exterior');
    const floorReactionInterior = reactionPerLine(totalFloorMassPerArea, 'interior');
    const roofReactionExterior = reactionPerLine(roofMassPerArea, 'exterior');
    const roofReactionInterior = reactionPerLine(roofMassPerArea, 'interior');
    const levels = [];
    let cumulativeExterior = null;
    let cumulativeInterior = null;
    for (let level = floorCount; level >= 1; level -= 1) {
      const horizontalExterior = level === floorCount ? roofReactionExterior : floorReactionExterior;
      const horizontalInterior = level === floorCount ? roofReactionInterior : floorReactionInterior;
      cumulativeExterior = addKnownRanges(cumulativeExterior, horizontalExterior, outerWallSelfMassPerMeter);
      cumulativeInterior = interiorBearingLines > 0
        ? addKnownRanges(cumulativeInterior, horizontalInterior, bearingWallSelfMassPerMeter)
        : null;
      levels.push({ level, exterior: cumulativeExterior, interior: cumulativeInterior });
    }

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
      spanDirection,
      distribution,
      supportLineLength,
      bayCount,
      bayWidth,
      loadCalculationSpan,
      interiorBearingLines,
      automaticInteriorBearingLines: Math.max(0, Number(building?.automaticInteriorBearingLines) || 0),
      interiorBearingLinesOverridden: Boolean(building?.interiorBearingLinesOverridden),
      nonBearingPartitionLength,
      levels,
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
        <div><span>Parois intérieures</span><strong>{formatRange(result.partitions)}</strong></div>
        <div><span>Charge d’occupation équivalente</span><strong>{formatRange(result.occupancy)}</strong></div>
      </details>

      <div className="building-wall-loads">
        <h4>Charges linéiques sur les murs</h4>
        <div className="building-wall-load-summary">
          <span>Portée selon la <strong>{result.spanDirection === 'width' ? 'largeur' : 'longueur'}</strong></span>
          <span><strong>{result.bayCount}</strong> travée{result.bayCount > 1 ? 's' : ''} de <strong>{result.bayWidth.toLocaleString('fr-CH', { maximumFractionDigits: 2 })} m</strong></span>
          <span>Portée retenue pour la charge maximale : <strong>{result.loadCalculationSpan.toLocaleString('fr-CH', { maximumFractionDigits: 2 })} m</strong></span>
          <span><strong>{result.interiorBearingLines}</strong> ligne{result.interiorBearingLines > 1 ? 's' : ''} intérieure{result.interiorBearingLines > 1 ? 's' : ''} porteuse{result.interiorBearingLines > 1 ? 's' : ''}</span>
          <span>Longueur d’une ligne : <strong>{result.supportLineLength.toLocaleString('fr-CH', { maximumFractionDigits: 2 })} m</strong></span>
        </div>
        {result.interiorBearingLinesOverridden ? (
          <p className="building-weight-note">Nombre de lignes modifié manuellement; calcul automatique : {result.automaticInteriorBearingLines}.</p>
        ) : null}
        <div className="building-wall-load-table-wrap">
          <table className="building-wall-load-table">
            <thead>
              <tr>
                <th>Niveau</th>
                <th>Mur extérieur porteur, par ligne</th>
                <th>Mur intérieur porteur, par ligne</th>
              </tr>
            </thead>
            <tbody>
              {result.levels.map((row) => (
                <tr key={row.level}>
                  <td>Au pied de l’étage {row.level}</td>
                  <td>{formatLineRange(row.exterior)}</td>
                  <td>{result.interiorBearingLines > 0 ? formatLineRange(row.interior) : 'Aucune ligne'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="building-wall-load-details">
          <summary>Hypothèses de répartition</summary>
          <ul>
            <li>La « portée max. » est celle du bâtiment; elle sert à déduire le nombre de travées et comme portée conservative pour calculer la charge linéique maximale.</li>
            <li>Les lignes porteuses sont régulièrement espacées et alignées entre les étages.</li>
            <li>
              {result.distribution === 'one_way'
                ? 'Répartition unidirectionnelle : seuls les murs perpendiculaires à la portée reçoivent la charge du plancher; chaque mur extérieur reçoit une demi-travée et chaque mur intérieur une travée.'
                : 'Répartition bidirectionnelle simplifiée : la charge est répartie uniformément sur la longueur totale des murs porteurs extérieurs et intérieurs.'}
            </li>
            <li>Les parois non porteuses sont ajoutées à la charge permanente du plancher. Leur longueur reprend directement le taux de cloison : {result.nonBearingPartitionLength.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} m par étage.</li>
            <li>Le poids propre des murs est ajouté séparément à chaque niveau. La toiture ne comprend ici ni neige ni charge d’entretien.</li>
            {result.distribution === 'one_way' ? <li>Les murs extérieurs parallèles à la portée ne reçoivent que leur poids propre.</li> : null}
          </ul>
        </details>
      </div>
      <p className="building-weight-note">
        Sans macro-composant sélectionné pour une partie, la plage min–max des composants filtrés est utilisée. Il s’agit d’un prédimensionnement simplifié.
      </p>
    </section>
  );
}

export default BuildingWeightInfo;
