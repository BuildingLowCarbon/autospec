import React, { useEffect, useState, useContext, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
import { ViewSVG, DEFAULT_PX_PER_MM_X } from '../components/Graphic';
import translations from '../language/translations';
import LangContext from '../context/LangContext';
import loadComponents from '../utils/loadComponents';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import { getAcousticInsulation } from '../utils/acoustic';
import { applyCustomFireTimingToComponent } from '../utils/customFireTiming';
import categoriesData from '../data/categories.json';
import { getComponentSubcategoryId, getSubcategoryLabel } from '../utils/componentTaxonomy';

const compactTableStyle = {
  width: 'auto',
  maxWidth: '100%',
  borderCollapse: 'collapse',
  marginTop: '16px',
  backgroundColor: '#fff',
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
  const layers = componentWithFireTiming?.structure?.layers ?? data?.structure?.layers ?? [];
  const woodBeamSpanResult = componentWithFireTiming?.fire_resistance?.wood_beam_span ?? null;
  const woodStudCompressionResult = componentWithFireTiming?.fire_resistance?.wood_stud_compression ?? null;
  const woodCapacityTable = componentWithFireTiming?.fire_resistance?.wood_capacity_table ?? null;
  const category = categoriesData.categories.find((item) => item.id === data?.categoryId);
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
        <p>
          <Link to={`/custom/${data.id}`}>Ouvrir la version custom</Link>
        </p>
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
          <strong>{t.category} :</strong> {data.categoryId}
        </p>
        {subcategoryLabel ? (
          <p>
            <strong>Sous-catégorie :</strong> {subcategoryLabel}
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

        <h2>{t.acoustic_insulation}</h2>
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
          </tbody>
        </table>
        </div>

        <h2>Portées</h2>
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

        <h2>{t.structure}</h2>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '16px',
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
            {data.structure?.layers?.map((layer, index) => (
              <tr key={index}>
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
