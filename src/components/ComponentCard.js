import React from "react";
import { ViewSVG, DEFAULT_PX_PER_MM_X } from "./Graphic";

const formatNumber = (value, decimals = 1) => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num.toFixed(decimals);
};

function ValueRow({ label, value, unit }) {
  const display = value === null || value === undefined || value === "" ? "N/A" : value;
  return (
    <div style={styles.row}>
      <div style={styles.rowLabel}>{label} :</div>
      <div style={styles.rowValue}>
        {display}
        {value ? <span style={styles.rowUnit}>&nbsp;{unit}</span> : null}
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
}) {
  const layers = item?.structure?.layers ?? [];
  const title =
    item?.translations?.[lang]?.name ||
    item?.serialNo ||
    item?.id ||
    "";

  const thickness = formatNumber(item?.thickness_mm, 0);
  const weight = formatNumber(item?.weight_kg_m2, 0);
  const uValue = formatNumber(item?.uValue_W_m2K, 3);
  const gwp = formatNumber(item?.gwp_kgco2e_m2, 1);

  const airborne = formatNumber(item?.acoustic?.Rw_dB, 0);
  const impact = formatNumber(item?.acoustic?.Lnw_dB, 0);
  const fire = item?.fire_resistance?.REI_min ?? null;

  // Scale down SVG views to fit the card without cropping
  const svgScale = 0.15;
  const pxPerMmY = svgScale;
  const pxPerMmX = DEFAULT_PX_PER_MM_X * svgScale;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.title}>{title}</div>
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
              <ValueRow label={t.thickness ?? "Thickness"} value={thickness} unit="mm" />
              <ValueRow label={t.weight ?? "Weight"} value={weight} unit="kg/m2" />
              <ValueRow label={t.uValue ?? "U value"} value={uValue} unit="W/m2K" />
              <ValueRow label={t.gwp ?? "GWP"} value={gwp} unit="kgCO2e/m2" />
            </div>

            <div style={styles.sideValues}>
              <div style={styles.section}>
                <div style={styles.sectionTitle}>{t.acoustic_insulation ?? "Acoustic insulation"}</div>
                <ValueRow label={t.airborne_noise ?? "airborne noise"} value={airborne} unit="dB" />
                <ValueRow label={t.impact_noise ?? "impact noise"} value={impact} unit="dB" />
              </div>

              <div style={styles.section}>
                <div style={styles.sectionTitle}>{t.fire_protection ?? "Fire protection"}</div>
                <div style={styles.fireValue}>{fire ?? "N/A"}</div>
              </div>
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
  fireValue: {
    marginTop: "4px",
    fontSize: "16px",
    fontWeight: 600,
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
};
