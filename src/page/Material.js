import React, { useEffect, useState, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import Header from '../components/Header';
import translations from '../language/translations';
import LangContext from '../context/LangContext';
import loadMaterials from '../utils/loadMaterials';

function Material() {
  const { id } = useParams();
  const [material, setMaterial] = useState(null);
  const { lang, setLang } = useContext(LangContext);
  const t = translations[lang];

  useEffect(() => {
    const fetchData = async () => {
      const mats = await loadMaterials();
      const found = mats.find((m) => String(m.id) === String(id));
      setMaterial(found || null);
    };
    fetchData();
  }, [id]);

  if (!material) return <p>Chargement...</p>;

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
        <h2>Matériau</h2>
        <p>
          <strong>{workingtitle || 'Sans nom'}</strong>
        </p>
        <p>
          <strong>ID :</strong> {material.id}
        </p>
        <p>
          <strong>KBOB :</strong> {kbobId ?? 'N/A'}
        </p>
        <p>
          <strong>SIA :</strong> {siaId ?? 'N/A'}
        </p>
        <p>
          <strong>Type :</strong> {materialTypeId ?? 'N/A'}
        </p>
        <p>
          <strong>Catégorie :</strong> {materialcategoryId ?? 'N/A'}
        </p>
        <p>
          <strong>Fonction :</strong> {functionId ?? 'N/A'}
        </p>
        <p>
          <strong>Densité :</strong> {density_kg_m3 ?? 'N/A'} kg/m³
        </p>
        <p>
          <strong>Épaisseur :</strong> {thickness_mm ?? 'N/A'} mm
        </p>
        <p>
          <strong>λ :</strong> {thermalConductivity_W_mK ?? 'N/A'} W/mK
        </p>
        <p>
          <strong>Chaleur spé. Wh/kgK :</strong> {specificHeat_Wh_kgK ?? 'N/A'}
        </p>
        <p>
          <strong>Chaleur spé. J/kgK :</strong> {specificHeat_J_kgK ?? 'N/A'}
        </p>
        <p>
          <strong>μ (sec) :</strong> {waterVaporDiffusionResistanceCoefficientDry ?? 'N/A'}
        </p>
        <p>
          <strong>μ (humide) :</strong> {waterVaporDiffusionResistanceCoefficientWet ?? 'N/A'}
        </p>
        <p>
          <strong>Classe feu :</strong> {fireClassification ?? 'N/A'}
        </p>
        <p>
          <strong>Réaction au feu :</strong> {reactionToFire ?? 'N/A'}
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
