const MATERIAL_CATEGORY_LABELS = {
  backstein: { fr: 'Brique', de: 'Backstein', en: 'Brick', it: 'Laterizio' },
  gestein: { fr: 'Pierre', de: 'Gestein', en: 'Stone', it: 'Pietra' },
  gips: { fr: 'Plâtre', de: 'Gips', en: 'Gypsum', it: 'Gesso' },
  glas: { fr: 'Verre', de: 'Glas', en: 'Glass', it: 'Vetro' },
  glaswolle: { fr: 'Laine de verre', de: 'Glaswolle', en: 'Glass wool', it: 'Lana di vetro' },
  holz: { fr: 'Bois', de: 'Holz', en: 'Timber', it: 'Legno' },
  holzwerkstoff: { fr: 'Dérivé du bois', de: 'Holzwerkstoff', en: 'Wood-based material', it: 'Derivato del legno' },
  keramik: { fr: 'Céramique', de: 'Keramik', en: 'Ceramic', it: 'Ceramica' },
  kunststoffe: { fr: 'Plastique', de: 'Kunststoff', en: 'Plastic', it: 'Plastica' },
  kunststoffe_elastomere: { fr: 'Élastomère', de: 'Elastomer', en: 'Elastomer', it: 'Elastomero' },
  kunststoffe_thermoplaste: { fr: 'Thermoplastique', de: 'Thermoplast', en: 'Thermoplastic', it: 'Termoplastico' },
  lehm_erde: { fr: 'Terre / argile', de: 'Lehm / Erde', en: 'Earth / clay', it: 'Terra / argilla' },
  metallisch: { fr: 'Métal', de: 'Metall', en: 'Metal', it: 'Metallo' },
  mineralisch_kunstlich: { fr: 'Minéral artificiel', de: 'Künstlich mineralisch', en: 'Artificial mineral', it: 'Minerale artificiale' },
  mineralische_fasern: { fr: 'Fibres minérales', de: 'Mineralfasern', en: 'Mineral fibres', it: 'Fibre minerali' },
  organisch_erneuerbar: { fr: 'Organique renouvelable', de: 'Organisch erneuerbar', en: 'Renewable organic', it: 'Organico rinnovabile' },
  organisch_fossil: { fr: 'Organique fossile', de: 'Organisch fossil', en: 'Fossil organic', it: 'Organico fossile' },
  pflanzliche_fasern: { fr: 'Fibres végétales', de: 'Pflanzenfasern', en: 'Plant fibres', it: 'Fibre vegetali' },
  zementgebunden: { fr: 'Lié au ciment', de: 'Zementgebunden', en: 'Cement-bound', it: 'Legato con cemento' },
};

export const getMaterialCategoryLabel = (categoryId, lang = 'fr') => {
  const labels = MATERIAL_CATEGORY_LABELS[categoryId];
  if (labels) return labels[lang] ?? labels.fr ?? labels.en;
  return String(categoryId ?? '').replace(/_/g, ' ');
};

export const getLayerMaterialCategoryIds = (layer, materialById, productById) => {
  if (!layer) return [];
  const targetId = layer.productId;
  if (!targetId) return layer.materialcategoryId ? [layer.materialcategoryId] : [];
  const key = String(targetId);
  const directMaterial = materialById.get(key);
  if (directMaterial?.materialcategoryId) return [directMaterial.materialcategoryId];

  const product = productById.get(key);
  if (!Array.isArray(product?.composition)) return [];
  return [...new Set(product.composition
    .map((entry) => entry?.material?.id)
    .filter(Boolean)
    .map((materialId) => materialById.get(String(materialId))?.materialcategoryId)
    .filter(Boolean))];
};
