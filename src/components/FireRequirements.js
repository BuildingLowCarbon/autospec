import React, { useEffect, useMemo, useState } from "react";
import translations from '../language/translations';
// Mais le module utilise surtout les libellés du JSON de fire_requirements

/**
 * Props:
 * - lang: "fr" | "en" | "de" | "it"
 * - onApplyChange: (payload) => void
 *    payload = {
 *      applied: boolean,
 *      selection: { use, building_type, building_height, neighbor_distance },
 *      requirements: Array<RequirementResolved>
 *    }
 *
 * RequirementResolved (exemple):
 * {
 *   element_id,
 *   subtype_id,
 *   bearing_id,
 *   displayText,
 *   categoryTargets: [{categoryId, label}],
 *   filter,
 * }
 */
export default function FireRequirementModule({ lang = "fr", onApplyChange, resetApplySignal = 0 }) {
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sélections
  const [useVal, setUseVal] = useState("residential");
  const [buildingType, setBuildingType] = useState("");
  const [buildingHeight, setBuildingHeight] = useState("");
  const [neighborDistance, setNeighborDistance] = useState("gt_10");

  const [applyToFilters, setApplyToFilters] = useState(false);

  useEffect(() => {
    if (!resetApplySignal) return;
    setApplyToFilters(false);
  }, [resetApplySignal]);

  // Load JSON from public
  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/fire_requirements.json");
        const json = await res.json();
        if (!canceled) setDb(json);
      } catch (e) {
        console.error("Failed to load fire_requirements.json:", e);
        if (!canceled) setDb(null);
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, []);

  // Helpers i18n from db
  const tr = (obj) => {
    if (!obj) return "";
    return obj[lang] ?? obj.fr ?? obj.en ?? "";
  };

  // Options (dépendent de db)
  const useOptions = useMemo(() => {
    if (!db) return [];
    return (db.dropdowns?.use ?? []).map((id) => ({
      id,
      label: tr(db.i18n?.use?.[id]),
    }));
  }, [db, lang]);

  const buildingTypeOptions = useMemo(() => {
    if (!db) return [];
    return (db.dropdowns?.building_type ?? []).map((id) => ({
      id,
      label: tr(db.i18n?.building_type?.[id]),
    }));
  }, [db, lang]);

  const buildingHeightOptions = useMemo(() => {
    if (!db || !buildingType) return [];
    const ids = db.dropdowns?.building_height?.[buildingType] ?? [];
    return ids.map((id) => ({
      id,
      label: tr(db.i18n?.building_height?.[id]),
    }));
  }, [db, lang, buildingType]);

  const neighborDistanceOptions = useMemo(() => {
    if (!db) return [];
    return (db.dropdowns?.neighbor_façade_distance ?? []).map((id) => ({
      id,
      label: tr(db.i18n?.neighbor_distance?.[id]),
    }));
  }, [db, lang]);

  const elementsById = useMemo(() => {
    if (!db?.elements) return new Map();
    return new Map(db.elements.map((el) => [el.id, el]));
  }, [db]);

  // Initial defaults once db loaded
  useEffect(() => {
    if (!db) return;

    // use
    if (!useVal && useOptions.length > 0) setUseVal(useOptions[0].id);

    // building type default
    if (!buildingType && buildingTypeOptions.length > 0) {
      setBuildingType(buildingTypeOptions[0].id);
    }
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  // When building type changes: force a valid height
  useEffect(() => {
    if (!db) return;
    const allowed = db.dropdowns?.building_height?.[buildingType] ?? [];
    if (!allowed.length) {
      setBuildingHeight("");
      return;
    }
    if (!allowed.includes(buildingHeight)) {
      setBuildingHeight(allowed[0]);
    }
  }, [buildingType, db]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find the matching rule
  const matchedRule = useMemo(() => {
    if (!db) return null;
    if (!useVal || !buildingType || !buildingHeight) return null;

    const rules = db.rules ?? [];
    return (
      rules.find((r) => {
        const c = r.conditions ?? {};
        return (
          c.use === useVal &&
          c.building_type === buildingType &&
          c.building_height === buildingHeight
        );
      }) ?? null
    );
  }, [db, useVal, buildingType, buildingHeight]);

  // Resolve requirements considering neighbor distance (for outer walls)
  const resolvedRequirements = useMemo(() => {
    if (!db || !matchedRule) return [];

    const reqs = matchedRule.requirements ?? [];

    const neighborCondValue = neighborDistance === "gt_10" ? ">10" : "<=10";

    const resolved = reqs
      .filter((req) => {
        // if rule has extra neighbor constraint, enforce it
        const extra = req.conditions_extra;
        if (extra?.neighbor_façade_distance_m) {
          return extra.neighbor_façade_distance_m === neighborCondValue;
        }
        return true;
      })
      .map((req) => {
        const el = elementsById.get(req.element_id);
        const displayText = tr(req.display);

        // Map applies_to categories to labels
        const categoryTargets =
          (req.applies_to ?? []).map((t) => {
            const catId = t.categoryId;

            // 1) libellé générique de la catégorie (ex: "Paroi porteuse")
            const inElTargets = el?.targets?.find((x) => x.categoryId === catId);
            const baseLabel = tr(inElTargets?.label) || catId;

            // 2) libellé spécifique (ex: "(même unité)" / "(entre unités)" + porteur/non-porteur)
            const subtypeLabel =
              req.subtype_id && el?.subtypes
                ? tr(el.subtypes.find((s) => s.id === req.subtype_id)?.label) || ""
                : "";
            const bearingLabel = (() => {
              if (!req.bearing_id) return "";
              if (el?.bearing) {
                const match = el.bearing.find((b) => b.id === req.bearing_id);
                if (match) return tr(match.label) || "";
              }
              return tr(db?.i18n?.bearing?.[req.bearing_id]) || req.bearing_id || "";
            })();

            // Exemple final : "Paroi porteuse (même unité)"
            const fullLabel = [baseLabel, subtypeLabel, bearingLabel]
              .filter(Boolean)
              .join(" ");

            return {
              categoryId: catId,
              label: fullLabel,
            };
          }) ?? [];

        return {
          element_id: req.element_id,
          subtype_id: req.subtype_id,
          bearing_id: req.bearing_id ?? null,
          displayText,
          categoryTargets,
          filter: req.filter ?? null,
        };
      });

    return resolved;
  }, [db, matchedRule, neighborDistance, lang, elementsById]);

  // Notify parent when apply toggle or resolved requirements change
  useEffect(() => {
    if (!onApplyChange) return;

    onApplyChange({
      applied: applyToFilters,
      selection: {
        use: useVal,
        building_type: buildingType,
        building_height: buildingHeight,
        neighbor_distance: neighborDistance,
      },
      requirements: resolvedRequirements,
    });
  }, [
    applyToFilters,
    useVal,
    buildingType,
    buildingHeight,
    neighborDistance,
    resolvedRequirements,
    onApplyChange,
  ]);

  const formatRequirementLabel = (req) => {
    const element = elementsById.get(req.element_id);
    const elementLabel = tr(element?.label) || req.element_id;

    const subtype =
      element?.subtypes?.find((s) => s.id === req.subtype_id)?.label ?? null;
    const subtypeLabel = subtype ? tr(subtype) : "";

    const bearing =
      element?.bearing?.find((b) => b.id === req.bearing_id)?.label ??
      db?.i18n?.bearing?.[req.bearing_id] ??
      null;
    const bearingLabel = bearing ? tr(bearing) : req.bearing_id || "";

    return [elementLabel, subtypeLabel, bearingLabel].filter(Boolean).join(" ");
  };

  if (loading) {
    return (
      <div style={boxStyle}>
        <div style={titleStyle}>Fire requirements</div>
        <div style={{ opacity: 0.7 }}>Loading…</div>
      </div>
    );
  }

  if (!db) {
    return (
      <div style={boxStyle}>
        <div style={titleStyle}>Fire requirements</div>
        <div style={{ color: "crimson" }}>
          Impossible de charger <code>/fire_requirements.json</code>
        </div>
      </div>
    );
  }

  const noRule = !matchedRule;

  return (
    <div style={boxStyle}>
      <div style={titleStyle}>
        {lang === "fr"
          ? "Exigences feu"
          : lang === "de"
          ? "Brandschutzanforderungen"
          : lang === "it"
          ? "Requisiti antincendio"
          : "Fire requirements"}
      </div>

      {/* Controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* Use */}
        <SelectField
          label={lang === "fr" ? "Usage" : lang === "de" ? "Nutzung" : lang === "it" ? "Uso" : "Use"}
          value={useVal}
          onChange={setUseVal}
          options={useOptions}
          disabled={useOptions.length <= 1}
        />

        {/* Building type */}
        <SelectField
          label={lang === "fr" ? "Type de bâtiment" : lang === "de" ? "Gebäudetyp" : lang === "it" ? "Tipo edificio" : "Building type"}
          value={buildingType}
          onChange={setBuildingType}
          options={buildingTypeOptions}
          disabled={buildingTypeOptions.length <= 1}
        />

        {/* Building height */}
        <SelectField
          label={lang === "fr" ? "Hauteur" : lang === "de" ? "Gebäudehöhe" : lang === "it" ? "Altezza" : "Building height"}
          value={buildingHeight}
          onChange={setBuildingHeight}
          options={buildingHeightOptions}
          disabled={buildingHeightOptions.length <= 1}
        />

        {/* Neighbor facade distance */}
        <SelectField
          label={
            lang === "fr"
              ? "Distance façade voisine"
              : lang === "de"
              ? "Nachbarfassadenabstand"
              : lang === "it"
              ? "Distanza facciata vicina"
              : "Neighbor façade distance"
          }
          value={neighborDistance}
          onChange={setNeighborDistance}
          options={neighborDistanceOptions}
        />
      </div>

      {/* Requirements */}
      <div style={{ marginTop: "14px" }}>
        <div style={{ fontWeight: 700, marginBottom: "6px" }}>
          {lang === "fr"
            ? "Exigences applicables"
            : lang === "de"
            ? "Anwendbare Anforderungen"
            : lang === "it"
            ? "Requisiti applicabili"
            : "Applicable requirements"}
        </div>

        {noRule ? (
          <div style={{ opacity: 0.75 }}>
            {lang === "fr"
              ? "Aucune règle trouvée pour cette combinaison."
              : lang === "de"
              ? "Keine Regel für diese Kombination gefunden."
              : lang === "it"
              ? "Nessuna regola trovata per questa combinazione."
              : "No rule found for this combination."}
          </div>
        ) : resolvedRequirements.length === 0 ? (
          <div style={{ opacity: 0.75 }}>
            {lang === "fr"
              ? "Aucune exigence (ou règles à compléter)."
              : lang === "de"
              ? "Keine Anforderungen (oder Regeln unvollständig)."
              : lang === "it"
              ? "Nessun requisito (o regole da completare)."
              : "No requirements (or rules incomplete)."}
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {resolvedRequirements.map((r, idx) => (
              <li key={`${r.element_id}-${idx}`} style={{ marginBottom: "8px" }}>
                <div style={{ fontWeight: 600 }}>{formatRequirementLabel(r)}</div>
                <div style={{ opacity: 0.9 }}>{r.displayText}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Apply to filters */}
      <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="checkbox"
          checked={applyToFilters}
          onChange={(e) => setApplyToFilters(e.target.checked)}
          disabled={noRule || resolvedRequirements.length === 0}
        />
        <div style={{ fontWeight: 600 }}>
          {lang === "fr"
            ? "Appliquer aux filtres"
            : lang === "de"
            ? "Auf Filter anwenden"
            : lang === "it"
            ? "Applica ai filtri"
            : "Apply to filters"}
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled = false }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: "6px" }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "10px",
          border: "1px solid #bbb",
          background: disabled ? "#f3f3f3" : "#fff",
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const boxStyle = {
  border: "1px solid #ccc",
  borderRadius: "10px",
  padding: "12px",
  backgroundColor: "#fff",
  marginTop: "12px",
};

const titleStyle = {
  fontSize: "16px",
  fontWeight: 800,
  marginBottom: "12px",
};
