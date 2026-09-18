const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dbDir = path.join(root, 'public/db');
const write = process.argv.includes('--write');
const componentIdsArgumentIndex = process.argv.indexOf('--component-ids');
const selectedComponentIds = componentIdsArgumentIndex >= 0
  ? new Set(String(process.argv[componentIdsArgumentIndex + 1] ?? '').split(',').filter(Boolean))
  : null;
const manifest = JSON.parse(fs.readFileSync(path.join(dbDir, 'db_files.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(root, 'src/data/categories.json'), 'utf8')).categories;
const systems = JSON.parse(fs.readFileSync(path.join(root, 'src/data/construction_systems.json'), 'utf8')).systems;
const eccc = JSON.parse(fs.readFileSync(path.join(root, 'src/data/eccc.json'), 'utf8'));
const materials = JSON.parse(fs.readFileSync(path.join(dbDir, 'materials/tbz_materials.json'), 'utf8'));
const products = JSON.parse(fs.readFileSync(path.join(dbDir, 'products/tbz_products_composites.json'), 'utf8'));

const catalog = new Map([...materials, ...products].map((item) => [String(item.id), item]));
const categoryById = new Map(categories.map((category) => [category.id, category]));
const systemIds = new Set(systems.map((system) => system.id));
const ecccById = new Map(eccc.map((item) => [item.id, item]));
const backupDirectory = write
  ? path.join(dbDir, 'versions', 'component_metadata_completion', new Date().toISOString().replace(/[:.]/g, '-'))
  : null;
const woodSystems = new Set([
  'bresta_solid_timber_system', 'bresta_solid_timber_system_planked_on_one_side',
  'hollow_box_element', 'ribs', 'ribs_joists', 'ribs_rafters',
  'solid_timber_derived_wood_products', 'solid_wood_panel', 'stud',
  'timber_concrete_composite_floor_tccf',
]);
const bearingCategories = new Set(['foundation', 'floor_assembly', 'outer_wall', 'inner_wall', 'flat_roof_shed_roof', 'steep_roof', 'underground_roof', 'balcony']);

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const layerText = (layer) => normalize([
  layer?.translations?.fr?.description,
  layer?.translations?.de?.description,
  layer?.productName,
  catalog.get(String(layer?.productId))?.workingtitle,
].filter(Boolean).join(' '));
const componentText = (component) => normalize([
  component?.translations?.fr?.name,
  component?.translations?.de?.name,
  component?.workingtitle,
  component?.serialNo,
].filter(Boolean).join(' '));
const layerDescription = (layer) => normalize(
  layer?.translations?.fr?.description ?? layer?.translations?.en?.description ?? layer?.translations?.de?.description ?? '',
);

const normalizeTaxonomy = (component) => {
  if (component.categoryId === 'partition_wall_single_shell') return { ...component, categoryId: 'partition_wall', subcategoryId: 'single_shell' };
  if (component.categoryId === 'partition_wall_double_shell') return { ...component, categoryId: 'partition_wall', subcategoryId: 'double_shell' };
  return component;
};

const structuralKind = (layer) => {
  const text = layerText(layer);
  const thickness = Number(layer?.thickness_mm) || 0;
  const materialCategory = catalog.get(String(layer?.productId))?.materialcategoryId;
  const explicitlyStructural = /^(structure support|supporting structure|tragkonstruktion|support|trager|träger)\b/.test(layerDescription(layer));
  if (explicitlyStructural && ['holz', 'holzwerkstoff'].includes(materialCategory)) {
    return layer?.spacing_mm ? 'wood' : 'solid_wood_panel';
  }
  if (explicitlyStructural && materialCategory === 'metallisch') return 'steel';
  if (/magerbeton|beton maigre/.test(text)) return null;
  if (/beton|béton|concrete/.test(text) && thickness >= 70) return 'concrete';
  if (/backstein|kalksandstein|mauerwerk|maconnerie|maçonnerie|ytong|zementstein/.test(text) && thickness >= 80) return 'masonry';
  if (/brettsperrholz/.test(text) && thickness >= 60) return 'solid_wood_panel';
  if (/brettschichtholz|vollholzhaus|massivholz/.test(text) && thickness >= 60) return 'wood';
  if (/stahlprofil/.test(text) && (
    /^stahlprofil$/.test(layerDescription(layer))
    ||
    (Number(layer?.spacing_mm) > 0 && (thickness >= 1 || Number(layer?.width_mm) >= 40))
    || /stahlleicht|light.?gauge/.test(text)
  )) return 'steel';
  if (/stahlblech|tole d.acier|tôle d.acier/.test(text) && layer?.spacing_mm) return 'steel';
  return null;
};

const supportCandidate = (component) => {
  const layers = component?.structure?.layers ?? [];
  const candidates = layers.map((layer, index) => ({ layer, index, kind: structuralKind(layer) })).filter((candidate) => candidate.kind);
  if (!candidates.length && /stahlleicht|light.?gauge/.test(componentText(component))) {
    const steelProfileIndex = layers.findIndex((layer) => /stahlprofil|profil.*acier|steel profile/.test(layerText(layer)));
    if (steelProfileIndex >= 0) return { layer: layers[steelProfileIndex], index: steelProfileIndex, kind: 'steel' };
  }
  if (!candidates.length) return null;
  const explicit = candidates.filter(({ layer }) => /^(structure support|supporting structure|tragkonstruktion|support|trager|träger)\b/.test(layerDescription(layer)));
  if (explicit.length === 1) return explicit[0];
  if (explicit.length > 1) return null;
  const kinds = new Set(candidates.map((candidate) => candidate.kind === 'solid_wood_panel' ? 'wood' : candidate.kind));
  if (kinds.size > 1) return null;
  const spaced = candidates.filter(({ layer }) => Number(layer?.spacing_mm) > 0 && Number(layer.spacing_mm) <= 1500);
  const pool = spaced.length ? spaced : candidates;
  const ordered = [...pool].sort((a, b) => (Number(b.layer?.thickness_mm) || 0) - (Number(a.layer?.thickness_mm) || 0));
  if (ordered.length > 1 && Number(ordered[0].layer?.thickness_mm) === Number(ordered[1].layer?.thickness_mm)) {
    // A non-bearing partition can contain two identical structural panels.  We
    // only need a stable reference layer for its system and eCCC assignment;
    // neither panel will be marked as a load-bearing structure below.
    if (component.categoryId !== 'partition_wall') return null;
  }
  return ordered[0];
};

const inferSystem = (component, candidate) => {
  const text = componentText(component);
  if (/stahlleicht|light.?gauge/.test(text)) return 'light_gauge_steel_frame';
  if (!candidate) return null;
  if (candidate.kind === 'concrete') return 'concrete';
  if (candidate.kind === 'masonry') return 'masonry';
  if (candidate.kind === 'steel') return 'light_gauge_steel_frame';
  if (/holz.?beton|bois.?beton|timber.?concrete/.test(text)) return 'timber_concrete_composite_floor_tccf';
  if (/bresta|vollholzhaus/.test(`${text} ${layerText(candidate.layer)}`)) return 'bresta_solid_timber_system';
  if (/caisson|hohlkasten|hollow.?box/.test(text)) return 'hollow_box_element';
  if (candidate.kind === 'solid_wood_panel' || !candidate.layer?.spacing_mm) return 'solid_wood_panel';
  if (component.categoryId === 'outer_wall' || component.categoryId === 'inner_wall' || component.categoryId === 'partition_wall') return 'stud';
  if (component.categoryId === 'steep_roof') return 'ribs_rafters';
  if (component.categoryId === 'floor_assembly') return 'ribs_joists';
  if (component.categoryId === 'flat_roof_shed_roof') return 'ribs';
  return 'solid_timber_derived_wood_products';
};

const isFloorFinish = (text) => /parkett|parquet|laminat|kunststeinplatte|dalle en pierre|carrelage/.test(text);
const isFinish = (text) => /putz|enduit|anstrich|peinture|gipsplatte|plaque de platre|plaque de plâtre/.test(text);
const isInsulation = (text) => /damm|dämm|isol|wolle|laine|polystyrol|polystyrene|polystyrène|pur|pir|xps|eps|schaumglas/.test(text);
const isWaterproof = (text) => /dichtungsbahn|etanche|étanche|bitumen|epdm/.test(text);
const isCladding = (text) => /fassade|lambris|faserzement|wellplatte|keramik|steinzeug|chromstahl|bardage|verankerung|unterkonstruktion/.test(text);

const structuralEccc = (component) => {
  if (component.categoryId === 'foundation') return /fondation(?! plate)|fundament/.test(componentText(component)) ? 'C01.02' : 'C01.03';
  return {
    floor_assembly: 'C04.01', outer_wall: 'C02.01', inner_wall: 'C02.02',
    flat_roof_shed_roof: 'C04.04', steep_roof: 'C04.05', underground_roof: 'C04.04', balcony: 'C04.08',
  }[component.categoryId] ?? null;
};

const inferEccc = (component, layer, index, referenceIndex) => {
  const text = layerText(layer);
  const beforeStructure = index < referenceIndex;
  const afterStructure = index > referenceIndex;
  if (index === referenceIndex) return component.categoryId === 'partition_wall' ? 'G01.01' : structuralEccc(component);
  if (component.categoryId === 'floor_assembly') {
    if (beforeStructure) return isFloorFinish(text) ? 'G02.02' : 'G02.01';
    if (afterStructure) return isFinish(text) ? 'G04.02' : 'G04.01';
  }
  if (component.categoryId === 'foundation') {
    if (beforeStructure) return isFloorFinish(text) ? 'G02.02' : 'G02.01';
    if (afterStructure) return 'C01.01';
  }
  if (['flat_roof_shed_roof', 'underground_roof', 'steep_roof'].includes(component.categoryId)) {
    if (beforeStructure) return component.categoryId === 'steep_roof' ? 'F01.03' : component.categoryId === 'underground_roof' ? 'F01.01' : 'F01.02';
    if (afterStructure) return isFinish(text) ? 'G04.02' : 'G04.01';
  }
  if (component.categoryId === 'outer_wall') {
    if (afterStructure) return isFinish(text) ? 'G03.02' : 'G03.01';
    if (beforeStructure && component.subcategoryId === 'below_ground') {
      if (isWaterproof(text)) return 'E01.01';
      if (isInsulation(text)) return 'E01.02';
      return 'E01.03';
    }
    if (beforeStructure) {
      if (isCladding(text)) return 'E02.03';
      if (isInsulation(text)) return 'E02.02';
      if (isFinish(text)) return 'E02.01';
      return null;
    }
  }
  if (component.categoryId === 'inner_wall') return isFinish(text) ? 'G03.02' : 'G03.01';
  if (component.categoryId === 'partition_wall') return isFinish(text) ? 'G03.02' : 'G01.01';
  if (component.categoryId === 'balcony') return index === referenceIndex ? 'C04.08' : 'E02.05';
  return null;
};

const report = { write, backupDirectory: backupDirectory ? path.relative(root, backupDirectory) : null, files: {}, assignments: [], correctedExisting: [], unresolved: [] };

for (const entry of manifest) {
  const file = path.join(dbDir, entry.file);
  const original = JSON.parse(fs.readFileSync(file, 'utf8'));
  const stats = { components: original.length, processed: 0, supportAdded: 0, systemAdded: 0, ecccAdded: 0, valuesRemoved: 0, markerOnly: 0, ambiguous: 0, unresolved: 0 };
  const next = original.map((rawComponent) => {
    if (selectedComponentIds && !selectedComponentIds.has(String(rawComponent.id))) return rawComponent;
    const removedBefore = stats.valuesRemoved;
    const component = normalizeTaxonomy(rawComponent);
    const layers = component?.structure?.layers ?? [];
    if (!layers.length || !categoryById.has(component.categoryId)) return component;
    const allowedEccc = new Set((categoryById.get(component.categoryId)?.eccc ?? []).map((item) => item.ecccId));
    const candidate = supportCandidate(component);
    const inferredSystem = inferSystem(component, candidate);
    const existingSupports = layers.map((layer, index) => layer?.isSupportStructure === true ? index : -1).filter((index) => index >= 0);
    let blockSupport = false;
    let blockSystem = false;
    const blockedEccc = new Set();
    const nextLayers = layers.map((layer, index) => {
      if (layer.ecccId && !allowedEccc.has(layer.ecccId)) {
        stats.valuesRemoved += 1;
        blockedEccc.add(index);
        report.correctedExisting.push({ file: entry.file, componentId: component.id, field: `layers[${index}].ecccId`, removed: layer.ecccId, reason: 'eCCC incompatible avec la catégorie' });
        return { ...layer, ecccId: '', ecccDescription: '' };
      }
      return { ...layer };
    });
    if (existingSupports.length > 1) {
      existingSupports.forEach((index) => { nextLayers[index].isSupportStructure = false; });
      stats.valuesRemoved += existingSupports.length;
      blockSupport = true;
      report.correctedExisting.push({ file: entry.file, componentId: component.id, field: 'isSupportStructure', removed: existingSupports, reason: 'plusieurs couches porteuses sélectionnées' });
    } else if (existingSupports.length === 1 && candidate && existingSupports[0] !== candidate.index && !structuralKind(layers[existingSupports[0]])) {
      nextLayers[existingSupports[0]].isSupportStructure = false;
      stats.valuesRemoved += 1;
      blockSupport = true;
      report.correctedExisting.push({ file: entry.file, componentId: component.id, field: 'isSupportStructure', removed: existingSupports[0], reason: 'couche sélectionnée manifestement non structurelle' });
    }
    let systemTypeId = component?.structure?.systemTypeId ?? null;
    if (systemTypeId && !systemIds.has(systemTypeId)) {
      report.correctedExisting.push({ file: entry.file, componentId: component.id, field: 'systemTypeId', removed: systemTypeId, reason: 'système inconnu' });
      systemTypeId = null;
      blockSystem = true;
      stats.valuesRemoved += 1;
    } else if (systemTypeId && candidate) {
      const materialMismatch = (systemTypeId === 'concrete' && candidate.kind !== 'concrete')
        || (systemTypeId === 'masonry' && candidate.kind !== 'masonry')
        || (woodSystems.has(systemTypeId) && !['wood', 'solid_wood_panel'].includes(candidate.kind));
      if (materialMismatch) {
        report.correctedExisting.push({ file: entry.file, componentId: component.id, field: 'systemTypeId', removed: systemTypeId, reason: `incompatible avec la couche porteuse détectée (${candidate.kind})` });
        systemTypeId = null;
        blockSystem = true;
        stats.valuesRemoved += 1;
      }
    }
    let changed = stats.valuesRemoved > removedBefore;
    const supportIndex = nextLayers.findIndex((layer) => layer.isSupportStructure === true);
    let effectiveSupportIndex = supportIndex;
    if (supportIndex < 0 && candidate && bearingCategories.has(component.categoryId) && !blockSupport) {
      nextLayers[candidate.index].isSupportStructure = true;
      effectiveSupportIndex = candidate.index;
      stats.supportAdded += 1;
      changed = true;
    }
    if (!systemTypeId && inferredSystem && !blockSystem) {
      systemTypeId = inferredSystem;
      stats.systemAdded += 1;
      changed = true;
    }
    const referenceIndex = effectiveSupportIndex >= 0 ? effectiveSupportIndex : candidate?.index ?? -1;
    if (referenceIndex >= 0) {
      nextLayers.forEach((layer, index) => {
        if (index === 0 || layer.ecccId || blockedEccc.has(index)) return;
        const ecccId = inferEccc(component, layer, index, referenceIndex);
        if (!ecccId || !allowedEccc.has(ecccId)) return;
        layer.ecccId = ecccId;
        layer.ecccDescription = ecccById.get(ecccId)?.name ?? '';
        stats.ecccAdded += 1;
        changed = true;
      });
    }
    if (changed && nextLayers[0]?.ecccId) {
      nextLayers[0].ecccId = '';
      nextLayers[0].ecccDescription = '';
    }
    if (changed) stats.processed += 1;
    if (changed) report.assignments.push({
      file: entry.file,
      componentId: component.id,
      title: component?.translations?.fr?.name ?? component?.workingtitle ?? component?.serialNo ?? '',
      categoryId: component.categoryId,
      systemTypeId,
      supportIndex: effectiveSupportIndex,
      supportProductId: effectiveSupportIndex >= 0 ? nextLayers[effectiveSupportIndex]?.productId ?? null : null,
      supportText: effectiveSupportIndex >= 0 ? layerText(nextLayers[effectiveSupportIndex]) : '',
    });
    const missingEcccIndexes = nextLayers.map((layer, index) => !layer.ecccId ? index : -1).filter((index) => index >= 0);
    const missingRequiredSupport = bearingCategories.has(component.categoryId) && effectiveSupportIndex < 0;
    const unresolved = (!systemTypeId || missingRequiredSupport || missingEcccIndexes.length > 0);
    if (unresolved) {
      stats.unresolved += 1;
      if (systemTypeId && !missingRequiredSupport && missingEcccIndexes.length === 1 && missingEcccIndexes[0] === 0) stats.markerOnly += 1;
      else stats.ambiguous += 1;
      report.unresolved.push({ file: entry.file, componentId: component.id, categoryId: component.categoryId, systemTypeId, supportIndex: effectiveSupportIndex, missingEcccIndexes });
    }
    return { ...component, structure: { ...(component.structure ?? {}), systemTypeId, layers: nextLayers } };
  });
  report.files[entry.file] = stats;
  if (write) {
    fs.mkdirSync(backupDirectory, { recursive: true });
    fs.copyFileSync(file, path.join(backupDirectory, entry.file));
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

const reportFile = path.join(dbDir, 'component_metadata_completion_report.json');
if (write) fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(process.argv.includes('--summary') ? {
  write,
  files: report.files,
  correctedExistingCount: report.correctedExisting.length,
  correctedExisting: report.correctedExisting,
  unresolvedCount: report.unresolved.length,
} : process.argv.includes('--decisions') ? report.assignments : report, null, 2));
