import React, { useMemo } from "react";

/**
 * Assembly Sections Viewer
 * ------------------------------------------------------
 * Renders two SVG cuts (transverse & longitudinal) for a multi-layer assembly.
 * - Vertical axis always equals thickness (mm -> px 1:1 by default)
 * - Horizontal axis:
 *    • If NO layer exposes an entraxe (spacing) in the view -> 1000 mm
 *    • If a layer exposes an entraxe -> ensure at least TWO elements are fully visible.
 *      Additionally, we keep one element-width padding on both sides (first element starts at +width, last ends at -width),
 *      so the required width becomes: spacing + 3 × width (min 1000 mm).
 * - Layer stacking:
 *    • "on-lying": adds thickness and is stacked below previous layer
 *    • "in-lying": drawn *inside* the last on-lying cavity (**bottom-aligned** on that cavity)
 * - width_mm + spacing_mm together define repetitive elements.
 *    • If fiberDirection === null => spacing visible in TRANSVERSE
 *    • If fiberDirection === "lengthwise" => spacing visible in LONGITUDINAL
 * ------------------------------------------------------
 * Drop-in usage:
 *   <AssemblyViewer assembly={data} pxPerMmY={1} />
 */

// --- Demo data (shortened to only what's used by the renderer) ---
const DEMO = {
  id: "436346B4-4FB0-3E76-A7D9-ED83A13E17F4",
  translations: {
    fr: { name: "Plancher A0109 Raidisseurs / solives" },
  },
  structure: {
    layers: [
      { order: 0, structure: "on-lying", productName: "GF Fertigteilestrich", thickness_mm: 23, colorCode: "80E6F2" },
      { order: 1, structure: "on-lying", productName: "Holzweichfaser", thickness_mm: 22, colorCode: "FFFFFF" },
      { order: 2, structure: "on-lying", productName: "Massivholzplatte", thickness_mm: 25, colorCode: "BCBCBC" },
      { order: 3, structure: "overlaying centered", productName: "Steif" },
      // spacing visible in TRANSVERSE (fiberDirection null)
      { order: 4, structure: "on-lying", productName: "Rippe/Balken", thickness_mm: 280, width_mm: 140, spacing_mm: 1625, colorCode: "Transparent", fiberDirection: null },
      { order: 5, structure: "in-lying", productName: "Cavity insulation", thickness_mm: 200, colorCode: "F5F5F5" },
      { order: 6, structure: "overlaying centered", productName: "Steif" },
      // spacing visible in LONGITUDINAL (lengthwise)
      { order: 7, structure: "on-lying", productName: "Holzlatte", thickness_mm: 40, width_mm: 60, spacing_mm: 500, colorCode: "Transparent", fiberDirection: "lengthwise" },
      { order: 8, structure: "in-lying", productName: "Cavity insulation", thickness_mm: 40, colorCode: "F5F5F5" },
      { order: 9, structure: "on-lying", productName: "Gipsfaser", thickness_mm: 15, colorCode: "80E6F2" },
      { order: 10, structure: "on-lying", productName: "Fugen", thickness_mm: 0, colorCode: "80E6F2" },
    ],
  },
};

// ----------------- helpers -----------------
const mmColor = (code) => {
  if (!code || code === "Transparent") return "none";
  return code.startsWith("#") ? code : `#${code}`;
};

const needsSpacingInView = (layer, view /* 'transverse'|'longitudinal' (accepts fr synonyms) */) => {
  const v = String(view).toLowerCase();
  const isLong = v === "longitudinal" || v === "longitudinale";
  const isTrans = v === "transverse" || v === "transversal";
  if (!layer.width_mm || !layer.spacing_mm) return false;
  if (layer.fiberDirection === "lengthwise") {
    return isLong; // entraxe visible en coupe longitudinale
  }
  return isTrans; // null ou autre => transverse
};

const totalThickness = (layers) =>
  layers.reduce((sum, L) => (String(L.structure).startsWith("on-") ? sum + (L.thickness_mm || 0) : sum), 0);

const computeWidthMM = (layers, view) => {
  // default overall width if no spacing visible in this view
  let W = 1000; // mm
  for (const L of layers) {
    if (needsSpacingInView(L, view)) {
      const w = L.width_mm || 0;
      const s = L.spacing_mm || 0;
      // ensure at least two elements fully visible *and* one element-width padding on both sides
      // total needed width = leftPad(w) + spacing(s) + element width(w) + rightPad(w) = s + 3w
      const needed = s + 3 * w;
      if (needed > W) W = needed;
    }
  }
  return W;
};

// a very light hatch pattern id for outlines + arrow markers
const HatchDefs = () => (
  <defs>
    <pattern id="diagHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#999" strokeWidth="1" />
    </pattern>
    {/* arrow markers for horizontal dimensions (fine V, tips at exact ends) */}
    <marker id="arrowStart" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M6,0 L0,3 L6,6" fill="none" stroke="#0f766e" strokeWidth="1.5" strokeLinecap="round" />
    </marker>
    <marker id="arrowEnd" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0,0 L6,3 L0,6" fill="none" stroke="#0f766e" strokeWidth="1.5" strokeLinecap="round" />
    </marker>
  </defs>
);

// quick wavy fill for insulation (visual hint only)
const InsulationPattern = ({ id = "insul" }) => (
  <defs>
    <pattern id={id} patternUnits="userSpaceOnUse" width="40" height="20">
      <path d="M0,10 C10,0 30,20 40,10" fill="none" stroke="#9a9a9a" strokeWidth="1" />
    </pattern>
  </defs>
);

function LayerBand({
  layer,
  view,
  x0,
  y0,
  widthMM,
  heightMM,
  pxPerMmX,
  pxPerMmY,
  showDimensions,
}) {
  const showSpacing = needsSpacingInView(layer, view);
  const fill = mmColor(layer.colorCode);
  const stroke = layer.colorCode === "Transparent" ? "#777" : "#333";

  const x = x0 * pxPerMmX;
  const y = y0 * pxPerMmY;
  const w = widthMM * pxPerMmX;
  const h = heightMM * pxPerMmY;

  if (showSpacing) {
    // repeated elements as vertical posts inside the band
    const wElm = layer.width_mm || 0;
    const s = layer.spacing_mm || 0;

    // Per-element white underlay to prevent seeing background through patterned fills (no band-wide occlusion)
    const leftPad = wElm; // shift first element to the right by its width
    const rightPad = wElm; // keep last element away from the right border

    const positions = [];
    for (let xi = leftPad; xi <= widthMM - rightPad - wElm + 1e-6; xi += s) {
      positions.push(xi);
    }

    const firstPos = positions[0] ?? leftPad;
    const lastPos = positions.length ? positions[positions.length - 1] : firstPos;
    const coverageLeft = firstPos;
    const coverageRight = lastPos + wElm;
    const coverageWidth = coverageRight - coverageLeft;
    const extraSpace = Math.max(0, widthMM - coverageWidth);
    const centeringOffset = positions.length ? extraSpace / 2 - coverageLeft : 0;

    const items = positions.map((xi) => {
      const rx = (x0 + xi + centeringOffset) * pxPerMmX;
      const rw = wElm * pxPerMmX;
      return (
        <g key={`rep-${xi}`}>
          {/* white underlay exactly matching the element's footprint */}
          <rect x={rx} y={y} width={rw} height={h} fill="#ffffff" stroke="none" />
          {/* actual element */}
          <rect x={rx} y={y} width={rw} height={h} fill={fill === "none" ? "url(#diagHatch)" : fill} stroke={stroke} />
          {/* decorative cross */}
          <line x1={rx} y1={y} x2={rx + rw} y2={y + h} stroke="#666" strokeWidth={1} />
          <line x1={rx + rw} y1={y} x2={rx} y2={y + h} stroke="#666" strokeWidth={1} />
        </g>
      );
    });

    // add horizontal dimensions (width & spacing) using the first two elements
    const dims = [];
    if (showDimensions && positions.length >= 2) {
      const firstStart = firstPos + centeringOffset;
      const baseY = y - 12; // draw above the band
      const xStart = (x0 + firstStart) * pxPerMmX; // dimension from first element start
      const wElmPx = (layer.width_mm || 0) * pxPerMmX;
      const spacingPx = (layer.spacing_mm || 0) * pxPerMmX;

      // width over first element
      dims.push(
        <g key="dim-width">
          <line x1={xStart} y1={baseY} x2={xStart + wElmPx} y2={baseY} stroke="#0f766e" strokeWidth={2}
                markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
          <text x={xStart + wElmPx / 2} y={baseY - 4} textAnchor="middle" fontSize={12} fill="#0f766e">
            {`${(layer.width_mm || 0).toFixed(0)} mm`}
          </text>
        </g>
      );

      // spacing between start of element 1 and start of element 2
      dims.push(
        <g key="dim-spacing">
          <line x1={xStart} y1={baseY - 18} x2={xStart + spacingPx} y2={baseY - 18} stroke="#0f766e" strokeWidth={2}
                markerStart="url(#arrowStart)" markerEnd="url(#arrowEnd)" />
          <text x={xStart + spacingPx / 2} y={baseY - 22} textAnchor="middle" fontSize={12} fill="#0f766e">
            {`${(layer.spacing_mm || 0).toFixed(0)} mm entraxe`}
          </text>
        </g>
      );
    }

    return <g>{items}{dims}</g>;
  }

  // non-repetitive – full-width layer
  return (
    <rect x={x} y={y} width={w} height={h} fill={fill === "none" ? "url(#diagHatch)" : fill} stroke={stroke} />
  );
}

function ThicknessTicks({ yTopMM, yBotMM, pxPerMmY, xTick = 18, color = "#2ecc71" }) {
  const yTop = yTopMM * pxPerMmY;
  const yBot = yBotMM * pxPerMmY;
  const mid = (yTop + yBot) / 2;
  const mk = 7;
  return (
    <g>
      <line x1={xTick} y1={yTop} x2={xTick} y2={yBot} stroke={color} strokeWidth={2} />
      <line x1={xTick - mk} y1={yTop} x2={xTick + mk} y2={yTop} stroke={color} strokeWidth={3} />
      <line x1={xTick - mk} y1={yBot} x2={xTick + mk} y2={yBot} stroke={color} strokeWidth={3} />
      <circle cx={xTick} cy={mid} r={2.5} fill={color} />
    </g>
  );
}

function ThicknessLabel({ yTopMM, yBotMM, pxPerMmY, text, x = 28 }) {
  const yTop = yTopMM * pxPerMmY;
  const yBot = yBotMM * pxPerMmY;
  const mid = (yTop + yBot) / 2 + 4;
  return (
    <text x={x} y={mid} fontSize={12} fill="#1e293b">{text}</text>
  );
}

export function ViewSVG({ title, layers, view, pxPerMmY = 1, pxPerMmX, className, showDimensions = true }) {
  // compute overall sizes
  const H_mm = totalThickness(layers);
  const W_mm = computeWidthMM(layers, view);

  const margin = showDimensions
    ? { top: 16, right: 16, bottom: 16, left: 80 }
    : { top: 10, right: 10, bottom: 10, left: 10 };
  const W_px = W_mm * pxPerMmX + margin.left + margin.right;
  const H_px = H_mm * pxPerMmY + margin.top + margin.bottom;

  // build bands
  let cursorY = 0; // mm from top
  let lastOnLyingSpan = null; // {y0,y1}
  let lastOnLyingIndex = -1; // DOM index of the last on-lying band in 'bands'

  const bands = [];
  const ticks = [];

  layers
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((L, idx) => {
      if (String(L.structure).startsWith("on-")) {
        const h = Math.max(0, L.thickness_mm || 0);
        if (h <= 0) return; // skip zero bands visually
        const y0 = cursorY;
        const y1 = y0 + h;

        // remember DOM insertion index for this on-lying band (to keep future in-lying behind it)
        lastOnLyingIndex = bands.length;
        bands.push(
          <LayerBand
            key={`band-${idx}`}
            layer={L}
            view={view}
            x0={0}
            y0={y0}
            widthMM={W_mm}
            heightMM={h}
            pxPerMmX={pxPerMmX}
            pxPerMmY={pxPerMmY}
            showDimensions={showDimensions}
          />
        );

        // thickness indicator (left side)
        if (showDimensions) {
          ticks.push(
            <g key={`tick-${idx}`}>
              <ThicknessTicks yTopMM={y0} yBotMM={y1} pxPerMmY={pxPerMmY} />
              <ThicknessLabel yTopMM={y0} yBotMM={y1} pxPerMmY={pxPerMmY} text={`${h.toFixed(0)} mm`} />
            </g>
          );
        }

        lastOnLyingSpan = { y0, y1 };
        cursorY += h;
      } else if (String(L.structure).startsWith("in-")) {
        if (!lastOnLyingSpan) return;
        const h = Math.max(0, L.thickness_mm || 0);
        if (h <= 0) return;
        const y0 = lastOnLyingSpan.y1 - h; // bottom-aligned inside the previous on-lying cavity
        const inlyingNode = (
          <g key={`in-${idx}`}>
            <InsulationPattern id={`ins-${idx}`} />
            <rect
              x={0}
              y={y0 * pxPerMmY}
              width={W_mm * pxPerMmX}
              height={h * pxPerMmY}
              fill={`url(#ins-${idx})`}
              stroke="#bdbdbd"
            />
          </g>
        );
        // insert *behind* the last on-lying band so repetitive elements stay in true foreground
        const insertAt = Math.max(0, lastOnLyingIndex);
        bands.splice(insertAt, 0, inlyingNode);
      }
    });

  return (
    <div className={"w-full" + (className ? ` ${className}` : "") }>
      {showDimensions && (
        <div className="flex items-center gap-2 mb-2">
          <div className="text-sm text-slate-600 font-medium">{title}</div>
          <div className="text-xs text-slate-400">(W = {W_mm.toFixed(0)} mm · H = {H_mm.toFixed(0)} mm)</div>
        </div>
      )}
      <svg width={W_px} height={H_px} className="bg-white rounded-2xl shadow border border-slate-200">
        <HatchDefs />
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* outer frame */}
          <rect x={0} y={0} width={W_mm * pxPerMmX} height={H_mm * pxPerMmY} fill="none" stroke="#94a3b8" />
          {/* content */}
          {bands}
          {/* thickness ticks & labels (left margin) */}
          <g transform={`translate(${-margin.left + 30}, 0)`}>{ticks}</g>
        </g>
      </svg>
    </div>
  );
}

// ---------------- Tests (visual) ----------------
// These cases help validate behaviors quickly without changing the main demo above.
const TESTS = {
  noSpacing: {
    translations: { fr: { name: "TEST — Sans entraxe" } },
    structure: {
      layers: [
        { order: 0, structure: "on-lying", productName: "A", thickness_mm: 40, colorCode: "CCCCCC" },
        { order: 1, structure: "on-lying", productName: "B", thickness_mm: 60, colorCode: "EEEEEE" },
      ],
    },
  },
  transverseSpacing: {
    translations: { fr: { name: "TEST — Entraxe transverse" } },
    structure: {
      layers: [
        { order: 0, structure: "on-lying", thickness_mm: 30, colorCode: "BBBBBB" },
        { order: 1, structure: "on-lying", thickness_mm: 120, width_mm: 100, spacing_mm: 300, colorCode: "Transparent", fiberDirection: null },
        { order: 2, structure: "in-lying", thickness_mm: 80, colorCode: "F5F5F5" },
      ],
    },
  },
  longitudinalSpacing: {
    translations: { fr: { name: "TEST — Entraxe longitudinal" } },
    structure: {
      layers: [
        { order: 0, structure: "on-lying", thickness_mm: 20, colorCode: "E0E0E0" },
        { order: 1, structure: "on-lying", thickness_mm: 100, width_mm: 80, spacing_mm: 400, colorCode: "Transparent", fiberDirection: "lengthwise" },
        { order: 2, structure: "on-lying", thickness_mm: 12, colorCode: "80E6F2" },
      ],
    },
  },
  edgePaddingWiderThan1000: {
    translations: { fr: { name: "TEST — Décalage 1 largeur de chaque côté (W > 1000)" } },
    structure: {
      layers: [
        { order: 0, structure: "on-lying", thickness_mm: 30, colorCode: "DDDDEE" },
        // width=120, spacing=900 ⇒ required W = s + 3w = 1260 (>1000)
        { order: 1, structure: "on-lying", thickness_mm: 140, width_mm: 120, spacing_mm: 900, colorCode: "Transparent", fiberDirection: null },
        { order: 2, structure: "on-lying", thickness_mm: 12, colorCode: "CCCCCC" },
      ],
    },
  },
  longitudinalEdgePaddingWiderThan1000: {
    translations: { fr: { name: "TEST — Longitudinal + padding (W > 1000)" } },
    structure: {
      layers: [
        { order: 0, structure: "on-lying", thickness_mm: 22, colorCode: "EDEDED" },
        // width=90, spacing=850 ⇒ required W = 1120 (>1000)
        { order: 1, structure: "on-lying", thickness_mm: 120, width_mm: 90, spacing_mm: 850, colorCode: "Transparent", fiberDirection: "lengthwise" },
        { order: 2, structure: "on-lying", thickness_mm: 15, colorCode: "D0D0F0" },
      ],
    },
  },
};

export const DEFAULT_PX_PER_MM_X = 0.8; // 1000 mm -> 800 px

export default function AssemblyViewer({ assembly = DEMO, pxPerMmY = 1 }) {
  const layers = useMemo(() => (assembly?.structure?.layers ?? []).slice().sort((a,b)=> (a.order??0)-(b.order??0)), [assembly]);

  // Horizontal scale: aim for 1000mm ≈ 800px by default
  const pxPerMmX = DEFAULT_PX_PER_MM_X;

  const name = assembly?.translations?.fr?.name || assembly?.translations?.en?.name || "Assemblage";

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-[60vh]">
      <div className="max-w-full mx-auto">
        <h1 className="text-xl md:text-2xl font-semibold text-slate-800 mb-1">{name}</h1>
        <p className="text-slate-500 mb-4">Coupe transverse et coupe longitudinale. L'épaisseur est représentée verticalement (mm → px 1:1).</p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ViewSVG title="Coupe transverse" layers={layers} view="transverse" pxPerMmY={pxPerMmY} pxPerMmX={pxPerMmX} />
          <ViewSVG title="Coupe longitudinale" layers={layers} view="longitudinal" pxPerMmY={pxPerMmY} pxPerMmX={pxPerMmX} />
        </div>

        {/* Visual tests */}
        <details className="mt-6">
          <summary className="cursor-pointer text-slate-700">Afficher les tests visuels</summary>
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ViewSVG title={TESTS.noSpacing.translations.fr.name} layers={TESTS.noSpacing.structure.layers} view="transverse" pxPerMmY={pxPerMmY} pxPerMmX={pxPerMmX} />
            <ViewSVG title={TESTS.transverseSpacing.translations.fr.name} layers={TESTS.transverseSpacing.structure.layers} view="transverse" pxPerMmY={pxPerMmY} pxPerMmX={pxPerMmX} />
            <ViewSVG title={TESTS.longitudinalSpacing.translations.fr.name} layers={TESTS.longitudinalSpacing.structure.layers} view="longitudinal" pxPerMmY={pxPerMmY} pxPerMmX={pxPerMmX} />
            <ViewSVG title={TESTS.edgePaddingWiderThan1000.translations.fr.name} layers={TESTS.edgePaddingWiderThan1000.structure.layers} view="transverse" pxPerMmY={pxPerMmY} pxPerMmX={pxPerMmX} />
            <ViewSVG title={TESTS.longitudinalEdgePaddingWiderThan1000.translations.fr.name} layers={TESTS.longitudinalEdgePaddingWiderThan1000.structure.layers} view="longitudinal" pxPerMmY={pxPerMmY} pxPerMmX={pxPerMmX} />
          </div>
        </details>

        <div className="mt-4 text-xs text-slate-500">
          Règles d'affichage : si un entraxe (spacing) existe et est visible dans la vue, la largeur du dessin assure au moins deux éléments complets, avec une marge d'une largeur de part et d'autre. Sans entraxe visible, la largeur vaut 1000 mm.
        </div>
      </div>
    </div>
  );
}
