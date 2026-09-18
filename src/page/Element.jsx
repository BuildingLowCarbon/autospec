import React, { useEffect, useState, useContext, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
import { ViewSVG, DEFAULT_PX_PER_MM_X } from '../components/Graphic';
import translations from '../language/translations';
import dataTranslations from '../language/dataTranslations';
import LangContext from '../context/LangContext';
import loadComponents from '../utils/loadComponents';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import { getAcousticInsulation } from '../utils/acoustic';
import { applyCustomFireTimingToComponent } from '../utils/customFireTiming';
import { calculateComponentThermalDetails } from '../utils/componentPropriety';
import categoriesData from '../data/categories.json';
import { getComponentSubcategoryId, getSubcategoryLabel } from '../utils/componentTaxonomy';
import { getComponentStructureTypeId, getComponentStructureTypeLabel } from '../utils/componentStructureType';
import { getLayerMaterialCategoryIds, getMaterialCategoryLabel } from '../utils/materialCategory';
import { isSupportStructureLayer } from '../utils/supportStructure';
import { useAuth } from '../context/AuthContext';

const compactTableStyle = {
  width: 'auto',
  maxWidth: '100%',
  borderCollapse: 'collapse',
  marginTop: '6px',
  backgroundColor: '#fff',
};

const sectionTitleStyle = {
  marginTop: '32px',
  marginBottom: '6px',
};

const tableCellStyle = {
  border: '1px solid #ccc',
  padding: '8px',
  whiteSpace: 'nowrap',
};

const tableHeadCellStyle = {
  ...tableCellStyle,
  textAlign: 'left',
};

function Element() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [authMessage, setAuthMessage] = useState('');
  const { user, loading: authLoading } = useAuth();
  const { lang, setLang } = useContext(LangContext);
  const t = translations[lang];
  const pxPerMmY = 1;
  const pxPerMmX = DEFAULT_PX_PER_MM_X;
  const title = data?.translations?.[lang]?.name || data?.serialNo || data?.id || '';
  const description = data?.translations?.[lang]?.description || '';
  const acoustic = getAcousticInsulation(data);
  const componentWithFireTiming = useMemo(
    () => (data ? applyCustomFireTimingToComponent(data, materials, products) : null),
    [data, materials, products],
  );
  const thermalDetails = useMemo(
    () => (data ? calculateComponentThermalDetails(data, materials, products) : null),
    [data, materials, products],
  );
  const layers = useMemo(
    () => componentWithFireTiming?.structure?.layers ?? data?.structure?.layers ?? [],
    [componentWithFireTiming, data],
  );
  const woodBeamSpanResult = componentWithFireTiming?.fire_resistance?.wood_beam_span ?? null;
  const woodStudCompressionResult = componentWithFireTiming?.fire_resistance?.wood_stud_compression ?? null;
  const woodCapacityTable = componentWithFireTiming?.fire_resistance?.wood_capacity_table ?? null;
  const category = categoriesData.categories.find((item) => item.id === data?.categoryId);
  const categoryName = category?.label?.[lang]
    ?? category?.label?.fr
    ?? dataTranslations.categories?.[data?.categoryId]?.[lang]
    ?? dataTranslations.categories?.[data?.categoryId]?.fr
    ?? data?.categoryId;
  const subcategoryLabel = getSubcategoryLabel(category, getComponentSubcategoryId(data), lang);

  useEffect(() => {
    const fetchData = async () => {
      const [componentsJson, materialsJson, productsJson] = await Promise.all([
        loadComponents(),
        loadMaterials(),
        loadProducts(),
      ]);
      const found = componentsJson.find((item) => String(item.id) === String(id));
      setData(found);
      setMaterials(materialsJson);
      setProducts(productsJson);
    };

    fetchData();
  }, [id]);

  const materialById = useMemo(() => new Map(materials.map((m) => [String(m.id), m])), [materials]);
  const productById = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);
  const supportLayer = useMemo(() => layers.find(isSupportStructureLayer) ?? null, [layers]);
  const supportMaterialCategoryIds = useMemo(
    () => getLayerMaterialCategoryIds(supportLayer, materialById, productById),
    [materialById, productById, supportLayer],
  );
  const systemTypeId = getComponentStructureTypeId(data);

  const renderLayerName = (layer) => {
    const baseName = layer?.translations?.[lang]?.name || layer?.productName;

    const targetId = layer?.productId;
    const product = targetId ? productById.get(String(targetId)) : null;
    const material = !product && targetId ? materialById.get(String(targetId)) : null;
    const fallback = product?.workingtitle || material?.workingtitle || targetId || 'N/A';
    const name = baseName || fallback;

    if (product) {
      return <Link to={`/product/${product.id}`}>{name}</Link>;
    }
    if (material) {
      return <Link to={`/material/${material.id}`}>{name}</Link>;
    }
    return name;
  };

  const formatNumber = (value, decimals) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    const num = Number(value);
    if (Number.isNaN(num)) return 'N/A';
    return num.toFixed(decimals);
  };
  const formatSignedNumber = (value, decimals = 0) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    const num = Number(value);
    if (Number.isNaN(num)) return 'N/A';
    const formatted = num.toFixed(decimals);
    return num > 0 ? `+${formatted}` : formatted;
  };
  const formatCapacityCell = (cell) => {
    if (!cell || cell.value === null || cell.value === undefined) return 'N/A';
    return `${formatNumber(cell.value, 2)} ${cell.unit ?? ''}`.trim();
  };
  const renderCorrectors = (correctors, selectedCorrector) => {
    if (!correctors?.length) return 'N/A';
    return correctors
      .map((corrector) => {
        const selectedLabel = t.acoustic_selected_corrector ?? 'retained';
        const suffix = corrector.key === selectedCorrector?.key ? ` (${selectedLabel})` : '';
        return `${corrector.label}: ${formatSignedNumber(corrector.value, 0)} dB${suffix}`;
      })
      .join(', ');
  };
  if (!data) return <p>Chargement...</p>;

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <div style={{ padding: '20px' }}>
        <h2>{t.component_details}</h2>
        <div style={{ marginBottom: '16px' }}>
          {user
            ? <Link to={`/custom/${data.id}`} style={{ display: 'inline-block', padding: '8px 12px', border: '1px solid #777', borderRadius: '5px', background: '#f7f7f7', color: '#222', textDecoration: 'none' }}>Modifier / dupliquer</Link>
            : <button type="button" disabled={authLoading} onClick={() => setAuthMessage('Connectez-vous pour accéder à cette fonction')} style={{ padding: '8px 12px', border: '1px solid #777', borderRadius: '5px', background: '#f7f7f7', cursor: 'pointer' }}>Modifier / dupliquer</button>}
          {authMessage && <span style={{ display: 'block', marginTop: '8px', color: '#8a4d16', fontWeight: 700 }}>{authMessage}</span>}
        </div>
        <p>
          <strong>{title} :</strong>
        </p>
        <p>
          <strong>{t.description} : :</strong>{description}
        </p>
        <p>
          <strong>ID :</strong> {data.id}
        </p>
        <p>
          <strong>{t.category} :</strong> {categoryName}
        </p>
        {subcategoryLabel ? (
          <p>
            <strong>Sous-catégorie :</strong> {subcategoryLabel}
          </p>
        ) : null}
        {systemTypeId ? (
          <p>
            <strong>Système constructif :</strong> {getComponentStructureTypeLabel(systemTypeId, lang)}
          </p>
        ) : null}
        {supportLayer ? (
          <p>
            <strong>Catégorie du matériau de la structure :</strong>{' '}
            {supportMaterialCategoryIds.length
              ? supportMaterialCategoryIds.map((categoryId) => getMaterialCategoryLabel(categoryId, lang)).join(', ')
              : 'N/A'}
          </p>
        ) : null}
        <p>
          <strong>{t.thickness} :</strong> {formatNumber(data.thickness_mm, 0)} mm
        </p>
        <p>
          <strong>{t.surface_mass} :</strong> {formatNumber(data.weight_kg_m2, 0)} kg/m²
        </p>
        <p>
          <strong>{t.uValue} :</strong> {formatNumber(data.uValue_W_m2K, 2)} W/mK
        </p>
        <p>
          <strong>{t.gwp} :</strong> {formatNumber(data.gwp_kgco2e_m2, 1)} kg CO2-eq/m²
        </p>
        <p>
          <strong>{t.source} :</strong> {data.source?.databaseId ?? 'N/A'}
        </p>
        <p>
          <strong>{t.serial_no} :</strong> {data.serialNo}
        </p>
        <p>
          <strong>{t.source_reference} :</strong> {data.source?.externalId ?? 'N/A'}
        </p>

        <h2 style={sectionTitleStyle}>{t.acoustic_insulation}</h2>
        <div style={{ overflowX: 'auto' }}>
        <table style={compactTableStyle}>
          <thead>
            <tr style={{ backgroundColor: '#eee' }}>
              <th style={tableHeadCellStyle}>{t.name}</th>
              <th style={tableHeadCellStyle}>{t.acoustic_base_value ?? 'Isolation'}</th>
              <th style={tableHeadCellStyle}>{t.acoustic_corrector ?? 'Correcteur retenu'}</th>
              <th style={tableHeadCellStyle}>{t.acoustic_corrected_value ?? 'Valeur corrigee'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tableCellStyle}>Rw</td>
              <td style={tableCellStyle}>
                {acoustic.rw != null ? `${formatNumber(acoustic.rw, 0)} dB` : 'N/A'}
              </td>
              <td style={tableCellStyle}>
                {renderCorrectors(acoustic.rwCorrectors, acoustic.rwCorrector)}
              </td>
              <td style={tableCellStyle}>
                {acoustic.rwCorrected != null ? `${formatNumber(acoustic.rwCorrected, 0)} dB` : 'N/A'}
              </td>
            </tr>
            {data.categoryId === 'floor_assembly' ? (
              <tr>
                <td style={tableCellStyle}>Ln,w</td>
                <td style={tableCellStyle}>
                  {acoustic.lnw != null ? `${formatNumber(acoustic.lnw, 0)} dB` : 'N/A'}
                </td>
                <td style={tableCellStyle}>
                  {renderCorrectors(acoustic.lnwCorrectors, acoustic.lnwCorrector)}
                </td>
                <td style={tableCellStyle}>
                  {acoustic.lnwCorrected != null ? `${formatNumber(acoustic.lnwCorrected, 0)} dB` : 'N/A'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>

        <h2 style={sectionTitleStyle}>Résistance structurelle</h2>
        {woodCapacityTable ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={compactTableStyle}>
              <thead>
                <tr style={{ backgroundColor: '#eee' }}>
                  <th style={tableHeadCellStyle}>Verification</th>
                  <th style={tableHeadCellStyle}>Temperature normale</th>
                  <th style={tableHeadCellStyle}>R30</th>
                  <th style={tableHeadCellStyle}>R60</th>
                </tr>
              </thead>
              <tbody>
                {woodCapacityTable.rows.map((row) => (
                  <tr key={row.label}>
                    <td style={tableCellStyle}>{row.label}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                      {formatCapacityCell(row.normal_temperature)}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                      {formatCapacityCell(row.R30)}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                      {formatCapacityCell(row.R60)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ display: 'inline-block', background: '#f6f6f6', border: '1px solid #ddd', padding: '10px' }}>
            {woodBeamSpanResult?.error || woodStudCompressionResult?.error || 'N/A'}
          </div>
        )}

        {woodStudCompressionResult && !woodStudCompressionResult.error ? (
          <details style={{ marginTop: '12px', maxWidth: '900px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              Hypothèses du calcul de résistance des parois porteuses
            </summary>
            <div style={{ marginTop: '8px', padding: '12px 14px', border: '1px solid #ddd', borderRadius: '6px', background: '#fafafa' }}>
              <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.55 }}>
                <li>Calcul appliqué uniquement à une structure en bois (`holz` ou `holzwerkstoff`). Catégorie détectée : {(woodStudCompressionResult.input?.materialCategoryIds ?? []).join(', ') || 'N/A'}.</li>
                <li>Montant modélisé comme une barre comprimée de section rectangulaire pleine ; flambage vérifié uniquement dans le sens de l’épaisseur du mur (dimension h).</li>
                <li>Dans l’autre sens, le montant est supposé maintenu par un panneau de contreventement continu ; le flambage dans cette direction n’est donc pas vérifié.</li>
                <li>
                  Section : b = {formatNumber(woodStudCompressionResult.input?.b_mm, 0)} mm,
                  h = {formatNumber(woodStudCompressionResult.input?.h_mm, 0)} mm,
                  entraxe = {formatNumber(woodStudCompressionResult.input?.spacing_mm, 0)} mm.
                  {woodStudCompressionResult.input?.isContinuousSupport ? ' Structure continue calculée comme une bande porteuse de 1 m.' : ''}
                </li>
                <li>
                  Bois : {woodStudCompressionResult.input?.woodFamily} / {woodStudCompressionResult.input?.woodClass}.
                  Longueur de flambage = {formatNumber(woodStudCompressionResult.input?.bucklingLength_mm, 0)} mm.
                </li>
                <li>
                  Excentricités appliquées : {formatNumber(woodStudCompressionResult.input?.eccentricity_along_h_mm ?? 0, 0)} mm selon h et {formatNumber(woodStudCompressionResult.input?.eccentricity_along_b_mm ?? 0, 0)} mm selon b.
                  La résistance retenue est la plus faible entre le flambage et l’interaction compression-flexion.
                </li>
                <li>
                  À température normale : élancement relatif λrel = {formatNumber(woodStudCompressionResult.normalTemperature?.buckling?.lambda_rel, 2)} et facteur de réduction kc = {formatNumber(woodStudCompressionResult.normalTemperature?.buckling?.kc, 2)}.
                </li>
                <li>
                  Incendie : exposition sur {woodStudCompressionResult.input?.fireExposureFaces} face{woodStudCompressionResult.input?.fireExposureFaces === 1 ? '' : 's'},
                  protection = {formatNumber(woodStudCompressionResult.input?.t_protection_min ?? 0, 1)} min.
                  {woodStudCompressionResult.input?.hasLateralFireProtection ? ' Les côtés de la structure sont considérés protégés.' : ''}
                </li>
                {(woodStudCompressionResult.fire ?? []).map((fireResult) => (
                  <li key={fireResult.fireMinutes}>
                    R{fireResult.fireMinutes} : profondeur fictive consommée d’eff = {formatNumber(fireResult.d_eff_mm, 1)} mm ;
                    section résiduelle {fireResult.valid ? `${formatNumber(fireResult.bfi_mm, 0)} × ${formatNumber(fireResult.hfi_mm, 0)} mm` : 'insuffisante'}.
                  </li>
                ))}
                <li>La force maximale par mètre de mur est obtenue à partir de la résistance d’un montant divisée par son entraxe.</li>
              </ul>
              <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                Prédimensionnement simplifié selon SIA 265 ; les assemblages, les appuis locaux, le cisaillement, les effets de second ordre détaillés et la stabilité globale ne sont pas vérifiés.
              </small>
            </div>
          </details>
        ) : null}

        <h2 style={sectionTitleStyle}>Résistance thermique</h2>
        {thermalDetails ? (
          <details style={{ maxWidth: '1100px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              Détail du calcul de la valeur U
            </summary>
            <div style={{ marginTop: '8px', padding: '14px', border: '1px solid #ddd', borderRadius: '6px', background: '#fafafa' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', marginBottom: '14px' }}>
                <div>
                  <strong>hi</strong> = {formatNumber(thermalDetails.surface.hi_W_m2K, 2)} W/m²K<br />
                  Rsi = 1 / hi = {formatNumber(1 / thermalDetails.surface.hi_W_m2K, 3)} m²K/W
                </div>
                <div>
                  <strong>he</strong> = {formatNumber(thermalDetails.surface.he_W_m2K, 2)} W/m²K<br />
                  Rse = 1 / he = {formatNumber(1 / thermalDetails.surface.he_W_m2K, 3)} m²K/W
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ ...compactTableStyle, width: '100%' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#eee' }}>
                      <th style={tableHeadCellStyle}>Type</th>
                      <th style={tableHeadCellStyle}>Couche / chemin</th>
                      <th style={tableHeadCellStyle}>Calcul</th>
                      <th style={{ ...tableHeadCellStyle, textAlign: 'right' }}>R [m²K/W]</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thermalDetails.surface.terms.map((term) => (
                      <tr key={term.label}>
                        <td style={tableCellStyle}>Surface</td>
                        <td style={tableCellStyle}>{term.label}</td>
                        <td style={tableCellStyle}>
                          {term.coefficient} = {formatNumber(term.coefficient_W_m2K, 2)} W/m²K → R = 1 / {term.coefficient}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'right' }}>{formatNumber(term.resistance_m2K_W, 3)}</td>
                      </tr>
                    ))}
                    {thermalDetails.resistanceTerms.map((term, index) => {
                      if (term.type === 'ignored') {
                        return (
                          <tr key={`ignored-${index}`}>
                            <td style={tableCellStyle}>Non incluse</td>
                            <td style={tableCellStyle}>{renderLayerName(term.layer)}</td>
                            <td style={tableCellStyle}>Couche « {term.reason} »</td>
                            <td style={{ ...tableCellStyle, textAlign: 'right' }}>—</td>
                          </tr>
                        );
                      }
                      if (term.type === 'series') {
                        return (
                          <tr key={`series-${index}`}>
                            <td style={tableCellStyle}>Série</td>
                            <td style={tableCellStyle}>{renderLayerName(term.layer)}</td>
                            <td style={tableCellStyle}>
                              {term.isAirLayer
                                ? 'Rair = 0,180 m²K/W (valeur conventionnelle)'
                                : term.included
                                ? `R = e / λ = ${formatNumber(term.thickness_m, 3)} / ${formatNumber(term.conductivity_W_mK, 3)}`
                                : 'Non incluse : épaisseur ou conductivité λ manquante'}
                            </td>
                            <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                              {term.resistance_m2K_W === null ? 'N/A' : formatNumber(term.resistance_m2K_W, 3)}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={`parallel-${index}`}>
                          <td style={tableCellStyle}>Parallèle</td>
                          <td style={tableCellStyle}>
                            {term.paths.map((path, pathIndex) => (
                              <div key={pathIndex}>
                                {path.label || renderLayerName(path.layer)} — f{pathIndex + 1} = {formatNumber(path.fraction, 3)}, λ{pathIndex + 1} = {path.conductivity_W_mK === null
                                  ? path.isAirLayer ? '— (air)' : 'N/A'
                                  : `${formatNumber(path.conductivity_W_mK, 3)} W/mK`},{' '}
                                {path.airResistance_m2K_W > 0 && path.materialResistance_m2K_W > 0
                                  ? `R${pathIndex + 1} = Rmat + Rair = ${formatNumber(path.materialResistance_m2K_W, 3)} + ${formatNumber(path.airResistance_m2K_W, 3)} = ${formatNumber(path.resistance_m2K_W, 3)}`
                                  : path.airResistance_m2K_W > 0
                                    ? `R${pathIndex + 1} = Rair = ${formatNumber(path.airResistance_m2K_W, 3)}`
                                    : `R${pathIndex + 1} = ${path.resistance_m2K_W === null ? 'N/A' : formatNumber(path.resistance_m2K_W, 3)}`}
                              </div>
                            ))}
                          </td>
                          <td style={tableCellStyle}>
                            {term.complete ? 'Req = 1 / (f1 / R1 + f2 / R2)' : 'Calcul parallèle incomplet : λ manquant'}
                          </td>
                          <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                            {term.equivalentResistance_m2K_W === null ? 'N/A' : formatNumber(term.equivalentResistance_m2K_W, 3)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '14px', padding: '12px', background: '#f1f1f1', borderRadius: '6px' }}>
                <div>
                  <strong>R total en série</strong> = résistances superficielles + Σ R couches + Σ R équivalentes parallèles ={' '}
                  {thermalDetails.totalResistance_m2K_W === null ? 'N/A' : `${formatNumber(thermalDetails.totalResistance_m2K_W, 3)} m²K/W`}
                </div>
                <div style={{ marginTop: '5px' }}>
                  <strong>U = 1 / R total</strong> ={' '}
                  {thermalDetails.uValue_W_m2K === null ? 'N/A' : `${formatNumber(thermalDetails.uValue_W_m2K, 3)} W/m²K`}
                </div>
              </div>
            </div>
          </details>
        ) : (
          <div style={{ display: 'inline-block', background: '#f6f6f6', border: '1px solid #ddd', padding: '10px' }}>N/A</div>
        )}

        <h2 style={sectionTitleStyle}>{t.structure}</h2>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '6px',
            backgroundColor: '#fff',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#eee' }}>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.layer}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.name}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.thickness}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.width}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.spacing}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.surface_mass}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.gwp}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.thermal_resistance}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.layer}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.fiberDirection}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.reactionToFire}</th>
              <th style={{ border: '1px solid #ccc', padding: '8px' }}>{t.kbobId}</th>
            </tr>
          </thead>
          <tbody>
            {layers.map((layer, index) => (
              <tr
                key={index}
                style={isSupportStructureLayer(layer) ? {
                  fontWeight: 700,
                  outline: '3px solid #222',
                  outlineOffset: '-3px',
                } : undefined}
              >
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {layer?.translations?.[lang]?.description}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{renderLayerName(layer)}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {layer.thickness_mm != null ? `${formatNumber(layer.thickness_mm, 0)} mm` : 'N/A'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {layer.width_mm != null ? `${formatNumber(layer.width_mm, 0)} mm` : 'N/A'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {layer.spacing_mm != null ? `${formatNumber(layer.spacing_mm, 0)} mm` : 'N/A'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {layer.weight_kg_m2 != null ? `${formatNumber(layer.weight_kg_m2, 1)} kg/m²` : 'N/A'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {layer.weight_kg_m2 != null ? `${formatNumber(layer.gwp_kgco2e_m2, 1)} kgCO²-eq/m²` : 'N/A'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                  {layer.weight_kg_m2 != null ? `${formatNumber(layer.thermalResistance_m2K_W, 1)} m²K/W` : 'N/A'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{layer.structure ?? 'N/A'}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{layer.fiberDirection ?? 'N/A'}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{layer.reactionToFire ?? 'N/A'}</td>
                <td style={{ border: '1px solid #ccc', padding: '8px' }}>{layer.kbobId ?? 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {layers.length > 0 && (
          <div style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
            <ViewSVG
              title="Coupe transverse"
              layers={layers}
              view="transverse"
              pxPerMmY={pxPerMmY}
              pxPerMmX={pxPerMmX}
            />
            <ViewSVG
              title="Coupe longitudinale"
              layers={layers}
              view="longitudinal"
              pxPerMmY={pxPerMmY}
              pxPerMmX={pxPerMmX}
            />
          </div>
        )}
      </div>
    </>
  );
}

export default Element;
