import React, { useEffect, useState, useContext, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
import translations from '../language/translations';
import LangContext from '../context/LangContext';
import loadProducts from '../utils/loadProducts';
import loadMaterials from '../utils/loadMaterials';

function Product() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [materials, setMaterials] = useState([]);
  const { lang, setLang } = useContext(LangContext);
  const t = translations[lang];

  useEffect(() => {
    const fetchData = async () => {
      const [prods, mats] = await Promise.all([loadProducts(), loadMaterials()]);
      setMaterials(mats);
      const found = prods.find((p) => String(p.id) === String(id));
      setProduct(found || null);
    };
    fetchData();
  }, [id]);

  const materialById = useMemo(() => new Map(materials.map((m) => [String(m.id), m])), [materials]);

  if (!product) return <p>Chargement...</p>;

  const { workingtitle, unit, kbobId, siaId, productTypeId, productCategoryId, functionId, declaredProperties, dimensions, source, composition, calculatedProperties } =
    product;

  const formatNumber = (value, decimals) => {
    if (value === null || value === undefined || value === '') return 'N/A';
    const num = Number(value);
    if (Number.isNaN(num)) return 'N/A';
    return num.toFixed(decimals);
  };

  const renderMaterialLink = (materialRef) => {
    const mat = materialById.get(String(materialRef?.id));
    const label = materialRef?.workingtitle || mat?.workingtitle || materialRef?.id || 'Matériau';
    if (mat) {
      return <Link to={`/material/${mat.id}`}>{label}</Link>;
    }
    if (materialRef?.id) {
      return <Link to={`/material/${materialRef.id}`}>{label}</Link>;
    }
    return label;
  };

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <div style={{ padding: '20px' }}>
        <h2>Produit</h2>
        <p>
          <strong>{workingtitle || 'Sans nom'}</strong>
        </p>
        <p>
          <strong>ID :</strong> {product.id}
        </p>
        <p>
          <strong>Unité :</strong> {unit ?? 'N/A'}
        </p>
        <p>
          <strong>KBOB ID :</strong> {kbobId ?? 'N/A'}
        </p>
        <p>
          <strong>SIA ID :</strong> {siaId ?? 'N/A'}
        </p>
        <p>
          <strong>Type :</strong> {productTypeId ?? 'N/A'}
        </p>
        <p>
          <strong>Catégorie :</strong> {productCategoryId ?? 'N/A'}
        </p>
        <p>
          <strong>Fonction :</strong> {functionId ?? 'N/A'}
        </p>
        <p>
          <strong>Dimensions (mm) :</strong>{' '}
          {dimensions
            ? `${formatNumber(dimensions.thickness_mm, 1)} x ${formatNumber(dimensions.width_mm, 2)} x ${formatNumber(dimensions.length_mm, 3)}`
            : 'N/A'}
        </p>
        <div style={{ marginTop: '20px' }}>
          <h3>Propriété déclarée</h3>
            <p>
              <strong>Densité :</strong> {formatNumber(declaredProperties?.density_kg_m3, 1)} kg/m³
            </p>
            <p>
              <strong>λ :</strong> {formatNumber(declaredProperties?.thermalConductivity_W_mK, 3)} W/mK
            </p>
            <p>
              <strong>Chaleur spé. Wh/kgK :</strong> {formatNumber(declaredProperties?.specificHeat_Wh_kgK, 4)}
            </p>
            <p>
              <strong>Chaleur spé. J/kgK :</strong> {formatNumber(declaredProperties?.specificHeat_J_kgK, 0)}
            </p>
            <p>
              <strong>μ (sec) :</strong> {formatNumber(declaredProperties?.waterVaporDiffusionResistanceCoefficientDry, 1)}
            </p>
            <p>
              <strong>μ (humide) :</strong> {formatNumber(declaredProperties?.waterVaporDiffusionResistanceCoefficientWet, 2)}
            </p>
            <p>
              <strong>Classe feu :</strong> {declaredProperties?.fireClassification ?? 'N/A'}
            </p>
            <p>
              <strong>Réaction au feu :</strong> {declaredProperties?.reactionToFire ?? 'N/A'}
            </p>
        </div>
        <div style={{ marginTop: '20px' }}>
          <h3>Propriété calculée</h3>
            <p>
              <strong>Densité calculée :</strong> {formatNumber(calculatedProperties?.density_kg_m3, 1)} kg/m³
            </p>
            <p>
              <strong>λ :</strong> {formatNumber(calculatedProperties?.thermalConductivity_W_mK, 3)} W/mK
            </p>
            <p>
              <strong>Chaleur spé. Wh/kgK :</strong> {formatNumber(calculatedProperties?.specificHeat_Wh_kgK, 4)}
            </p>
            <p>
              <strong>Chaleur spé. J/kgK :</strong> {formatNumber(calculatedProperties?.specificHeat_J_kgK, 1)}
            </p>
            <p>
              <strong>Source :</strong> {source?.databaseId ?? 'N/A'} {source?.externalId ? `(${source.externalId})` : ''}
            </p>
        </div>

        {Array.isArray(composition) && composition.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h3>Composition</h3>
            <ul style={{ listStyle: 'disc', paddingLeft: '20px' }}>
              {composition.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '8px' }}>
                  <div>
                    <strong>{item.role || 'Rôle'} :</strong> {renderMaterialLink(item.material)}
                  </div>
                  {item.quantity && (
                    <div>
                      <strong>Quantité :</strong> {formatNumber(item.quantity.value, 2)} {item.quantity.unit}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>
          <Link to="/">← Retour</Link>
        </p>
      </div>
    </>
  );
}

export default Product;

