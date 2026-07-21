import React, { useEffect, useState, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import loadMaterials from '../utils/loadMaterials';
import { dashboardFieldLabel, dashboardText } from './dashboard/dashboardI18n';

function Material() {
  const { id } = useParams();
  const [material, setMaterial] = useState(null);
  const { lang, setLang } = useContext(LangContext);
  const t = dashboardText(lang);

  useEffect(() => {
    const fetchData = async () => {
      const mats = await loadMaterials();
      const found = mats.find((m) => String(m.id) === String(id));
      setMaterial(found || null);
    };
    fetchData();
  }, [id]);

  if (!material) return <p>Chargement...</p>;

  const materialName = material.translations?.[lang]?.name
    || material.translations?.fr?.name
    || material.translations?.de?.name
    || material.translations?.en?.name
    || material.workingtitle;
  const materialDescription = material.translations?.[lang]?.description
    || material.translations?.fr?.description
    || material.translations?.de?.description
    || material.translations?.en?.description;

  const {
    workingtitle,
    kbobId,
    siaId,
    materialTypeId,
    materialcategoryId,
    functionId,
    density_kg_m3,
    thickness_mm,
    thermalConductivity_W_mK,
    specificHeat_Wh_kgK,
    specificHeat_J_kgK,
    waterVaporDiffusionResistanceCoefficientDry,
    waterVaporDiffusionResistanceCoefficientWet,
    fireClassification,
    reactionToFire,
    source,
  } = material;

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <div style={{ padding: '20px' }}>
        <h2>{t.material}</h2>
        <p>
          <strong>{materialName || workingtitle || 'Sans nom'}</strong>
        </p>
        {materialDescription ? <p>{materialDescription}</p> : null}
        <p>
          <strong>{dashboardFieldLabel('id', lang)} :</strong> {material.id}
        </p>
        <p>
          <strong>{dashboardFieldLabel('kbobId', lang)} :</strong> {kbobId ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('siaId', lang)} :</strong> {siaId ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('materialTypeId', lang)} :</strong> {materialTypeId ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('materialcategoryId', lang)} :</strong> {materialcategoryId ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('functionId', lang)} :</strong> {functionId ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('density_kg_m3', lang)} :</strong> {density_kg_m3 ?? 'N/A'} kg/m³
        </p>
        <p>
          <strong>{dashboardFieldLabel('thickness_mm', lang)} :</strong> {thickness_mm ?? 'N/A'} mm
        </p>
        <p>
          <strong>{dashboardFieldLabel('thermalConductivity_W_mK', lang)} :</strong> {thermalConductivity_W_mK ?? 'N/A'} W/mK
        </p>
        <p>
          <strong>{dashboardFieldLabel('specificHeat_Wh_kgK', lang)} :</strong> {specificHeat_Wh_kgK ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('specificHeat_J_kgK', lang)} :</strong> {specificHeat_J_kgK ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('waterVaporDiffusionResistanceCoefficientDry', lang)} :</strong> {waterVaporDiffusionResistanceCoefficientDry ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('waterVaporDiffusionResistanceCoefficientWet', lang)} :</strong> {waterVaporDiffusionResistanceCoefficientWet ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('fireClassification', lang)} :</strong> {fireClassification ?? 'N/A'}
        </p>
        <p>
          <strong>{dashboardFieldLabel('reactionToFire', lang)} :</strong> {reactionToFire ?? 'N/A'}
        </p>
        <p>
          <strong>Source :</strong> {source?.databaseId ?? 'N/A'} {source?.externalId ? `(${source.externalId})` : ''}
        </p>
        <p>
          <Link to="/">← Retour</Link>
        </p>
      </div>
    </>
  );
}

export default Material;
