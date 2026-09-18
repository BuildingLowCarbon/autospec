import React from "react";
import { ViewSVG, DEFAULT_PX_PER_MM_X } from "./Graphic";
import { getAcousticInsulation } from "../utils/acoustic";
import categoriesData from "../data/categories.json";
import { getComponentSubcategoryId, getSubcategoryLabel } from "../utils/componentTaxonomy";
import { calculateStudCompressionCapacity } from "../utils/woodStudResistance";

const formatNumber = (value, decimals = 1) => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num.toFixed(decimals);
};

const finiteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const capacityCellValue = (cell) =>
  finiteNumber(cell && typeof cell === "object" ? cell.value : cell);

const findCapacityRow = (table, pattern) => {
  if (!Array.isArray(table?.rows)) return null;
  return table.rows.find((row) => pattern.test(String(row?.label ?? ""))) ?? null;
};

const getFloorSpan = (item, rating) => {
  const fire = item?.fire_resistance ?? {};
  const table = fire.wood_capacity_table?.type === "floor_span"
    ? fire.wood_capacity_table
    : null;
  const row = findCapacityRow(table, /gouvernante/i) ?? table?.rows?.[0] ?? null;
  const column = rating === "R0" ? "normal_temperature" : rating;
  const tableValue = capacityCellValue(row?.[column]);
  if (tableValue !== null) return tableValue;

  const result = fire.wood_beam_span;
  if (result && !result.error) {
    if (rating === "R0") return finiteNumber(result.ambient?.L_ambient_governing_m);
    const minutes = Number(rating.replace("R", ""));
    return finiteNumber(result.fire?.find((entry) => Number(entry?.fireMinutes) === minutes)?.Max_span);
  }

  return rating === "R0" ? finiteNumber(item?.spanMax_m) : null;
};

export const getWallLinearResistance = (item, rating) => {
  const fire = item?.fire_resistance ?? {};
  const storedResult = fire.wood_stud_compression;
  const materialCategoryIds = storedResult?.input?.materialCategoryIds;
  if (Array.isArray(materialCategoryIds) && (
    materialCategoryIds.length === 0 ||
    materialCategoryIds.some((categoryId) => !["holz", "holzwerkstoff"].includes(categoryId))
  )) return null;
  let result = storedResult;
  if (storedResult?.input && !storedResult.error) {
    try {
      result = calculateStudCompressionCapacity(storedResult.input);
    } catch (error) {
      result = storedResult;
    }
  }
  const spacing = finiteNumber(result?.input?.spacing_mm);
  if (result && !result.error && spacing !== null && spacing > 0) {
    const spacingM = spacing / 1000;
    if (rating === "R0") {
      const capacity = finiteNumber(result.normalTemperature?.Nmax_NT_kN);
      if (capacity !== null) return capacity / spacingM;
    } else {
      const minutes = Number(rating.replace("R", ""));
      const capacity = finiteNumber(result.fire?.find((entry) => Number(entry?.fireMinutes) === minutes)?.Nmax_Rt_kN);
      if (capacity !== null) return capacity / spacingM;
    }
  }

  const table = fire.wood_capacity_table?.type === "wall_stud_force"
    ? fire.wood_capacity_table
    : null;
  const row = findCapacityRow(table, /par (m[eè]tre|metre)/i);
  const column = rating === "R0" ? "normal_temperature" : rating;
  const tableValue = capacityCellValue(row?.[column]);
  if (tableValue !== null) return tableValue;

  if (!result || result.error || spacing === null || spacing <= 0) return null;
  const spacingM = spacing / 1000;
  if (rating === "R0") {
    const capacity = finiteNumber(result.normalTemperature?.Nmax_NT_kN);
    return capacity === null ? null : capacity / spacingM;
  }
  const minutes = Number(rating.replace("R", ""));
  const capacity = finiteNumber(result.fire?.find((entry) => Number(entry?.fireMinutes) === minutes)?.Nmax_Rt_kN);
  return capacity === null ? null : capacity / spacingM;
};

function ValueRow({ label, value, unit, invalid = false }) {
  const display = value === null || value === undefined || value === "" ? "N/A" : value;
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <div style={styles.row}>
      <div style={styles.rowLabel}>{label} :</div>
      <div style={{ ...styles.rowValue, ...(invalid ? styles.invalidValue : {}) }}>
        {display}
        {hasValue ? <span style={styles.rowUnit}>&nbsp;{unit}</span> : null}
      </div>
    </div>
  );
}

export default function ComponentCard({
  item,
  lang = "fr",
  selected = false,
  onToggle,
  onDetails,
  t = {},
  failedFilters = [],
}) {
  const layers = item?.structure?.layers ?? [];
  const title =
    item?.translations?.[lang]?.name ||
    item?.translations?.fr?.name ||
    item?.translations?.de?.name ||
    item?.translations?.en?.name ||
    item?.translations?.it?.name ||
    item?.serialNo ||
    item?.source?.externalId ||
    item?.id ||
    "";
  const sourceReference = item?.source?.externalId ?? null;
  const category = categoriesData.categories.find((entry) => entry.id === item?.categoryId);
  const subcategoryLabel = getSubcategoryLabel(category, getComponentSubcategoryId(item), lang);

  const thickness = formatNumber(item?.thickness_mm, 0);
  const weight = formatNumber(item?.weight_kg_m2, 0);
  const uValue = formatNumber(item?.uValue_W_m2K, 3);
  const gwp = formatNumber(item?.gwp_kgco2e_m2, 1);

  const acoustic = getAcousticInsulation(item);
  const airborne = formatNumber(acoustic.rwCorrected, 0);
  const impact = formatNumber(acoustic.lnwCorrected, 0);
  const isFloor = item?.categoryId === "floor_assembly";
  const isLoadBearingWall = ["outer_wall", "inner_wall"].includes(item?.categoryId);
  const ratings = ["R0", "R30", "R60"];
  const failed = new Set(failedFilters);
  const fire = item?.fire_resistance ?? {};
  const fireMinutes = String(fire.REI_min ?? "").match(/\d+/)?.[0] ?? null;
  const declaredFireR = fire.R ?? (fireMinutes ? `R${fireMinutes}` : null);
  const declaredFireEI = fire.EI ?? (fireMinutes ? `EI${fireMinutes}` : null);

  // Scale down SVG views to fit the card without cropping
  const svgScale = 0.15;
  const pxPerMmY = svgScale;
  const pxPerMmX = DEFAULT_PX_PER_MM_X * svgScale;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.title}>{title}</div>
          {sourceReference ? <div style={styles.sourceReference}>{sourceReference}</div> : null}
          {subcategoryLabel ? <span style={styles.tag}>{subcategoryLabel}</span> : null}
        </div>
        <div style={styles.headerActions}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
            />
            <span style={{ marginLeft: 6 }}>{t.selected_label ?? "Select"}</span>
          </label>
          <button type="button" onClick={onDetails} style={styles.detailsBtn}>
            {t.details ?? "Details"}
          </button>
        </div>
      </div>

      <div style={styles.body}>
        <div style={styles.left}>
          {layers.length > 0 ? (
            <div style={styles.previewStack}>
              <div style={styles.previewBox}>
                <ViewSVG
                  title="Coupe transverse"
                  layers={layers}
                  view="transverse"
                  pxPerMmY={pxPerMmY}
                  pxPerMmX={pxPerMmX}
                  showDimensions={false}
                />
              </div>
              <div style={styles.previewBox}>
                <ViewSVG
                  title="Coupe longitudinale"
                  layers={layers}
                  view="longitudinal"
                  pxPerMmY={pxPerMmY}
                  pxPerMmX={pxPerMmX}
                  showDimensions={false}
                />
              </div>
            </div>
          ) : (
            <div style={styles.noPreview}>No preview</div>
          )}
        </div>

        <div style={styles.right}>
          <div style={styles.infoBox}>
            <div style={styles.mainValues}>
              <ValueRow label={t.thickness ?? "Thickness"} value={thickness} unit="mm" invalid={failed.has("thickness")} />
              <ValueRow label={t.weight ?? "Weight"} value={weight} unit="kg/m2" />
              <ValueRow label={t.uValue ?? "U value"} value={uValue} unit="W/m2K" invalid={failed.has("uValue")} />
              <ValueRow label={t.gwp ?? "GWP"} value={gwp} unit="kgCO2e/m2" invalid={failed.has("gwp")} />
            </div>

            <div style={styles.sideValues}>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>{t.acoustic_insulation ?? "Acoustic insulation"}</div>
                <ValueRow label={t.acoustic_rw_corrected ?? "Rw cor."} value={airborne} unit="dB" invalid={failed.has("rw")} />
                {isFloor ? <ValueRow label={t.acoustic_lnw_corrected ?? "Ln,w cor."} value={impact} unit="dB" invalid={failed.has("lnw")} /> : null}
              </div>

              {failed.has("fireR") || failed.has("fireEI") ? (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>{t.fire_protection ?? "Fire protection"}</div>
                  {failed.has("fireR") ? <ValueRow label="R" value={declaredFireR} unit="" invalid /> : null}
                  {failed.has("fireEI") ? <ValueRow label="EI" value={declaredFireEI} unit="" invalid /> : null}
                </div>
              ) : null}

              {isFloor ? (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>{t.floor_max_spans ?? "Maximum spans"}</div>
                  {ratings.map((rating) => (
                    <ValueRow
                      key={rating}
                      label={`${t.max_span ?? "Max. span"} ${rating}`}
                      value={formatNumber(getFloorSpan(item, rating), 2)}
                      unit="m"
                      invalid={failed.has(`span:${rating}`)}
                    />
                  ))}
                </div>
              ) : null}

              {isLoadBearingWall ? (
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>{t.wall_linear_resistance ?? "Maximum linear resistance"}</div>
                  {ratings.map((rating) => (
                    <ValueRow
                      key={rating}
                      label={rating}
                      value={formatNumber(getWallLinearResistance(item, rating), 1)}
                      unit="kN/m"
                      invalid={failed.has(`linearResistance:${rating}`)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    border: "2px solid #111",
    borderRadius: "18px",
    padding: "18px",
    background: "#f4f4f4",
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "14px",
    gap: "12px",
    flexWrap: "wrap",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  checkboxLabel: {
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
  },
  title: {
    fontSize: "22px",
    fontWeight: 600,
    lineHeight: 1.2,
    flex: "1 1 240px",
    wordBreak: "break-word",
  },
  titleBlock: {
    flex: "1 1 240px",
  },
  tag: {
    display: "inline-block",
    marginTop: "6px",
    padding: "3px 8px",
    border: "1px solid #777",
    borderRadius: "12px",
    background: "#fff",
    fontSize: "12px",
    fontWeight: 600,
  },
  sourceReference: {
    marginTop: "4px",
    color: "#555",
    fontSize: "13px",
    fontWeight: 600,
  },
  detailsBtn: {
    border: "1px solid #666",
    borderRadius: "8px",
    padding: "6px 14px",
    background: "#d0d0d0",
    cursor: "pointer",
    fontWeight: 600,
  },
  body: {
    display: "grid",
    gridTemplateColumns: "200px minmax(0, 1fr)",
    gap: "16px",
    alignItems: "start",
  },
  left: {
    display: "flex",
    justifyContent: "center",
  },
  previewStack: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "12px",
    width: "180px",
  },
  previewBox: {
    border: "1px solid #111",
    borderRadius: "10px",
    background: "#fff",
    padding: "8px",
    overflow: "hidden",
  },
  noPreview: {
    width: "200px",
    border: "1px dashed #999",
    borderRadius: "10px",
    padding: "18px",
    background: "#fff",
    color: "#666",
    textAlign: "center",
  },
  right: {},
  infoBox: {
    border: "1px solid #111",
    borderRadius: "18px",
    background: "#fff",
    padding: "18px",
    display: "grid",
    gridTemplateColumns: "1.1fr 1fr",
    gap: "20px",
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  mainValues: {
    display: "grid",
    gap: "14px",
    alignContent: "start",
  },
  sideValues: {
    display: "grid",
    gap: "18px",
    alignContent: "start",
  },
  section: {
    paddingTop: "4px",
  },
  sectionTitle: {
    fontSize: "17px",
    fontWeight: 700,
    marginBottom: "8px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    alignItems: "baseline",
    columnGap: "4px",
    fontSize: "15px",
    minWidth: 0,
  },
  rowLabel: {
    opacity: 0.9,
    whiteSpace: "nowrap",
    fontWeight: 600,
  },
  rowValue: {
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowUnit: {
    opacity: 0.9,
    whiteSpace: "nowrap",
  },
  invalidValue: {
    color: "#c1121f",
    fontWeight: 800,
  },
};
