import React, { useCallback, useEffect, useMemo, useState } from "react";
import acousticRequirementsDb from "../data/acoustic_requirements.json";
import { getRequirementCategoryIds } from "../utils/componentTaxonomy";

export default function AcousticRequirementsModule({
  lang = "fr",
  onApplyChange,
  resetApplySignal = 0,
  initialSelection = null,
  initialApplied = false,
}) {
  const [db] = useState(acousticRequirementsDb);
  const [requirementLevel, setRequirementLevel] = useState(initialSelection?.requirement_level ?? "normal");
  const [uncertainty, setUncertainty] = useState(initialSelection?.uncertainty_dB ?? 2);
  const [applyToFilters, setApplyToFilters] = useState(Boolean(initialApplied));

  useEffect(() => {
    if (!resetApplySignal) return;
    setApplyToFilters(false);
  }, [resetApplySignal]);

  const tr = useCallback((obj) => {
    if (!obj) return "";
    return obj[lang] ?? obj.fr ?? obj.en ?? "";
  }, [lang]);

  const levelOptions = useMemo(() => {
    if (!db) return [];
    return (db.dropdowns?.requirement_level ?? []).map((id) => ({
      id,
      label: tr(db.i18n?.requirement_level?.[id]) || id,
    }));
  }, [db, tr]);

  const elementsById = useMemo(() => {
    if (!db?.elements) return new Map();
    return new Map(db.elements.map((el) => [el.id, el]));
  }, [db]);

  useEffect(() => {
    if (!db || requirementLevel) return;
    const first = db.dropdowns?.requirement_level?.[0];
    if (first) setRequirementLevel(first);
  }, [db, requirementLevel]);

  const matchedRule = useMemo(() => {
    if (!db) return null;
    return db.rules?.find((rule) => rule.requirement_level === requirementLevel) ?? null;
  }, [db, requirementLevel]);

  const resolvedRequirements = useMemo(() => {
    if (!db || !matchedRule) return [];

    return (matchedRule.requirements ?? []).map((req) => {
      const element = elementsById.get(req.element_id);
      const categoryTargets = getRequirementCategoryIds(req).map((categoryId) => {
        const sourceCategoryId = ["inner_wall", "partition_wall"].includes(categoryId)
          ? req.applies_to?.[0]?.categoryId
          : categoryId;
        const inElTargets = element?.targets?.find((item) => item.categoryId === sourceCategoryId);
        const canonicalLabel = categoryId === "inner_wall"
          ? { fr: "Paroi intérieure", de: "Innenwand", en: "Interior wall", it: "Parete interna" }
          : categoryId === "partition_wall"
            ? { fr: "Cloison", de: "Trennwand", en: "Partition", it: "Parete divisoria" }
            : null;
        const baseLabel = tr(canonicalLabel) || tr(inElTargets?.label) || categoryId;
        const subtypeLabel =
          req.subtype_id && element?.subtypes
            ? tr(element.subtypes.find((subtype) => subtype.id === req.subtype_id)?.label) || ""
            : "";
        return {
          categoryId,
          label: [baseLabel, subtypeLabel].filter(Boolean).join(" "),
        };
      });

      return {
        element_id: req.element_id,
        subtype_id: req.subtype_id,
        displayText: tr(req.display),
        categoryTargets,
        filter: req.filter ?? null,
      };
    });
  }, [db, matchedRule, elementsById, tr]);

  useEffect(() => {
    if (!onApplyChange) return;
    const numericUncertainty = Number(uncertainty);
    onApplyChange({
      applied: applyToFilters,
      selection: {
        requirement_level: requirementLevel,
        uncertainty_dB: Number.isFinite(numericUncertainty) ? numericUncertainty : 0,
      },
      requirements: resolvedRequirements,
    });
  }, [applyToFilters, requirementLevel, uncertainty, resolvedRequirements, onApplyChange]);

  const formatRequirementLabel = (req) => {
    if (req.categoryTargets?.length) {
      return req.categoryTargets.map((target) => target.label).filter(Boolean).join(" / ");
    }
    const element = elementsById.get(req.element_id);
    const elementLabel = tr(element?.label) || req.element_id;
    const subtypeLabel =
      req.subtype_id && element?.subtypes
        ? tr(element.subtypes.find((subtype) => subtype.id === req.subtype_id)?.label) || ""
        : "";
    return [elementLabel, subtypeLabel].filter(Boolean).join(" ");
  };

  const renderRequirementText = (text) => {
    const markers = ["Bruits de choc:", "Impact sound:", "Trittschall:", "Rumore da impatto:"];
    const marker = markers.find((item) => text.includes(item));
    if (!marker) return <div style={{ opacity: 0.9 }}>{text}</div>;

    const markerIndex = text.indexOf(marker);
    const firstLine = text.slice(0, markerIndex).trim().replace(/\.$/, "");
    const secondLine = text.slice(markerIndex).trim();

    return (
      <div style={{ opacity: 0.9 }}>
        <div>{firstLine}</div>
        <div>{secondLine}</div>
      </div>
    );
  };

  const title =
    lang === "fr"
      ? "Exigences acoustiques"
      : lang === "de"
      ? "Schallschutzanforderungen"
      : lang === "it"
      ? "Requisiti acustici"
      : "Acoustic requirements";

  if (!db) {
    return (
      <div style={boxStyle}>
        <div style={titleStyle}>{title}</div>
        <div style={{ color: "crimson" }}>
          Impossible de charger <code>src/data/acoustic_requirements.json</code>
        </div>
      </div>
    );
  }

  const noRule = !matchedRule;

  return (
    <div
      style={{
        border: "1px solid #a9c4c8",
        padding: "16px",
        borderRadius: "12px",
        marginBottom: "12px",
        backgroundColor: "#d7ecef",
      }}
    >
      <h2>{title}</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
        <SelectField
          label={
            lang === "fr"
              ? "Exigences"
              : lang === "de"
              ? "Anforderungen"
              : lang === "it"
              ? "Requisiti"
              : "Requirements"
          }
          value={requirementLevel}
          onChange={setRequirementLevel}
          options={levelOptions}
        />

        <NumberField
          label={
            lang === "fr"
              ? "Incertitude"
              : lang === "de"
              ? "Unsicherheit"
              : lang === "it"
              ? "Incertezza"
              : "Uncertainty"
          }
          value={uncertainty}
          onChange={setUncertainty}
          unit="dB"
        />
      </div>

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
              ? "Aucune regle trouvee pour cette combinaison."
              : lang === "de"
              ? "Keine Regel fuer diese Kombination gefunden."
              : lang === "it"
              ? "Nessuna regola trovata per questa combinazione."
              : "No rule found for this combination."}
          </div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {resolvedRequirements.map((req, idx) => (
              <li key={`${req.element_id}-${req.subtype_id}-${idx}`} style={{ marginBottom: "8px" }}>
                <div style={{ fontWeight: 600 }}>{formatRequirementLabel(req)}</div>
                {renderRequirementText(req.displayText)}
              </li>
            ))}
          </ul>
        )}
      </div>

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

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: "6px" }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: "10px",
          border: "1px solid #bbb",
          background: "#fff",
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberField({ label, value, onChange, unit }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: "6px" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="number"
          min="0"
          step="0.5"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid #bbb",
            background: "#fff",
          }}
        />
        <span style={{ fontWeight: 700 }}>{unit}</span>
      </div>
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
