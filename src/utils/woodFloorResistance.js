import sia265Data from '../data/sia265.json' with { type: 'json' };

/**
 * Calcul simplifié de portée pour poutre bois simplement appuyée (2 pivots)
 * selon une lecture opérationnelle de SIA 260 / 261 / 265.
 *
 * IMPORTANT :
 * - Ce code est un outil de prédimensionnement / automatisation.
 * - Il ne remplace pas un projet d’ingénierie complet.
 * - Déversement, vibrations, entailles, trous, assemblages, appuis locaux,
 *   compression perpendiculaire au fil, stabilité globale, etc. ne sont pas
 *   traités ici.
 *
 * UNITÉS :
 * - dimensions en mm
 * - charges surfaciques en kN/m²
 * - charges linéiques en kN/m
 * - résistances en N/mm²
 * - modules E en N/mm²
 * - portées en m
 */

/* ========================================================================== */
/* 1) BASES DE DONNÉES PARAMÉTRABLES                                          */
/* ========================================================================== */

/**
 * Types de locaux / charges d’exploitation
 * Source : SIA 261:2020, chap. 8, tableau 8
 * - A = habitation : qk = 2.0 kN/m²
 * - B = bureaux    : qk = 3.0 kN/m²
 * - C, D, F, G, H 
 * Remarque :
 * Les catégories E (entrepôts / fabrication) doivent être définies
 * selon le projet ; la norme ne donne pas une valeur unique générale.
 */
const OCCUPANCY = {
  A1_habitation: {
    label: "Habitation",
    qk_kN_m2: 2.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie A1"
  },
  A2_balcon: {
    label: "Balcon",
    qk_kN_m2: 3.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie A2"
  },
  A3_escalier: {
    label: "Escalier habitation",
    qk_kN_m2: 4.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie A3"
  },
  B_bureaux: {
    label: "Bureaux",
    qk_kN_m2: 3.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie B"
  },
  C1_reunion_tables: {
    label: "Locaux de réunion avec tables/chaises",
    qk_kN_m2: 3.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie C1"
  },
  C2_reunion_sieges_fixes: {
    label: "Locaux de réunion à sièges fixes",
    qk_kN_m2: 4.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie C2"
  },
  C3_reunion_libre: {
    label: "Locaux de réunion librement accessibles / sport / jeu",
    qk_kN_m2: 5.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie C3"
  },
  D_vente: {
    label: "Surfaces de vente",
    qk_kN_m2: 5.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie D"
  },
  F_parking_lt_3_5t: {
    label: "Parking < 3.5 t",
    qk_kN_m2: 2.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie F"
  },
  G_parking_3_5t_16t: {
    label: "Parking / accès 3.5 t à 16 t",
    qk_kN_m2: 5.0,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie G"
  },
  H_toiture_non_accessible: {
    label: "Toiture non accessible",
    qk_kN_m2: 0.4,
    source: "SIA 261:2020, chap. 8, tableau 8, catégorie H"
  },
  CUSTOM: {
    label: "Charge d'exploitation personnalisée",
    qk_kN_m2: null,
    source: "Valeur entrée par l’utilisateur"
  }
};

/**
 * Critères de flèche indicatifs
 * Source : SIA 260:2013, annexe A, tableau 3
 */
const DEFLECTION_LIMITS = {
  fragile_incorporated: {
    label: "Éléments incorporés fragiles",
    ratio: 500,
    source: "SIA 260:2013, annexe A, tableau 3"
  },
  ductile_incorporated: {
    label: "Éléments incorporés ductiles",
    ratio: 350,
    source: "SIA 260:2013, annexe A, tableau 3"
  },
  use_operation: {
    label: "Utilisation et exploitation",
    ratio: 350,
    source: "SIA 260:2013, annexe A, tableau 3"
  },
  comfort: {
    label: "Confort",
    ratio: 350,
    source: "SIA 260:2013, annexe A, tableau 3"
  },
  appearance: {
    label: "Aspect",
    ratio: 300,
    source: "SIA 260:2013, annexe A, tableau 3"
  },
  CUSTOM: {
    label: "Critère personnalisé",
    ratio: null,
    source: "Valeur entrée par l’utilisateur"
  }
};

/* Caracteristiques bois et vitesses de combustion centralisees dans src/data/sia265.json. */

/* ========================================================================== */
/* 2) OUTILS GÉNÉRAUX                                                         */
/* ========================================================================== */

function assertPositive(name, value) {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new Error(`${name} doit être un nombre > 0. Reçu: ${value}`);
  }
}

function mm2_to_m2(mm2) {
  return mm2 / 1e6;
}

function mm3_to_m3(mm3) {
  return mm3 / 1e9;
}

/**
 * Moment d’inertie section rectangulaire [mm4]
 * I = b h³ / 12
 */
function rectI(b_mm, h_mm) {
  return (b_mm * h_mm ** 3) / 12;
}

/**
 * Module de section rectangulaire [mm3]
 * W = b h² / 6
 */
function rectW(b_mm, h_mm) {
  return (b_mm * h_mm ** 2) / 6;
}

/**
 * Aire section rectangulaire [mm²]
 */
function rectA(b_mm, h_mm) {
  return b_mm * h_mm;
}

/**
 * Charge propre d’une poutre [kN/m]
 * q = b * h * gamma
 *
 * b,h en mm ; gamma en kN/m³
 */
function beamSelfWeight_kN_m(b_mm, h_mm, density_kN_m3 = 5.0) {
  const area_m2 = (b_mm / 1000) * (h_mm / 1000);
  return area_m2 * density_kN_m3;
}

/**
 * Conversion charge surfacique en charge linéique
 * q_lin = q_surf * entraxe
 */
function areaLoadToLineLoad(q_kN_m2, spacing_m) {
  return q_kN_m2 * spacing_m;
}

/**
 * Charge ELU simplifiée à température normale.
 *
 * Ici on utilise une combinaison simple de type :
 * qd = 1.35 * Gk + 1.50 * Qk
 *
 * Remarque :
 * - C’est un choix pratique cohérent avec un prédimensionnement courant,
 *   mais il faut vérifier la combinaison exacte de projet selon SIA 260.
 */
function designLineLoadAmbient_kN_m({ gk_kN_m, qk_kN_m }) {
  return 1.35 * gk_kN_m + 1.5 * qk_kN_m;
}

/**
 * En incendie, simplification SIA 265 pour catégories A et B :
 * Ed,fi = 0.6 * Ed
 *
 * Source : SIA 265:2021, §4.5.2.1
 *
 * Pour d’autres catégories, le code laisse la main à l’utilisateur.
 */
function designLineLoadFire_kN_m({
  qdAmbient_kN_m,
  occupancyKey,
  fireEffectFactorOverride = null
}) {
  if (fireEffectFactorOverride != null) {
    return fireEffectFactorOverride * qdAmbient_kN_m;
  }

  if (occupancyKey === "A1_habitation" || occupancyKey === "B_bureaux") {
    return 0.6 * qdAmbient_kN_m;
  }

  throw new Error(
    "Le facteur simplifié Ed,fi = 0.6 Ed est explicitement donné par SIA 265 pour A et B. " +
    "Pour une autre catégorie, fournis fireEffectFactorOverride."
  );
}

/* ========================================================================== */
/* 3) CALCUL À TEMPÉRATURE NORMALE                                            */
/* ========================================================================== */

/**
 * Portée max par flexion pour poutre simplement appuyée sous charge uniforme :
 * Mmax = q L² / 8
 * sigma = M / W <= fm,d
 *
 * => Lmax = sqrt( 8 * fm,d * W / q )
 *
 * Unités :
 * - fm_d_N_mm2 en N/mm²
 * - W en mm³
 * - q en kN/m = N/mm (numériquement identique)
 * - résultat en mm
 */
function maxSpanByBendingAmbient_m({ fm_d_N_mm2, W_mm3, qd_kN_m }) {
  assertPositive("fm_d_N_mm2", fm_d_N_mm2);
  assertPositive("W_mm3", W_mm3);
  assertPositive("qd_kN_m", qd_kN_m);

  const L_mm = Math.sqrt((8 * fm_d_N_mm2 * W_mm3) / qd_kN_m);
  return L_mm / 1000;
}

/**
 * Portée max par cisaillement pour section rectangulaire
 * tau_max = 1.5 * V / A <= fv,d
 * avec Vmax = qL/2
 *
 * => 1.5 * (qL/2) / A <= fv,d
 * => Lmax = (2 * A * fv,d) / (1.5 * q)
 *
 * Unités :
 * - A en mm²
 * - fv_d_N_mm2 en N/mm²
 * - q en kN/m = N/mm
 * - résultat en mm
 */
function maxSpanByShearAmbient_m({ fv_d_N_mm2, A_mm2, qd_kN_m }) {
  assertPositive("fv_d_N_mm2", fv_d_N_mm2);
  assertPositive("A_mm2", A_mm2);
  assertPositive("qd_kN_m", qd_kN_m);

  const L_mm = (2 * A_mm2 * fv_d_N_mm2) / (1.5 * qd_kN_m);
  return L_mm / 1000;
}

/**
 * Flèche max instantanée pour poutre simplement appuyée sous charge uniforme :
 * w = 5 q L^4 / (384 E I)
 *
 * On inverse pour obtenir Lmax à partir d’un critère w <= L / ratio :
 * 5 q L^4 / (384 E I) <= L / ratio
 * => 5 q L^3 <= 384 E I / ratio
 * => Lmax = ((384 E I) / (5 q ratio))^(1/3)
 *
 * Source critères de ratio : SIA 260 annexe A tableau 3
 */
function maxSpanByDeflection_m({ E_N_mm2, I_mm4, qk_variableOnly_kN_m, ratio }) {
  assertPositive("E_N_mm2", E_N_mm2);
  assertPositive("I_mm4", I_mm4);
  assertPositive("qk_variableOnly_kN_m", qk_variableOnly_kN_m);
  assertPositive("ratio", ratio);

  const L_mm = Math.cbrt((384 * E_N_mm2 * I_mm4) / (5 * qk_variableOnly_kN_m * ratio));
  return L_mm / 1000;
}

/* ========================================================================== */
/* 4) CALCUL INCENDIE                                                         */
/* ========================================================================== */

/**
 * Temps simplifié pour consumer une épaisseur de bois exposée au feu sur 1 face.
 *
 * Base normative :
 * - SIA 265:2021, §4.5.2.2 et §4.5.2.3 :
 *   d_char,n = beta_n_mm_min * t
 * - Tableau 13 : vitesses de combustion théorique beta_n_mm_min
 *
 * ATTENTION :
 * - Cette fonction donne un temps simplifié de consommation d'épaisseur.
 * - Ce n'est PAS une preuve normative complète de "durée de protection"
 *   d'un parement devant une structure.
 * - Pour des éléments protégés au début de l'incendie, la SIA 265 renvoie
 *   à la Documentation Lignum protection incendie.
 */


function calcBurnThroughTime_min({
  thickness_mm,
  woodFamily = "solid_softwood"
}) {
  if (!Number.isFinite(thickness_mm) || thickness_mm <= 0) {
    throw new Error(`thickness_mm doit être > 0. Reçu: ${thickness_mm}`);
  }

  const beta_n_mm_min =
    Object.values(sia265Data.woodClasses?.[woodFamily] ?? {})[0]?.beta_n_mm_min;
  assertPositive("beta_n_mm_min", beta_n_mm_min);
  const burnThroughTime_min = thickness_mm / beta_n_mm_min;

  return {
    thickness_mm,
    woodFamily,
    beta_n_mm_min,
    burnThroughTime_min
  };
}


/**
 * Section résiduelle fictive en incendie.
 *
 * Source :
 * - SIA 265:2021, §4.5.2.2
 * - Figure 13
 * - Eq. (49) def = dchar,n + dred
 * - Eq. (50) dchar,n = beta_n_mm_min * t
 *
 * Exposition :
 * - 3 faces : côtés + dessous
 *   bfi = b - 2*def
 *   hfi = h - def
 *
 * - 4 faces :
 *   bfi = b - 2*def
 *   hfi = h - 2*def
 */
function residualSectionFire({
  b_mm,
  h_mm,
  fireMinutes,
  beta_n_mm_min,
  exposureFaces = 3,
  d_red_mm = 7,
  t_protection_min = 0
}) {
  assertPositive("b_mm", b_mm);
  assertPositive("h_mm", h_mm);
  assertPositive("fireMinutes", fireMinutes);
  assertPositive("beta_n_mm_min", beta_n_mm_min);
  assertPositive("d_red_mm", d_red_mm);

  const t_exposed_min = Math.max(0, fireMinutes - t_protection_min);
  const d_char_mm = beta_n_mm_min * t_exposed_min;
  const d_eff_mm = t_exposed_min > 0 ? d_char_mm + d_red_mm : 0;

  let bfi_mm = b_mm - 2 * d_eff_mm;
  let hfi_mm;

  if (exposureFaces === 3) {
    hfi_mm = h_mm - d_eff_mm;
  } else if (exposureFaces === 4) {
    hfi_mm = h_mm - 2 * d_eff_mm;
  } else {
    throw new Error("exposureFaces doit valoir 3 ou 4.");
  }

  if (bfi_mm <= 0 || hfi_mm <= 0) {
    return {
      valid: false,
      reason: "La section résiduelle fictive devient nulle ou négative.",
      t_protection_min,
      t_exposed_min,
      d_char_mm,
      d_eff_mm,
      bfi_mm,
      hfi_mm
    };
  }

  return {
    valid: true,
    t_protection_min,
    t_exposed_min,
    d_char_mm,
    d_eff_mm,
    bfi_mm,
    hfi_mm,
    source: "SIA 265:2021, §4.5.2.2, figure 13, équations (49) et (50)"
  };
}

/**
 * Vérification largeur minimale avant incendie pour plusieurs faces
 * Source : SIA 265:2021, §4.5.2.4
 *
 * - b >= 80 mm pour R30
 * - b >= 140 mm pour R60
 *
 * La norme précise cela pour action simultanée du feu sur plusieurs faces.
 */
function checkMinimumWidthForMultiFaceFire(b_mm, fireMinutes) {
  if (fireMinutes <= 30) {
    return { required_b_mm: 80, ok: b_mm >= 80 };
  }
  if (fireMinutes <= 60) {
    return { required_b_mm: 140, ok: b_mm >= 140 };
  }
  // au-delà, le code ne tranche pas automatiquement ici
  return { required_b_mm: null, ok: null };
}

/**
 * Résistance en flexion au feu, méthode simplifiée :
 * Rd,fi ≈ 1.8 * Rd
 *
 * Ici :
 * Rd en flexion = fm,d * W_residual
 *
 * Source : SIA 265:2021, §4.5.2.5, Eq. (51)
 */
function fireBendingResistance_kNm({ fm_d_N_mm2, W_residual_mm3 }) {
  const M_Rd_normal_residual_Nmm = fm_d_N_mm2 * W_residual_mm3;
  const M_Rd_fi_Nmm = 1.8 * M_Rd_normal_residual_Nmm;
  return M_Rd_fi_Nmm / 1e6; // kNm
}

/**
 * Portée max au feu par flexion :
 * MEd,fi = qfi * L² / 8 <= MRd,fi
 */
function maxSpanByBendingFire_m({ M_Rd_fi_kNm, qd_fi_kN_m }) {
  assertPositive("M_Rd_fi_kNm", M_Rd_fi_kNm);
  assertPositive("qd_fi_kN_m", qd_fi_kN_m);

  return Math.sqrt((8 * M_Rd_fi_kNm) / qd_fi_kN_m);
}

/**
 * Portée max au feu par cisaillement, avec même logique simplifiée :
 * V_Rd,fi ≈ 1.8 * V_Rd(residual)
 *
 * Pour section rectangulaire :
 * tau_max = 1.5 * V / A <= fv,d
 * => V_Rd(residual) = fv,d * A / 1.5
 * => V_Rd,fi = 1.8 * fv,d * A / 1.5
 * => qL/2 <= V_Rd,fi
 */
function maxSpanByShearFire_m({ fv_d_N_mm2, A_residual_mm2, qd_fi_kN_m }) {
  const V_Rd_fi_N = 1.8 * (fv_d_N_mm2 * A_residual_mm2 / 1.5);
  const V_Rd_fi_kN = V_Rd_fi_N / 1000;
  return (2 * V_Rd_fi_kN) / qd_fi_kN_m;
}

/* ========================================================================== */
/* 5) FONCTION PRINCIPALE                                                     */
/* ========================================================================== */

/**
 * Calcule la portée à froid et au feu.
 */
function calculateWoodBeamSpan(input) {
  const {
    // Géométrie
    b_mm,
    h_mm,
    spacing_mm,

    // Charges
    permanentLoad_kN_m2, // hors poids propre poutre
    occupancyKey = "A1_habitation",
    customLiveLoad_kN_m2 = null,
    density_kN_m3 = 5.0,

    // Bois
    woodFamily = "solid_softwood", // ex: solid_softwood, glulam
    woodClass = "C24",

    // Feu
    fireExposureFaces = 3,  // 3 ou 4
    fireRatings_min = [30, 60],
    t_protection_min = 0, // pas de protection supplémentaire,
    fireEffectFactorOverride = null,
    beta_n_override_mm_min = null,

    // Flèche
    deflectionCriterionKey = "comfort",
    deflectionRatioOverride = null
  } = input;

  // --- validations
  [ ["b_mm", b_mm], ["h_mm", h_mm], ["spacing_mm", spacing_mm], ["permanentLoad_kN_m2", permanentLoad_kN_m2] ]
    .forEach(([name, value]) => assertPositive(name, value));

  // --- matériaux
  const woodDb = sia265Data.woodClasses?.[woodFamily];
  if (!woodDb) throw new Error(`woodFamily inconnue: ${woodFamily}`);

  const wood = woodDb[woodClass];
  if (!wood) {
    throw new Error(
      `woodClass ${woodClass} non trouvée pour woodFamily ${woodFamily}. ` +
      `Complète src/data/sia265.json avec les valeurs du tableau normatif correspondant.`
    );
  }

  const {
    fm_d_N_mm2,
    fv_d_N_mm2,
    Em_mean_N_mm2,
    beta_n_mm_min: woodBeta_n_mm_min
  } = wood;

  // --- charges d’exploitation
  const occ = OCCUPANCY[occupancyKey];
  if (!occ) throw new Error(`occupancyKey inconnue: ${occupancyKey}`);

  const qk_live_kN_m2 =
    occupancyKey === "CUSTOM"
      ? customLiveLoad_kN_m2
      : occ.qk_kN_m2;

  assertPositive("qk_live_kN_m2", qk_live_kN_m2);

  // --- géométrie et propriétés
  const spacing_m = spacing_mm / 1000;
  const A_mm2 = rectA(b_mm, h_mm);
  const I_mm4 = rectI(b_mm, h_mm);
  const W_mm3 = rectW(b_mm, h_mm);

  // --- charges linéiques
  const selfWeight_kN_m = beamSelfWeight_kN_m(b_mm, h_mm, density_kN_m3);
  const gk_kN_m = areaLoadToLineLoad(permanentLoad_kN_m2, spacing_m) + selfWeight_kN_m;
  const qk_kN_m = areaLoadToLineLoad(qk_live_kN_m2, spacing_m);

  // --- température normale
  const qdAmbient_kN_m = designLineLoadAmbient_kN_m({
    gk_kN_m,
    qk_kN_m
  });

  const L_bending_ambient_m = maxSpanByBendingAmbient_m({
    fm_d_N_mm2,
    W_mm3,
    qd_kN_m: qdAmbient_kN_m
  });

  const L_shear_ambient_m = maxSpanByShearAmbient_m({
    fv_d_N_mm2,
    A_mm2,
    qd_kN_m: qdAmbient_kN_m
  });

  const defl = DEFLECTION_LIMITS[deflectionCriterionKey];
  if (!defl) throw new Error(`deflectionCriterionKey inconnu: ${deflectionCriterionKey}`);

  const deflectionRatio =
    deflectionCriterionKey === "CUSTOM"
      ? deflectionRatioOverride
      : defl.ratio;

  assertPositive("deflectionRatio", deflectionRatio);

  // Selon SIA 260 tableau 3, plusieurs critères sont exprimés sur actions variables ;
  // ici on applique le critère de flèche au chargement variable seul pour un usage
  // indicatif cohérent avec le tableau.
  const L_deflection_m = maxSpanByDeflection_m({
    E_N_mm2: Em_mean_N_mm2,
    I_mm4,
    qk_variableOnly_kN_m: qk_kN_m,
    ratio: deflectionRatio
  });

  // portée à froid retenue = minimum des vérifications
  const L_ambient_governing_m = Math.min(
    L_bending_ambient_m,
    L_shear_ambient_m,
    L_deflection_m
  );

  // --- incendie
  const beta_n_mm_min =
    beta_n_override_mm_min != null
      ? beta_n_override_mm_min
      : woodBeta_n_mm_min;

  const qdFire_kN_m = designLineLoadFire_kN_m({
    qdAmbient_kN_m,
    occupancyKey,
    fireEffectFactorOverride
  });

  const fireResults = fireRatings_min.map((fireMinutes) => {
    const widthCheck = checkMinimumWidthForMultiFaceFire(b_mm, fireMinutes);

    const residual = residualSectionFire({
      b_mm,
      h_mm,
      fireMinutes,
      beta_n_mm_min,
      exposureFaces: fireExposureFaces,
      d_red_mm: 7, // SIA 265 §4.5.2.2 jusqu'à 90 min
      t_protection_min
    });

    if (!residual.valid) {
      return {
        fireMinutes,
        ok: false,
        reason: residual.reason,
        widthCheck
      };
    }

    const A_residual_mm2 = rectA(residual.bfi_mm, residual.hfi_mm);
    const W_residual_mm3 = rectW(residual.bfi_mm, residual.hfi_mm);

    const M_Rd_fi_kNm = fireBendingResistance_kNm({
      fm_d_N_mm2,
      W_residual_mm3
    });

    const L_bending_fire_m = maxSpanByBendingFire_m({
      M_Rd_fi_kNm,
      qd_fi_kN_m: qdFire_kN_m
    });

    const L_shear_fire_m = maxSpanByShearFire_m({
      fv_d_N_mm2,
      A_residual_mm2,
      qd_fi_kN_m: qdFire_kN_m
    });

    const L_fire_governing_m = Math.min(L_bending_fire_m, L_shear_fire_m);

    const L_governing_m = Math.min(L_ambient_governing_m, L_fire_governing_m);

    return {
      fireMinutes,
      ok: true,
      widthCheck,
      beta_n_mm_min,
      d_char_mm: residual.d_char_mm,
      d_eff_mm: residual.d_eff_mm,
      bfi_mm: residual.bfi_mm,
      hfi_mm: residual.hfi_mm,
      M_Rd_fi_kNm,
      qdFire_kN_m,
      L_bending_fire_m,
      L_shear_fire_m,
      L_fire_governing_m,
      Max_span: L_governing_m
    };
  });

  return {
    input,
    references: {
      liveLoads: occ.source,
      deflection: defl.source,
      wood: wood.sources?.fm_d_N_mm2,
      fireSection: "SIA 265:2021, §4.5.2.2, figure 13, eq. (49)-(50)",
      fireResistance: "SIA 265:2021, §4.5.2.5, eq. (51)",
      fireLoads: (
        occupancyKey === "A1_habitation" || occupancyKey === "B_bureaux"
          ? "SIA 265:2021, §4.5.2.1 : Ed,fi = 0.6 Ed"
          : "Facteur incendie fourni par l’utilisateur"
      )
    },
    section: {
      b_mm,
      h_mm,
      spacing_mm,
      A_mm2,
      I_mm4,
      W_mm3
    },
    material: {
      woodFamily,
      woodClass,
      fm_d_N_mm2,
      fv_d_N_mm2,
      Em_mean_N_mm2,
      beta_n_mm_min
    },
    loads: {
      permanentLoad_kN_m2,
      qk_live_kN_m2,
      selfWeight_kN_m,
      gk_kN_m,
      qk_kN_m,
      qdAmbient_kN_m
    },
    ambient: {
      L_bending_ambient_m,
      L_shear_ambient_m,
      L_deflection_m,
      L_ambient_governing_m
    },
    fire: fireResults,
  };
}

export { 
  calculateWoodBeamSpan, 
  calcBurnThroughTime_min 
};

/*{
const example = calculateWoodBeamSpan({
  b_mm: 360,
  h_mm: 160,
  spacing_mm: 1200,

  permanentLoad_kN_m2: 1.57, 
  occupancyKey: "A1_habitation", 

  woodFamily: "solid_softwood",
  woodClass: "C24",

  fireExposureFaces: 3,    
  fireRatings_min: [30, 60],
  t_protection_min: 0, 
  deflectionCriterionKey: "comfort", 
  density_kN_m3: 5.0
});
}*/
