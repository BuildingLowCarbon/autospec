const prepareSystemComponentCreation = ({ actor, file, component, databases }) => {
  const fail = (message, statusCode) => { const error = new Error(message); error.statusCode = statusCode; throw error; };
  if (actor?.role !== 'admin') fail('Seul un administrateur peut créer un composant dans une base système.', 403);
  const destination = databases.find((database) => database.file === file);
  if (!destination) fail('Base de destination inconnue.', 400);
  if (!component || typeof component.id !== 'string' || !component.id.trim()) fail('Un nouvel identifiant de composant est requis.', 400);
  if (!component.categoryId || !Array.isArray(component.structure?.layers)) fail('Catégorie et couches du composant requises.', 400);
  if (databases.some((database) => database.items.some((item) => String(item.id) === component.id))) {
    fail('Cet identifiant existe déjà dans une base système. Dupliquez le composant avec un nouvel identifiant.', 409);
  }
  const clean = Object.fromEntries(Object.entries(component).filter(([key]) => !key.startsWith('__')));
  for (const key of ['metadata', 'generated', 'generationSignature', 'generationRunId', 'generatedAt']) delete clean[key];
  const databaseId = ({
    'components_custom.json': 'custom',
    'components_lignum_selected.json': 'lignum',
    'components_minergie_enriched.json': 'minergie',
    'components_btk_enriched.json': 'btk',
    'components_generated.json': 'generated',
  })[file] || destination.items[0]?.source?.databaseId || file.replace(/\.json$/, '');
  clean.source = { name: destination.label, databaseId };
  return clean;
};

module.exports = { prepareSystemComponentCreation };
