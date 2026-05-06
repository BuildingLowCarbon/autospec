import sia265Data from '../data/sia265.json' with { type: 'json' };

/**
 * Calcul de la force verticale maximale par montant
 * selon SIA 265:2021
 *
 * Vérifications incluses :
 * - compression + flambage à température normale (NT)
 * - compression excentrée à température normale
 * - compression + flambage au feu (Rt)
 * - compression excentrée au feu
 *
 * Vérifications NON incluses :
 * - cisaillement
 * - compression perpendiculaire au fil aux appuis
 * - assemblages
 * - effets de second ordre détaillés
 * - protection initiale selon méthode Lignum complète
 *
 * Hypothèses principales :
 * - section rectangulaire pleine
 * - montant modélisé comme une barre comprimée
 * - flambage sur axe faible
 * - charge excentrée modélisée par eccentricity_along_h_mm et eccentricity_along_b_mm
 * - incendie via section résiduelle fictive SIA 265
 */

/* ==========================================================================
   1) BASE DE DONNÉES MATÉRIAUX
   ========================================================================== */

// Caracteristiques bois centralisees dans src/data/sia265.json.

/* ==========================================================================
   2) OUTILS GÉOMÉTRIQUES
   ========================================================================== */

function assertPositive(name, value) {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new Error(`${name} doit être > 0. Reçu: ${value}`);
  }
}

function assertRequiredWoodProperties(wood, properties, context) {
  const missing = properties.filter((property) => wood[property] == null);
  if (missing.length > 0) {
    throw new Error(
      `Caracteristiques bois manquantes pour ${context}: ${missing.join(", ")}.`
    );
  }
}

function getWood(woodFamily, woodClass) {
  const wood = sia265Data.woodClasses?.[woodFamily]?.[woodClass];
  if (!wood) {
    throw new Error(`Classe bois non trouvee: ${woodFamily} / ${woodClass}`);
  }

  assertRequiredWoodProperties(
    wood,
    ["fc0_d_N_mm2", "fm_d_N_mm2", "fc0_k_N_mm2", "E0_05_N_mm2", "beta_c", "beta_n_mm_min"],
    `${woodFamily} / ${woodClass}`
  );
  return wood;
}

function rectArea_mm2(b_mm, h_mm) {
  return b_mm * h_mm;
}

function rectIy_mm4(b_mm, h_mm) {
  return (b_mm * h_mm ** 3) / 12;
}

function rectIz_mm4(b_mm, h_mm) {
  return (h_mm * b_mm ** 3) / 12;
}

function rectWy_mm3(b_mm, h_mm) {
  return (b_mm * h_mm ** 2) / 6;
}

function rectWz_mm3(b_mm, h_mm) {
  return (h_mm * b_mm ** 2) / 6;
}

function radiusOfGyration_mm(I_mm4, A_mm2) {
  return Math.sqrt(I_mm4 / A_mm2);
}

/* ==========================================================================
   3) FLAMBAGE SELON SIA 265
   ========================================================================== */

/**
 * SIA 265 §4.2.8.2
 * λrel = (λ / π) * sqrt(fc0_k_N_mm2 / E0_05_N_mm2)
 */
function relativeSlenderness({
  bucklingLength_mm,
  i_mm,
  fc0_k_N_mm2,
  E0_05_N_mm2
}) {
  const lambda = bucklingLength_mm / i_mm;
  const lambda_rel = (lambda / Math.PI) * Math.sqrt(fc0_k_N_mm2 / E0_05_N_mm2);

  return { lambda, lambda_rel };
}

/**
 * SIA 265 §4.2.8.3
 * k = 1/2 [1 + βc(λrel - 0.3) + λrel²]
 * kc = 1 / (k + sqrt(k² - λrel²))
 *
 * Pour λrel <= 0.3 : kc = 1.0
 */
function bucklingReductionFactor_kc({ lambda_rel, beta_c }) {
  if (lambda_rel <= 0.3) return 1.0;

  const k = 0.5 * (1 + beta_c * (lambda_rel - 0.3) + lambda_rel ** 2);
  const kc = 1 / (k + Math.sqrt(k ** 2 - lambda_rel ** 2));

  return kc;
}

/**
 * Résistance en compression avec flambage :
 * Nmax_flamb = kc * fc0_d_N_mm2 * A
 *
 * SIA 265 §4.2.8.1
 */
function compressionBucklingCapacity_NT({
  b_mm,
  h_mm,
  bucklingLength_mm,
  woodFamily,
  woodClass
}) {
  const wood = getWood(woodFamily, woodClass);

  const A_mm2 = rectArea_mm2(b_mm, h_mm);
  const Iy_mm4 = rectIy_mm4(b_mm, h_mm);
  const Iz_mm4 = rectIz_mm4(b_mm, h_mm);

  const iy_mm = radiusOfGyration_mm(Iy_mm4, A_mm2);
  const iz_mm = radiusOfGyration_mm(Iz_mm4, A_mm2);

  const i_min_mm = Math.min(iy_mm, iz_mm);

  const { lambda, lambda_rel } = relativeSlenderness({
    bucklingLength_mm,
    i_mm: i_min_mm,
    fc0_k_N_mm2: wood.fc0_k_N_mm2,
    E0_05_N_mm2: wood.E0_05_N_mm2
  });

  const kc = bucklingReductionFactor_kc({
    lambda_rel,
    beta_c: wood.beta_c
  });

  const Nmax_flamb_N = kc * wood.fc0_d_N_mm2 * A_mm2;

  return {
    A_mm2,
    Iy_mm4,
    Iz_mm4,
    iy_mm,
    iz_mm,
    i_min_mm,
    lambda,
    lambda_rel,
    kc,
    Nmax_flamb_N,
    Nmax_flamb_kN: Nmax_flamb_N / 1000
  };
}

/* ==========================================================================
   4) COMPRESSION EXCENTRÉE À FROID
   ========================================================================== */

/**
 * Interaction utilisée :
 *
 * ( (N/A) / fc0_d_N_mm2 )²
 * + (N*eccentricity_along_h_mm/Wy)/fm_d_N_mm2
 * + (N*eccentricity_along_b_mm/Wz)/fm_d_N_mm2 <= 1
 *
 * Ce qui donne :
 * alpha * N² + beta * N - 1 <= 0
 *
 * avec :
 * alpha = 1 / (A² * fc0_d_N_mm2²)
 * beta  = eccentricity_along_h_mm/(Wy*fm_d_N_mm2)
 *       + eccentricity_along_b_mm/(Wz*fm_d_N_mm2)
 *
 * On prend la racine positive.
 *
 * SIA 265 §4.2.4.2
 */
function compressionInteractionCapacity_NT({
  b_mm,
  h_mm,
  eccentricity_along_h_mm = 0,
  eccentricity_along_b_mm = 0,
  woodFamily,
  woodClass
}) {
  const wood = getWood(woodFamily, woodClass);

  const A_mm2 = rectArea_mm2(b_mm, h_mm);
  const Wy_mm3 = rectWy_mm3(b_mm, h_mm);
  const Wz_mm3 = rectWz_mm3(b_mm, h_mm);

  const alpha = 1 / ((A_mm2 ** 2) * (wood.fc0_d_N_mm2 ** 2));
  const beta =
    (Math.abs(eccentricity_along_h_mm) / (Wy_mm3 * wood.fm_d_N_mm2)) +
    (Math.abs(eccentricity_along_b_mm) / (Wz_mm3 * wood.fm_d_N_mm2));

  // Résolution de alpha*N² + beta*N - 1 = 0
  const discriminant = beta ** 2 + 4 * alpha;
  const Nmax_interaction_N = (-beta + Math.sqrt(discriminant)) / (2 * alpha);

  return {
    A_mm2,
    Wy_mm3,
    Wz_mm3,
    alpha,
    beta,
    Nmax_interaction_N,
    Nmax_interaction_kN: Nmax_interaction_N / 1000
  };
}

/* ==========================================================================
   5) RÉSISTANCE MAX À TEMPÉRATURE NORMALE NT
   ========================================================================== */

/**
 * Nmax_NT = min( Nmax_flamb, Nmax_interaction )
 */
function calculateNmax_NT({
  b_mm,
  h_mm,
  bucklingLength_mm,
  eccentricity_along_h_mm = 0,
  eccentricity_along_b_mm = 0,
  woodFamily,
  woodClass
}) {
  assertPositive("b_mm", b_mm);
  assertPositive("h_mm", h_mm);
  assertPositive("bucklingLength_mm", bucklingLength_mm);

  const flamb = compressionBucklingCapacity_NT({
    b_mm,
    h_mm,
    bucklingLength_mm,
    woodFamily,
    woodClass
  });

  const interaction = compressionInteractionCapacity_NT({
    b_mm,
    h_mm,
    eccentricity_along_h_mm,
    eccentricity_along_b_mm,
    woodFamily,
    woodClass
  });

  const Nmax_NT_N = Math.min(
    flamb.Nmax_flamb_N,
    interaction.Nmax_interaction_N
  );

  return {
    temperatureCondition: "normal_temperature",
    b_mm,
    h_mm,
    eccentricity_along_h_mm,
    eccentricity_along_b_mm,
    Nmax_flamb_kN: flamb.Nmax_flamb_kN,
    Nmax_interaction_kN: interaction.Nmax_interaction_kN,
    Nmax_NT_kN: Nmax_NT_N / 1000,
    buckling: flamb,
    interaction
  };
}

/* ==========================================================================
   6) SECTION RÉSIDUELLE FICTIVE AU FEU
   ========================================================================== */

/**
 * SIA 265 §4.5.2.2
 * d_char,n = beta_n_mm_min * t_exposed
 * d_eff = d_char,n + d_red
 *
 * Avec d_red = 7 mm jusqu'à 90 min
 *
 * Interprétation géométrique :
 * - 1 face : bfi = b ;           hfi = h - d_eff
 * - 2 faces : bfi = b - 2d_eff ; hfi = h
 * - 3 faces : bfi = b - 2d_eff ; hfi = h - d_eff
 * - 4 faces : bfi = b - 2d_eff ; hfi = h - 2d_eff
 */
function residualSectionFire({
  b_mm,
  h_mm,
  fireMinutes,
  beta_n_mm_min,
  fireExposureFaces = 3,
  t_protection_min = 0,
  d_red_mm = 7
}) {
  const t_exposed_min = Math.max(0, fireMinutes - t_protection_min);
  const d_char_mm = beta_n_mm_min * t_exposed_min;
  const d_eff_mm = t_exposed_min > 0 ? d_char_mm + d_red_mm : 0;

  let bfi_mm;
  let hfi_mm;

  if (fireExposureFaces === 1) {
    bfi_mm = b_mm;
    hfi_mm = h_mm - d_eff_mm;
  } else if (fireExposureFaces === 2) {
    bfi_mm = b_mm - 2 * d_eff_mm;
    hfi_mm = h_mm;
  } else if (fireExposureFaces === 3) {
    bfi_mm = b_mm - 2 * d_eff_mm;
    hfi_mm = h_mm - d_eff_mm;
  } else if (fireExposureFaces === 4) {
    bfi_mm = b_mm - 2 * d_eff_mm;
    hfi_mm = h_mm - 2 * d_eff_mm;
  } else {
    throw new Error("fireExposureFaces doit valoir 1, 2, 3 ou 4.");
  }

  return {
    t_exposed_min,
    d_char_mm,
    d_eff_mm,
    bfi_mm,
    hfi_mm,
    valid: bfi_mm > 0 && hfi_mm > 0
  };
}

/* ==========================================================================
   7) FLAMBAGE SUR SECTION RÉSIDUELLE
   ========================================================================== */

/**
 * Résistance au feu :
 * Rd,fi ≈ 1.8 * Rd
 *
 * Donc :
 * Nmax_flamb_Rt = 1.8 * kc_fi * fc0_d_N_mm2 * A_fi
 *
 * SIA 265 §4.5.2.5
 */
function compressionBucklingCapacity_Rt({
  b_mm,
  h_mm,
  bucklingLength_mm,
  woodFamily,
  woodClass,
  fireMinutes,
  fireExposureFaces = 3,
  t_protection_min = 0
}) {
  const wood = getWood(woodFamily, woodClass);

  const residual = residualSectionFire({
    b_mm,
    h_mm,
    fireMinutes,
    beta_n_mm_min: wood.beta_n_mm_min,
    fireExposureFaces,
    t_protection_min
  });

  if (!residual.valid) {
    return {
      fireMinutes,
      valid: false,
      reason: "Section résiduelle fictive non positive",
      ...residual
    };
  }

  const normalTemperatureResidual = compressionBucklingCapacity_NT({
    b_mm: residual.bfi_mm,
    h_mm: residual.hfi_mm,
    bucklingLength_mm,
    woodFamily,
    woodClass
  });

  const Nmax_flamb_Rt_N = 1.8 * normalTemperatureResidual.Nmax_flamb_N;

  return {
    fireMinutes,
    valid: true,
    ...residual,
    A_fi_mm2: normalTemperatureResidual.A_mm2,
    Nmax_flamb_Rt_N,
    Nmax_flamb_Rt_kN: Nmax_flamb_Rt_N / 1000,
    bucklingResidualAtNormalTemperature: normalTemperatureResidual
  };
}

/* ==========================================================================
   8) COMPRESSION EXCENTRÉE AU FEU
   ========================================================================== */

/**
 * Interaction au feu, sur section résiduelle fictive :
 *
 * ( (N/A_fi) / (1.8*fc0_d_N_mm2) )²
 * + (N*eccentricity_along_h_mm/Wy_fi)/(1.8*fm_d_N_mm2)
 * + (N*eccentricity_along_b_mm/Wz_fi)/(1.8*fm_d_N_mm2)
 * <= 1
 *
 * Même résolution quadratique.
 */
function compressionInteractionCapacity_Rt({
  b_mm,
  h_mm,
  eccentricity_along_h_mm = 0,
  eccentricity_along_b_mm = 0,
  woodFamily,
  woodClass,
  fireMinutes,
  fireExposureFaces = 3,
  t_protection_min = 0
}) {
  const wood = getWood(woodFamily, woodClass);

  const residual = residualSectionFire({
    b_mm,
    h_mm,
    fireMinutes,
    beta_n_mm_min: wood.beta_n_mm_min,
    fireExposureFaces,
    t_protection_min
  });

  if (!residual.valid) {
    return {
      fireMinutes,
      valid: false,
      reason: "Section résiduelle fictive non positive",
      ...residual
    };
  }

  const A_fi_mm2 = rectArea_mm2(residual.bfi_mm, residual.hfi_mm);
  const Wy_fi_mm3 = rectWy_mm3(residual.bfi_mm, residual.hfi_mm);
  const Wz_fi_mm3 = rectWz_mm3(residual.bfi_mm, residual.hfi_mm);

  const fc0_d_fi_N_mm2 = 1.8 * wood.fc0_d_N_mm2;
  const fm_d_fi_N_mm2 = 1.8 * wood.fm_d_N_mm2;

  const alpha = 1 / ((A_fi_mm2 ** 2) * (fc0_d_fi_N_mm2 ** 2));
  const beta =
    (Math.abs(eccentricity_along_h_mm) / (Wy_fi_mm3 * fm_d_fi_N_mm2)) +
    (Math.abs(eccentricity_along_b_mm) / (Wz_fi_mm3 * fm_d_fi_N_mm2));

  const discriminant = beta ** 2 + 4 * alpha;
  const Nmax_interaction_Rt_N = (-beta + Math.sqrt(discriminant)) / (2 * alpha);

  return {
    fireMinutes,
    valid: true,
    ...residual,
    A_fi_mm2,
    Wy_fi_mm3,
    Wz_fi_mm3,
    alpha,
    beta,
    Nmax_interaction_Rt_N,
    Nmax_interaction_Rt_kN: Nmax_interaction_Rt_N / 1000
  };
}

/* ==========================================================================
   9) RÉSISTANCE MAX AU FEU
   ========================================================================== */

/**
 * Nmax_Rt = min( Nmax_flamb_Rt, Nmax_interaction_Rt )
 */
function calculateNmax_Rt({
  b_mm,
  h_mm,
  bucklingLength_mm,
  eccentricity_along_h_mm = 0,
  eccentricity_along_b_mm = 0,
  woodFamily,
  woodClass,
  fireMinutes,
  fireExposureFaces = 3,
  t_protection_min = 0
}) {
  assertPositive("b_mm", b_mm);
  assertPositive("h_mm", h_mm);
  assertPositive("bucklingLength_mm", bucklingLength_mm);
  assertPositive("fireMinutes", fireMinutes);

  const flamb = compressionBucklingCapacity_Rt({
    b_mm,
    h_mm,
    bucklingLength_mm,
    woodFamily,
    woodClass,
    fireMinutes,
    fireExposureFaces,
    t_protection_min
  });

  if (!flamb.valid) return flamb;

  const interaction = compressionInteractionCapacity_Rt({
    b_mm,
    h_mm,
    eccentricity_along_h_mm,
    eccentricity_along_b_mm,
    woodFamily,
    woodClass,
    fireMinutes,
    fireExposureFaces,
    t_protection_min
  });

  if (!interaction.valid) return interaction;

  const Nmax_Rt_N = Math.min(
    flamb.Nmax_flamb_Rt_N,
    interaction.Nmax_interaction_Rt_N
  );

  return {
    fireMinutes,
    valid: true,
    bfi_mm: flamb.bfi_mm,
    hfi_mm: flamb.hfi_mm,
    d_char_mm: flamb.d_char_mm,
    d_eff_mm: flamb.d_eff_mm,
    eccentricity_along_h_mm,
    eccentricity_along_b_mm,
    Nmax_flamb_Rt_kN: flamb.Nmax_flamb_Rt_kN,
    Nmax_interaction_Rt_kN: interaction.Nmax_interaction_Rt_kN,
    Nmax_Rt_kN: Nmax_Rt_N / 1000,
    bucklingFire: flamb,
    interactionFire: interaction
  };
}

/* ==========================================================================
   10) FONCTION PRINCIPALE
   ========================================================================== */

function calculateStudCompressionCapacity(input) {
  const {
    b_mm,
    h_mm,
    woodFamily,
    woodClass,

    // Donnée indispensable pour le flambage
    bucklingLength_mm,

    // Excentricités d'appui / de charge
    eccentricity_along_h_mm = 0,
    eccentricity_along_b_mm = 0,

    // Feu
    fireRatings_min = [30, 60],
    fireExposureFaces = 3,
    t_protection_min = 0
  } = input;

  const NT = calculateNmax_NT({
    b_mm,
    h_mm,
    bucklingLength_mm,
    eccentricity_along_h_mm,
    eccentricity_along_b_mm,
    woodFamily,
    woodClass
  });

  const fire = fireRatings_min
    .filter(t => t > 0)
    .map(fireMinutes =>
      calculateNmax_Rt({
        b_mm,
        h_mm,
        bucklingLength_mm,
        eccentricity_along_h_mm,
        eccentricity_along_b_mm,
        woodFamily,
        woodClass,
        fireMinutes,
        fireExposureFaces,
        t_protection_min
      })
    );

  return {
    input,
    normalTemperature: NT,
    fire
  };
}

export {
  calculateStudCompressionCapacity
};
