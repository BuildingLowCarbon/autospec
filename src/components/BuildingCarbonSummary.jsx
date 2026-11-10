import React, { useEffect, useMemo, useState } from 'react';
import ecccData from '../data/eccc.json';
import { BUILDING_PARTS, getBuildingPart, getRoofCategory } from './BuildingDiagram';
import { componentMatchesTaxonomy } from '../utils/componentTaxonomy';
import { addSurfaceRow, reconcileSurfaceRows, removeSurfaceRow, surfaceRows, targetSurfaceRow } from '../utils/buildingSurfaceRows';
import { copySpreadsheetRows } from '../utils/copySpreadsheetRows';

const PART_IDS = BUILDING_PARTS.map((part) => part.id);
const FLOOR_ADDON_PARTS = BUILDING_PARTS.filter((part) => part.parentPart === 'floors').map((part) => part.id);
const REFERENCE_PERIOD_YEARS = 60;
export const COMPARISON_ROWS = [
  { id: 'excavations', label: 'Fouilles' },
  { id: 'foundations', label: 'Fondations, radiers' },
  { id: 'underground_walls', label: 'Parois extérieures souterraines' },
  { id: 'underground_roofs', label: 'Toitures souterraines' },
  { id: 'outer_walls', label: 'Parois extérieures hors terrain' },
  { id: 'windows_doors', label: 'Fenetres et portes' },
  { id: 'roof_structure', label: 'Toitures (structure porteuse)' },
  { id: 'interior_load_walls', label: 'Parois intérieures porteuse' },
  { id: 'floors', label: 'Planchers internes' },
  { id: 'balconies', label: 'Balcons, avant-toits' },
  { id: 'partitions', label: 'Parois intérieures (cloison)' },
];

const FALLBACK_COMPARISON_ROW = {
  foundation: 'foundations',
  underground_walls: 'underground_walls',
  outer_walls: 'outer_walls',
  roof: 'roof_structure',
  underground_roofs: 'underground_roofs',
  interior_walls: 'interior_load_walls',
  floors: 'floors',
  floor_screed: 'floors',
  floor_covering: 'floors',
  partitions: 'partitions',
  balcony: 'balconies',
  windows: 'windows_doors',
};
const IMPACT_UNIT = 'kg CO₂-eq/(m² SRE·an)';

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const comparisonRowForLayer = (ecccId, partId) => {
  const code = String(ecccId || '').toUpperCase();
  if (code.startsWith('B06')) return 'excavations';
  // All finishes stay with their parent building part in the simplified results.
  return FALLBACK_COMPARISON_ROW[partId] || null;
};

const comparisonVectorForComponent = (item, partId) => {
  const values = new Map();
  const layers = Array.isArray(item?.structure?.layers) ? item.structure.layers : [];
  let layerTotal = 0;
  let hasImpact = false;
  layers.forEach((layer) => {
    const impact = finite(layer?.gwp_kgco2e_m2);
    if (impact === null) return;
    hasImpact = true;
    layerTotal += impact;
    const rowId = comparisonRowForLayer(layer?.ecccId, partId);
    if (rowId) values.set(rowId, (values.get(rowId) || 0) + impact);
  });
  const componentImpact = finite(item?.gwp_kgco2e_m2);
  if (componentImpact !== null) {
    hasImpact = true;
    const remainder = componentImpact - layerTotal;
    const fallback = FALLBACK_COMPARISON_ROW[partId];
    if (fallback && Math.abs(remainder) > 0.0001) values.set(fallback, (values.get(fallback) || 0) + remainder);
  }
  return { values, hasImpact };
};

const ecccVectorForComponent = (item) => {
  const values = new Map();
  const layers = Array.isArray(item?.structure?.layers) ? item.structure.layers : [];
  let attributed = 0;
  layers.forEach((layer) => {
    const impact = finite(layer?.gwp_kgco2e_m2);
    if (impact === null) return;
    const code = layer.ecccId || 'unassigned';
    attributed += impact;
    values.set(code, (values.get(code) || 0) + impact);
  });
  const componentImpact = finite(item?.gwp_kgco2e_m2);
  if (componentImpact !== null && Math.abs(componentImpact - attributed) > 0.0001) {
    values.set('unassigned', (values.get('unassigned') || 0) + componentImpact - attributed);
  }
  return values;
};

const componentName = (item, lang) => item?.translations?.[lang]?.name
  || item?.translations?.fr?.name
  || item?.translations?.de?.name
  || item?.translations?.en?.name
  || item?.serialNo
  || item?.id
  || 'Composant';

const componentGroupMembers = (item) => {
  if (item?.__excludedByFilters) return [];
  return item?.__isComponentGroup && Array.isArray(item.__groupMembers) ? item.__groupMembers : [item];
};

export const partForComponent = (item, roofType = 'pitched') => PART_IDS.find((partId) => {
  const part = getBuildingPart(partId);
  const categories = partId === 'roof' ? [getRoofCategory(roofType)] : part.categories;
  return componentMatchesTaxonomy(item, categories, part.subcategories);
}) || null;

export const defaultBuildingSurfaces = (building = {}) => {
  const floors = Math.max(1, Math.round(finite(building.floorCount) || 1));
  const length = Math.max(0, finite(building.length) || 0);
  const width = Math.max(0, finite(building.width) || 0);
  const height = Math.max(0, finite(building.floorHeight) || 0);
  const totalHeight = Math.max(0, finite(building.totalHeight) || floors * height);
  const footprint = length * width;
  const perimeter = 2 * (length + width);
  const windowRatio = Math.max(0, Math.min(1, finite(building.windowsRatio) || 0));
  const sre = Math.max(0, finite(building.sre) || footprint * floors);
  const partitionRate = Math.max(0, finite(building.partitionRate) || 0);
  const bearingLines = Math.max(0, Math.round(finite(building.interiorBearingLines) || 0));
  const supportLength = building.spanDirection === 'length' ? width : length;
  const facadeArea = perimeter * totalHeight;
  return {
    roof: footprint,
    underground_roofs: footprint,
    floors: footprint * Math.max(0, floors - 1),
    floor_screed: sre,
    floor_covering: sre,
    partitions: partitionRate * sre * height,
    interior_walls: bearingLines * supportLength * totalHeight,
    outer_walls: facadeArea * (1 - windowRatio),
    underground_walls: perimeter * height,
    foundation: footprint,
    balcony: 0,
    windows: facadeArea * windowRatio,
  };
};

const surfaceValue = (entry, fallback) => {
  const value = finite(entry && typeof entry === 'object' ? entry.value : entry);
  return value === null ? fallback : Math.max(0, value);
};

const isManualSurface = (entry) => entry !== undefined && (typeof entry !== 'object' || entry?.auto === false);

const format = (value, digits = 1) => Number(value || 0).toLocaleString('en-CH', { maximumFractionDigits: digits });
const ecccNames = new Map(ecccData.map((entry) => [entry.id, entry.name]));

export const impactPerSreYear = (impactKgCo2Eq, sre, years = REFERENCE_PERIOD_YEARS) => {
  const impact = finite(impactKgCo2Eq);
  const area = finite(sre);
  const period = finite(years);
  if (impact === null || area === null || area <= 0 || period === null || period <= 0) return null;
  return impact / area / period;
};

function BuildingCarbonSummary({
  building,
  selectedItems = [],
  candidatesByPart = {},
  surfaces = {},
  onSurfacesChange,
  selectionReady = true,
  roofType = 'pitched',
  lang = 'fr',
  onOpenGroup,
  onUnselectItems,
  onSelectPart,
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const defaults = useMemo(() => defaultBuildingSurfaces(building), [building]);
  const actualSelectedByPart = useMemo(() => {
    const result = Object.fromEntries(PART_IDS.map((partId) => [partId, []]));
    selectedItems.forEach((item) => {
      const partId = partForComponent(item, roofType);
      if (partId) result[partId].push(item);
    });
    return result;
  }, [roofType, selectedItems]);

  const reconciliation = useMemo(() => reconcileSurfaceRows(surfaces, actualSelectedByPart, defaults, FLOOR_ADDON_PARTS), [surfaces, actualSelectedByPart, defaults]);
  const rowSurfaces = reconciliation.surfaces;
  const selectedByPart = useMemo(() => Object.fromEntries(PART_IDS.map((partId) => [partId,
    surfaceRows(rowSurfaces, partId).map((row) => {
      const assigned = actualSelectedByPart[partId].find((item) => item.id === row.assignedItemId);
      return { ...(assigned || {
        id: row.key, __isComponentGroup: true, __groupMembers: candidatesByPart[partId] || [],
        translations: { fr: { name: 'Aucun composant — plage des composants filtrés' } },
      }), __surfaceKey: row.key, __assignedItem: assigned || null, __unassignedSurface: !assigned };
    }),
  ])), [actualSelectedByPart, candidatesByPart, rowSurfaces]);
  const surfaceDefaults = useMemo(() => Object.fromEntries(surfaceRows(rowSurfaces).map((row) => [row.key,
    row.basis === 'primary' ? defaults[row.partId] : 0,
  ])), [defaults, rowSurfaces]);

  useEffect(() => {
    // Wait for the catalogue before reconciling saved assignments.
    if (!selectionReady || typeof onSurfacesChange !== 'function') return;
    if (JSON.stringify(rowSurfaces) !== JSON.stringify(surfaces)) onSurfacesChange(rowSurfaces);
    if (reconciliation.unselectedIds.length) onUnselectItems?.(reconciliation.unselectedIds);
  }, [onSurfacesChange, onUnselectItems, reconciliation, rowSurfaces, selectionReady, surfaces]);

  const analysis = useMemo(() => {
    const partRows = [];
    const ecccTotals = new Map();
    let knownTotal = 0;
    let rangeMinTotal = 0;
    let rangeMaxTotal = 0;
    const missingPartLabels = [];

    PART_IDS.forEach((partId) => {
      const part = BUILDING_PARTS.find((entry) => entry.id === partId);
      const selected = selectedByPart[partId];
      if (selected.length) {
        let exactTotal = 0;
        let selectedMin = 0;
        let selectedMax = 0;
        selected.forEach((item) => {
          const surface = surfaceValue(rowSurfaces[item.__surfaceKey], surfaceDefaults[item.__surfaceKey]);
          const members = componentGroupMembers(item);
          const impacts = members.map((member) => finite(member.gwp_kgco2e_m2)).filter((value) => value !== null);
          if (impacts.length) {
            const minImpact = Math.min(...impacts) * surface;
            const maxImpact = Math.max(...impacts) * surface;
            selectedMin += minImpact;
            selectedMax += maxImpact;
            if (!item.__isComponentGroup) exactTotal += minImpact;
          } else if (surface > 0) {
            missingPartLabels.push(part?.label || partId);
          }
          const vectors = members.map(ecccVectorForComponent);
          const codes = new Set(vectors.flatMap((vector) => [...vector.keys()]));
          codes.forEach((code) => {
            const values = vectors.map((vector) => vector.get(code) || 0);
            const current = ecccTotals.get(code) || { min: 0, max: 0 };
            current.min += Math.min(...values) * surface;
            current.max += Math.max(...values) * surface;
            ecccTotals.set(code, current);
          });
        });
        knownTotal += exactTotal;
        rangeMinTotal += selectedMin;
        rangeMaxTotal += selectedMax;
        partRows.push({ partId, label: part?.label || partId, selected, total: selectedMin === selectedMax ? selectedMin : null, min: selectedMin, max: selectedMax });
        return;
      }

      partRows.push({ partId, label: part?.label || partId, selected: [], total: null, min: 0, max: 0 });
    });
    return {
      partRows,
      knownTotal,
      rangeMinTotal,
      rangeMaxTotal,
      missingPartLabels,
      ecccRows: [...ecccTotals.entries()]
        .map(([code, totals]) => ({ code, name: code === 'unassigned' ? 'Non attribué' : ecccNames.get(code) || code, ...totals }))
        .sort((a, b) => b.max - a.max),
    };
  }, [selectedByPart, surfaceDefaults, rowSurfaces]);

  const comparisonRows = useMemo(() => {
    const totals = new Map(COMPARISON_ROWS.map(({ id }) => [id, {
      exact: 0,
      min: 0,
      max: 0,
      hasExact: false,
      hasRange: false,
    }]));

    PART_IDS.forEach((partId) => {
      const selected = selectedByPart[partId];
      if (selected.length) {
        selected.forEach((item) => {
          const surface = surfaceValue(rowSurfaces[item.__surfaceKey], surfaceDefaults[item.__surfaceKey]);
          const vectors = componentGroupMembers(item)
            .map((member) => comparisonVectorForComponent(member, partId))
            .filter((vector) => vector.hasImpact);
          if (!vectors.length) return;
          if (!item.__isComponentGroup) {
            vectors[0].values.forEach((impact, rowId) => {
              const target = totals.get(rowId);
              if (!target) return;
              target.exact += impact * surface;
              target.hasExact = true;
            });
            return;
          }
          COMPARISON_ROWS.forEach(({ id }) => {
            const values = vectors.map((vector) => vector.values.get(id) || 0);
            if (!values.some((value) => Math.abs(value) > 0.0001)) return;
            const target = totals.get(id);
            target.min += Math.min(...values) * surface;
            target.max += Math.max(...values) * surface;
            target.hasRange = true;
          });
        });
        return;
      }

    });

    return COMPARISON_ROWS.map((row) => {
      const total = totals.get(row.id);
      if (total.hasRange) {
        return {
          ...row,
          first: total.exact + total.min,
          second: total.exact + total.max,
          mode: 'range',
        };
      }
      if (total.hasExact) return { ...row, first: total.exact, second: null, mode: 'exact' };
      return { ...row, first: null, second: null, mode: 'empty' };
    });
  }, [selectedByPart, surfaceDefaults, rowSurfaces]);

  const updateSurface = (key, value, partId) => {
    if (typeof onSurfacesChange !== 'function') return;
    onSurfacesChange({ ...rowSurfaces, [key]: { ...rowSurfaces[key], value: Math.max(0, Number(value) || 0), auto: false, partId } });
  };
  const removeRow = (key) => {
    const result = removeSurfaceRow(rowSurfaces, key);
    onSurfacesChange?.(result.surfaces);
    if (result.unselectedIds.length) onUnselectItems?.(result.unselectedIds);
  };
  const targetRow = (key, partId) => {
    onSurfacesChange?.(targetSurfaceRow(rowSurfaces, key));
    onSelectPart?.(partId);
  };
  const normalizedImpact = (value) => impactPerSreYear(value, building?.sre);
  const displayImpact = (min, max = min) => {
    const normalizedMin = normalizedImpact(min);
    const normalizedMax = normalizedImpact(max);
    if (normalizedMin === null || normalizedMax === null) return 'N/A';
    return `${format(normalizedMin, 3)}${min === max ? '' : ` – ${format(normalizedMax, 3)}`} ${IMPACT_UNIT}`;
  };
  const copyNumber = (value) => {
    const normalized = normalizedImpact(value);
    return normalized === null ? '' : normalized.toLocaleString('en-CH', {
      useGrouping: false,
      maximumFractionDigits: 6,
    });
  };
  const displayComparisonValue = (value) => {
    if (value === null) return '';
    const normalized = normalizedImpact(value);
    return normalized === null ? 'N/A' : format(normalized, 3);
  };
  const copyComparisonResults = async () => {
    const copied = await copySpreadsheetRows(comparisonRows.map((row) => [copyNumber(row.first), copyNumber(row.second)]));
    setCopyStatus(copied ? 'Résultats copiés.' : 'Impossible de copier les résultats.');
  };

  return (
    <section className="building-panel building-carbon-summary">
      <h3>Impact carbone du bâtiment</h3>
      <p className="building-weight-note">Les surfaces proposées reprennent les hypothèses géométriques du bâtiment. Elles restent modifiables individuellement. Tous les impacts sont divisés par la SRE et par une période de référence de 60 ans.</p>
      <p className="building-weight-note">Choisissez une ligne avec « Prochaine sélection » pour y affecter le prochain composant ou groupe. Désélectionner un élément conserve sa surface ; seul le bouton × supprime la ligne.</p>
      <div className="building-carbon-total">
        <span>Total estimé{analysis.missingPartLabels.length ? ' (données disponibles)' : ''}</span>
        <strong>{normalizedImpact(analysis.rangeMinTotal) === null ? 'N/A' : `${format(normalizedImpact(analysis.rangeMinTotal), 3)} – ${format(normalizedImpact(analysis.rangeMaxTotal), 3)} ${IMPACT_UNIT}`}</strong>
      </div>
      {analysis.missingPartLabels.length ? <p className="building-weight-note">Sans donnée carbone : {analysis.missingPartLabels.join(', ')}.</p> : null}
      <div className="building-carbon-parts">
        {analysis.partRows.filter((row) => !FLOOR_ADDON_PARTS.includes(row.partId)).map((row) => {
          const renderSurfaceSection = (row) => <>
            {onSurfacesChange ? <button type="button" className="building-carbon-add-surface" aria-label={`Ajouter une surface — ${row.label}`} onClick={() => {
              onSurfacesChange(addSurfaceRow(rowSurfaces, row.partId));
              onSelectPart?.(row.partId);
            }}>+ Ajouter une surface</button> : null}
            {row.selected.map((item, index) => {
              const key = item.__surfaceKey;
              const surfaceEntry = rowSurfaces[key];
              const area = surfaceValue(surfaceEntry, surfaceDefaults[key]);
              const gwpValues = componentGroupMembers(item).map((member) => finite(member.gwp_kgco2e_m2)).filter((value) => value !== null);
              const minImpact = gwpValues.length ? area * Math.min(...gwpValues) : null;
              const maxImpact = gwpValues.length ? area * Math.max(...gwpValues) : null;
              return (
                <div className={`building-carbon-line${item.__unassignedSurface ? ' is-range' : ''}${surfaceEntry.target ? ' is-target' : ''}`} key={key}>
                  <div className="building-carbon-assignment">
                  {onSurfacesChange ? <label className="building-carbon-target" title="Affecter la prochaine sélection à cette surface">
                    <input type="radio" name={`surface-target:${row.partId}`} checked={Boolean(surfaceEntry.target)} aria-label={`Prochaine sélection — surface ${index + 1} — ${row.label}`} onChange={() => targetRow(key, row.partId)} />
                  </label> : null}
                  {item.__isComponentGroup && !item.__unassignedSurface && onOpenGroup ? (
                    item.__isGroupCollection ? (
                      <details className="building-carbon-group-collection">
                        <summary title={componentName(item, lang)}>{componentName(item, lang)}</summary>
                        <ul>{(item.__childGroups || []).map((child) => <li key={child.id}>
                          <button type="button" className="building-carbon-group-link" title={componentName(child, lang)} onClick={() => onOpenGroup(child)}>{componentName(child, lang)}</button>
                        </li>)}</ul>
                      </details>
                    ) : (
                      <button type="button" className="building-carbon-group-link" title={componentName(item, lang)} onClick={() => onOpenGroup(item.__assignedItem)}>
                        {componentName(item, lang)} · sélection {item.__groupSelectionNumber || 1} ({item.__groupMembers?.length || 0} variantes)
                      </button>
                    )
                  ) : <span title={componentName(item, lang)}>{componentName(item, lang)}{item.__isComponentGroup && !item.__isGroupCollection && !item.__unassignedSurface ? ` · sélection ${item.__groupSelectionNumber || 1} (${item.__groupMembers?.length || 0} variantes)` : ''}</span>}
                  </div>
                  <label className={isManualSurface(surfaceEntry) ? 'is-manual' : ''}><input type="number" min="0" step="0.1" value={area} onChange={(event) => updateSurface(key, event.target.value, row.partId)} /> m²</label>
                  <strong>{displayImpact(minImpact, maxImpact)}</strong>
                  {onSurfacesChange ? <button type="button" className="building-carbon-remove-surface" aria-label={`Supprimer la surface ${index + 1} — ${row.label}`} onClick={() => removeRow(key)}>×</button> : null}
                </div>
              );
            })}
          </>;
          return <article key={row.partId}>
            <h4>{row.label}</h4>
            {renderSurfaceSection(row)}
            {row.partId === 'floors' ? FLOOR_ADDON_PARTS.map((partId) => {
              const child = analysis.partRows.find((entry) => entry.partId === partId);
              return <section className="building-carbon-floor-addon" key={partId} aria-label={child.label}>
                <h5>{child.label}</h5>
                {renderSurfaceSection(child)}
              </section>;
            }) : null}
          </article>;
        })}
      </div>
      <section className="building-carbon-comparison" aria-labelledby="building-carbon-comparison-title">
        <div className="building-carbon-comparison-heading">
          <div>
            <h4 id="building-carbon-comparison-title">Comparaison</h4>
            <p>{IMPACT_UNIT}</p>
          </div>
          <button type="button" onClick={copyComparisonResults}>Copier résultats</button>
        </div>
        {copyStatus ? <p className="building-carbon-copy-status" role="status">{copyStatus}</p> : null}
        <div className="building-carbon-comparison-scroll">
          <table>
            <thead><tr><th>Poste</th><th>Minimum / sélection</th><th>Maximum</th></tr></thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{displayComparisonValue(row.first)}</td>
                  <td>{displayComparisonValue(row.second)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="building-carbon-eccc">
        <summary>Répartition par sous-catégorie eCCC</summary>
        {analysis.ecccRows.length ? (
          <table>
            <thead><tr><th>eCCC</th><th>Sous-catégorie</th><th>Impact</th></tr></thead>
            <tbody>{analysis.ecccRows.map((row) => <tr key={row.code}><td>{row.code}</td><td>{row.name}</td><td>{displayImpact(row.min, row.max)}</td></tr>)}</tbody>
          </table>
        ) : <p>Sélectionnez des composants pour obtenir la répartition eCCC.</p>}
      </details>
    </section>
  );
}

export default BuildingCarbonSummary;
