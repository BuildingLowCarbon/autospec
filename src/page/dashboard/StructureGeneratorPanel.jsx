import React, { useEffect, useMemo, useState } from 'react';
import categoriesData from '../../data/categories.json';
import ecccData from '../../data/eccc.json';
import kbobData from '../../data/KBOB_mat_db.json';
import { calculateComponentProperties } from '../../utils/componentPropriety';
import { applyCustomFireTimingToComponent } from '../../utils/customFireTiming';
import loadMaterials from '../../utils/loadMaterials';
import loadProducts from '../../utils/loadProducts';
import { getComponentSubcategoryId, getSubcategoryLabel, normalizeComponentTaxonomy } from '../../utils/componentTaxonomy';
import { apiJson, labelOf } from './dashboardApi';
import { buildVariantCandidates, deriveLayerGroups, expandLayerGroupVariants, expandStructureGroupVariants, layerGroupSignature } from './structureGenerator';
import { inferInsulationTypeId, layerRole } from './structureGrouping';
import StructureVariantEditor from './StructureVariantEditor';
import { createMaterialReferenceResolver } from '../../utils/componentMaterialReferences';
import { invalidateComponentsCache } from '../../utils/loadComponents';
import GenerationHistoryPanel from './GenerationHistoryPanel';
import LayerGroupEditor from './LayerGroupEditor';
import { splitLayersAroundStructure } from './structureGrouping';

const ROLE_LABELS = {
  structure: 'Structure porteuse', insulation: 'Isolation', screed: 'Chape', bracing: 'Contreventement', mass: 'Ajout de masse',
  sealing: 'Étanchéité / pare-vapeur', battens: 'Lattes / profils', connection: 'Liaison', covering: 'Parement / revêtement', finish: 'Finition', other: 'Autre',
};


const emptyLayer = (order = 0) => ({
  order,
  productId: '',
  structure: 'on-lying',
  thickness_mm: null,
  width_mm: null,
  spacing_mm: null,
  isSupportStructure: false,
  layerFunctionId: 'other',
  insulationTypeId: null,
  ecccId: null,
  ecccDescription: null,
  translations: { fr: { name: '', description: '' }, de: { name: '', description: '' }, en: { name: '', description: '' }, it: { name: '', description: '' } },
});

const newManualGroup = (categoryId) => ({
  id: `manual-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
  categoryId,
  position: 'above',
  name: '',
  layers: [emptyLayer()],
  manual: true,
});

const manualId = () => `manual-${globalThis.crypto?.randomUUID?.() || Date.now()}`;

const groupConfigurationCount = (group) => expandLayerGroupVariants(group).length;

const setToggle = (setter, value) => setter((current) => {
  const next = new Set(current);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
});

export default function StructureGeneratorPanel({ components, groups, lang, onGenerated }) {
  const categories = useMemo(() => [...categoriesData.categories].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)), []);
  const availableCategoryIds = useMemo(() => new Set(groups.map((group) => group.categoryId)), [groups]);
  const [categoryId, setCategoryId] = useState('foundation');
  const [subcategoryId, setSubcategoryId] = useState(() => categoriesData.categories.find((category) => category.id === 'foundation')?.subcategories?.[0]?.id || '');
  const [selectedStructures, setSelectedStructures] = useState(new Set());
  const [selectedUpper, setSelectedUpper] = useState(new Set());
  const [selectedLower, setSelectedLower] = useState(new Set());
  const [manualGroups, setManualGroups] = useState([]);
  const [editor, setEditor] = useState(null);
  const [structureEditor, setStructureEditor] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generationName, setGenerationName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidateSelection, setCandidateSelection] = useState(new Set());
  const [updateConfirmationOpen, setUpdateConfirmationOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      apiJson('/api/structures/workspace'),
      loadMaterials(),
      loadProducts(),
    ]).then(([workspace, loadedMaterials, loadedProducts]) => {
      setManualGroups(workspace.layerGroups || []);
      setMaterials(loadedMaterials || []);
      setProducts(loadedProducts || []);
      setMappings(workspace.mappings || []);
    }).catch((error) => setMessage(`Erreur : ${error.message}`));
  }, []);

  const referenceResolver = useMemo(() => createMaterialReferenceResolver(materials, products, mappings), [materials, products, mappings]);
  const resolvedComponents = useMemo(() => components.map(referenceResolver.component), [components, referenceResolver]);
  const resolvedGroups = useMemo(() => groups.map((group) => ({
    ...group, supportLayers: group.supportLayers.map(referenceResolver.layer),
    variants: group.variants.map(referenceResolver.component),
  })), [groups, referenceResolver]);

  const activeCategory = categories.find((category) => category.id === categoryId);
  const subcategories = activeCategory?.subcategories || [];
  const matchesSubcategory = (item) => !subcategories.length || getComponentSubcategoryId(normalizeComponentTaxonomy(item)) === subcategoryId;

  const categoryGroups = useMemo(() => resolvedGroups.filter((group) => group.categoryId === categoryId && matchesSubcategory(group)).map((group) => ({
    ...group,
    label: group.supportLayers.map((layer) => {
      const dimensions = [layer.thickness_mm && `h ${layer.thickness_mm}`, layer.width_mm && `b ${layer.width_mm}`, layer.spacing_mm && `e ${layer.spacing_mm}`].filter(Boolean).join(' · ');
      return `${dimensions || 'continue'} mm`;
    }).join(' + '),
    structureVariantConfig: (() => {
      const config = manualGroups.find((entry) => entry.position === 'structure' && entry.sourceStructureKey === group.key);
      return config ? { ...config, layers: config.layers.map(referenceResolver.layer) } : undefined;
    })(),
    structureVariantConfigs: manualGroups.filter((entry) => entry.position === 'structure' && entry.sourceStructureKey === group.key).map((config) => ({ ...config, layers: config.layers.map(referenceResolver.layer) })),
  })), [categoryId, subcategoryId, resolvedGroups, manualGroups, referenceResolver]);

  const reusableGroups = useMemo(() => [
    ...deriveLayerGroups(resolvedComponents.filter((item) => item.categoryId === categoryId && matchesSubcategory(item)), lang),
    ...manualGroups.filter((group) => group.categoryId === categoryId).map((group) => ({ ...group, layers: group.layers.map(referenceResolver.layer) })),
  ], [categoryId, subcategoryId, resolvedComponents, lang, manualGroups, referenceResolver]);
  const upperGroups = useMemo(() => reusableGroups.filter((group) => group.position === 'above'), [reusableGroups]);
  const lowerGroups = useMemo(() => reusableGroups.filter((group) => group.position === 'below'), [reusableGroups]);
  const selectedStructureGroups = useMemo(() => categoryGroups.filter((group) => selectedStructures.has(group.key)), [categoryGroups, selectedStructures]);
  const chosenUpper = useMemo(() => [
    ...(selectedUpper.has('none-above') ? [{ id: 'none-above', name: 'Aucune couche au-dessus', layers: [] }] : []),
    ...upperGroups.filter((group) => selectedUpper.has(group.id)),
  ], [selectedUpper, upperGroups]);
  const chosenLower = useMemo(() => [
    ...(selectedLower.has('none-below') ? [{ id: 'none-below', name: 'Aucune couche au-dessous', layers: [] }] : []),
    ...lowerGroups.filter((group) => selectedLower.has(group.id)),
  ], [lowerGroups, selectedLower]);

  const candidates = useMemo(() => buildVariantCandidates({
    categoryId,
    structures: selectedStructureGroups,
    upperGroups: chosenUpper,
    lowerGroups: chosenLower,
    existingComponents: resolvedComponents,
  }), [categoryId, chosenLower, chosenUpper, resolvedComponents, selectedStructureGroups]);

  useEffect(() => {
    setCandidateSelection(new Set(candidates.filter((candidate) => !candidate.exists || candidate.updateRequired).map((candidate) => candidate.signature)));
    setUpdateConfirmationOpen(false);
  }, [candidates]);

  const resetSelections = (nextCategory) => {
    setCategoryId(nextCategory);
    setSubcategoryId(categories.find((category) => category.id === nextCategory)?.subcategories?.[0]?.id || '');
    setSelectedStructures(new Set());
    setSelectedUpper(new Set());
    setSelectedLower(new Set());
  };

  const selectSubcategory = (nextSubcategory) => {
    setSubcategoryId(nextSubcategory);
    setSelectedStructures(new Set());
    setSelectedUpper(new Set());
    setSelectedLower(new Set());
  };


  const createVariantsFromGroup = (group) => setEditor({
    ...JSON.parse(JSON.stringify(group)),
    id: manualId(),
    name: `${group.name} — variantes`,
    manual: true,
    sourceGroupId: group.id,
    sourceComponentIds: undefined,
    layers: group.layers.map((layer) => ({ ...layer, variants: [] })),
  });

  const editStructureVariants = (group) => setStructureEditor(group.structureVariantConfig || {
    id: manualId(),
    categoryId,
    position: 'structure',
    name: `Structure ${group.label}`,
    sourceStructureKey: group.sourceRootKey || group.key,
    targetCoreSignature: group.targetCoreSignature || layerGroupSignature(splitLayersAroundStructure(group.variants[0]).core),
    manual: true,
    includesIntegratedLayers: true,
    layers: splitLayersAroundStructure(group.variants[0]).core.map((layer) => ({ ...JSON.parse(JSON.stringify(layer)), variants: [] })),
  });

  const saveStructureVariants = async (config) => {
    const next = [...manualGroups.filter((group) => group.id !== config.id), config];
    setBusy(true);
    try {
      const result = await apiJson('/api/structures/layer-groups', { method: 'PUT', body: JSON.stringify({ groups: next }) });
      setManualGroups(result.groups || next);
      setStructureEditor(null);
      setMessage(`Variantes de « ${config.name} » enregistrées.`);
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveManualGroup = async (editedGroup) => {
    if (!editedGroup?.name.trim()) return setMessage('Donnez un nom au groupe de couches.');
    const normalized = {
      ...editedGroup,
      name: editedGroup.name.trim(),
      layers: editedGroup.layers.map((layer, order) => ({
        ...layer,
        order,
        productId: layer.productId || null,
        thickness_mm: layer.thickness_mm === '' || layer.thickness_mm === null || layer.thickness_mm === undefined ? null : Number(layer.thickness_mm),
        isSupportStructure: (layer.layerFunctionId || layerRole(layer)) === 'structure',
        layerFunctionId: layer.layerFunctionId || layerRole(layer),
        ecccId: layer.ecccId || null,
        ecccDescription: layer.ecccId ? (ecccData.find((entry) => entry.id === layer.ecccId)?.name || layer.ecccDescription || null) : null,
        insulationTypeId: (layer.layerFunctionId || layerRole(layer)) === 'insulation' ? (layer.insulationTypeId || null) : null,
        variants: (layer.variants || []).map((variant) => ({
          ...variant,
          productId: variant.productId || null,
          thickness_mm: variant.thickness_mm === '' || variant.thickness_mm === null || variant.thickness_mm === undefined ? null : Number(variant.thickness_mm),
          layerFunctionId: variant.layerFunctionId || null,
          ecccId: variant.ecccId || null,
          ecccDescription: variant.ecccId ? (ecccData.find((entry) => entry.id === variant.ecccId)?.name || variant.ecccDescription || null) : null,
          insulationTypeId: (variant.layerFunctionId || layer.layerFunctionId || layerRole(layer)) === 'insulation' ? (variant.insulationTypeId || null) : null,
        })),
      })),
    };
    const next = [...manualGroups.filter((group) => group.id !== normalized.id), normalized];
    setBusy(true);
    try {
      const result = await apiJson('/api/structures/layer-groups', { method: 'PUT', body: JSON.stringify({ groups: next }) });
      setManualGroups(result.groups || next);
      setEditor(null);
      setMessage(`Groupe « ${normalized.name} » enregistré et disponible pour toutes les structures de la catégorie.`);
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeManualGroup = async (id) => {
    const next = manualGroups.filter((group) => group.id !== id);
    setBusy(true);
    try {
      const result = await apiJson('/api/structures/layer-groups', { method: 'PUT', body: JSON.stringify({ groups: next }) });
      setManualGroups(result.groups || next);
      setSelectedUpper((current) => new Set([...current].filter((value) => value !== id)));
      setSelectedLower((current) => new Set([...current].filter((value) => value !== id)));
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const generate = async (confirmed = false) => {
    const chosen = candidates.filter((candidate) => candidateSelection.has(candidate.signature) && (!candidate.exists || candidate.updateRequired));
    if (!chosen.length) return;
    if (!confirmed && chosen.some((candidate) => candidate.updateRequired)) {
      setUpdateConfirmationOpen(true);
      return;
    }
    setUpdateConfirmationOpen(false);
    setBusy(true);
    setMessage('Calcul et génération en cours…');
    try {
      const calculated = chosen.map(({ component }) => applyCustomFireTimingToComponent(
        calculateComponentProperties(component, materials, products, kbobData, {
          categories: categoriesData.categories,
          componentServiceLifeYears: 60,
        }),
        materials,
        products,
      ));
      const result = await apiJson('/api/structures/generate', { method: 'POST', body: JSON.stringify({
        components: calculated,
        name: generationName || `${activeCategory?.label?.[lang] || categoryId} — ${new Date().toLocaleString('fr-CH')}`,
        parameters: {
          categoryId, subcategoryId,
          structures: selectedStructureGroups.map((group) => ({ key: group.key, layers: group.supportLayers, configuration: group.structureVariantConfig || null })),
          upperGroups: chosenUpper, lowerGroups: chosenLower,
        },
      }) });
      invalidateComponentsCache();
      onGenerated(result.created || [], result.updated || []);
      setMessage(`${result.created?.length || 0} composant(s) créé(s), ${result.updated?.length || 0} composant(s) mis à jour, ${result.skipped || 0} combinaison(s) inchangée(s). Version : ${result.versionFile || '—'}`);
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const catalog = [...materials, ...products].map((item) => {
    const name = item.translations?.[lang]?.name || item.translations?.fr?.name || item.workingtitle || item.id;
    return {
      ...item,
      id: String(item.id),
      name,
      insulationTypeId: inferInsulationTypeId({ materialcategoryId: item.materialcategoryId, translations: { fr: { name } } }),
    };
  });
  const newCount = candidates.filter((candidate) => !candidate.exists).length;
  const upperConfigurationCount = chosenUpper.reduce((total, group) => total + groupConfigurationCount(group), 0) || 1;
  const lowerConfigurationCount = chosenLower.reduce((total, group) => total + groupConfigurationCount(group), 0) || 1;
  const structureConfigurationCount = selectedStructureGroups.reduce((total, group) => total + expandStructureGroupVariants(group).length, 0);

  return <div className="db-generator">
    <nav className="db-structure-tabs" aria-label="Générateur et historique"><button type="button" className={!historyOpen ? 'active' : ''} onClick={() => setHistoryOpen(false)}>Nouvelle génération</button><button type="button" className={historyOpen ? 'active' : ''} onClick={() => setHistoryOpen(true)}>Historique des générations</button></nav>
    {historyOpen ? <GenerationHistoryPanel lang={lang} materials={materials} products={products} onUpdated={(updated) => { invalidateComponentsCache(); onGenerated([], updated); }} onDeleted={(ids) => { invalidateComponentsCache(); onGenerated([], [], ids); }} /> : <>
    <div className="db-generator-intro">
      <div><h3>Générateur de variantes</h3><p>Combinez des structures avec des groupes réutilisables. Une combinaison non cochée est simplement ignorée.</p></div>
      <label>Catégorie<select value={categoryId} onChange={(event) => resetSelections(event.target.value)}>{categories.filter((category) => availableCategoryIds.has(category.id)).map((category) => <option key={category.id} value={category.id}>{category.label?.[lang] || category.label?.fr || category.id}</option>)}</select></label>
      {subcategories.length ? <label>Sous-catégorie<select value={subcategoryId} onChange={(event) => selectSubcategory(event.target.value)}>{subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{getSubcategoryLabel(activeCategory, subcategory.id, lang)}</option>)}</select></label> : null}
    </div>

    <label className="db-generation-name">Nom de la génération (historique)<input value={generationName} onChange={(event) => setGenerationName(event.target.value)} placeholder="Ex. Façades bois — isolation 200 mm" /></label>

    <div className="db-generator-columns">
      <StructureColumn title="1. Structures porteuses" items={categoryGroups} selected={selectedStructures} onToggle={(id) => setToggle(setSelectedStructures, id)} onVariants={editStructureVariants} onRemove={removeManualGroup} catalog={catalog} lang={lang} />
      <GroupColumn title="2. Couches au-dessus" groups={upperGroups} selected={selectedUpper} onToggle={(id) => setToggle(setSelectedUpper, id)} onEdit={setEditor} onCreateVariants={createVariantsFromGroup} onRemove={removeManualGroup} />
      <GroupColumn title="3. Couches au-dessous" groups={lowerGroups} selected={selectedLower} onToggle={(id) => setToggle(setSelectedLower, id)} onEdit={setEditor} onCreateVariants={createVariantsFromGroup} onRemove={removeManualGroup} />
    </div>

    <button type="button" onClick={() => setEditor(newManualGroup(categoryId))}>+ Ajouter manuellement un groupe dessus/dessous</button>

    {structureEditor ? <StructureVariantEditor key={structureEditor.id} initialValue={structureEditor} catalog={catalog} lang={lang} busy={busy} onClose={() => setStructureEditor(null)} onSave={saveStructureVariants} /> : null}

    {editor ? <LayerGroupEditor key={editor.id} initialValue={editor} catalog={catalog} lang={lang} busy={busy} onClose={() => setEditor(null)} onSave={saveManualGroup} /> : null}

    <section className="db-generation-preview">
      <h3>Aperçu des combinaisons</h3>
      <div className="db-generation-stats"><span>{structureConfigurationCount} configurations de structure</span><span>× {upperConfigurationCount} configurations dessus</span><span>× {lowerConfigurationCount} configurations dessous</span><strong>= {candidates.length} combinaisons</strong><span>{candidates.length - newCount} existantes</span><strong>{newCount} nouvelles</strong></div>
      {candidates.length ? <div className="db-candidate-list">{candidates.map((candidate) => <label className={candidate.exists ? 'exists' : ''} key={candidate.signature}><input type="checkbox" disabled={candidate.exists && !candidate.updateRequired} checked={candidateSelection.has(candidate.signature) && (!candidate.exists || candidate.updateRequired)} onChange={() => setToggle(setCandidateSelection, candidate.signature)} /><span><strong>{labelOf(candidate.component, lang)}</strong><small>{candidate.updateRequired ? 'Existe déjà — rôle ou eCCC à mettre à jour' : candidate.exists ? 'Existe déjà — aucune modification' : 'Nouveau composant'}</small></span></label>)}</div> : <p>Sélectionnez au moins une structure. Sans groupe sélectionné, la structure seule est proposée.</p>}
      {updateConfirmationOpen ? <div className="db-generation-warning" role="alert">
        <strong>Attention : des composants existants vont être modifiés.</strong>
        <p>La composition ne sera pas recréée. Seuls le rôle et/ou l’eCCC des couches ci-dessous seront remplacés :</p>
        <ul>{candidates.filter((candidate) => candidateSelection.has(candidate.signature) && candidate.updateRequired).flatMap((candidate) => candidate.metadataUpdates.flatMap((update) => update.changes.map((change) => <li key={`${candidate.signature}-${update.component.id}-${change.layerIndex}`}><strong>{update.component.serialNo || update.component.id}</strong> — couche {change.layerIndex + 1} « {change.layerName} » : rôle {ROLE_LABELS[change.fromRole] || change.fromRole} → {ROLE_LABELS[change.toRole] || change.toRole}, eCCC {change.fromEcccId || 'non attribué'} → {change.toEcccId || 'non attribué'}</li>)))}</ul>
        <div className="db-title-actions"><button type="button" onClick={() => setUpdateConfirmationOpen(false)}>Annuler</button><button className="db-primary" type="button" onClick={() => generate(true)}>Confirmer les modifications et générer</button></div>
      </div> : null}
      <button className="db-primary" type="button" disabled={busy || !candidateSelection.size} onClick={() => generate(false)}>Générer / mettre à jour {candidateSelection.size} composant(s)</button>
    </section>
    {message ? <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p> : null}
    </>}
  </div>;
}


function StructureColumn({ title, items, selected, onToggle, onVariants, onRemove, catalog, lang }) {
  const layerLabel = (layer) => {
    const material = catalog.find((entry) => String(entry.id) === String(layer.productId || layer.materialId));
    return `${material?.name || layer.productName || layer.productId || 'Liaison'} · ${layer.thickness_mm ?? '—'} mm${layer.structure === 'in-lying' ? ' · intégré' : ''}`;
  };
  return <section className="db-generator-column"><h4>{title}</h4><div>{items.map((item) => <div className="db-group-choice" key={item.key}>
    <label><input type="checkbox" checked={selected.has(item.key)} onChange={() => onToggle(item.key)} /><span><strong>{item.label}</strong><small>{item.variants.length} composant(s) · {expandStructureGroupVariants(item).length} configuration(s)</small></span></label>
    <span><button type="button" onClick={() => onVariants(item)}>{item.structureVariantConfig ? 'Modifier variantes' : '+ Variantes'}</button>{item.structureVariantConfig ? <button type="button" title="Supprimer les variantes" onClick={() => onRemove(item.structureVariantConfig.id)}>×</button> : null}</span>
    <details className="db-structure-core-variants"><summary>Variantes de structure et couches intégrées</summary>{expandStructureGroupVariants({ ...item, structureVariantConfig: null, structureVariantConfigs: null }).map((variant, index) => {
      const layers = splitLayersAroundStructure(variant.variants[0]).core;
      const signature = layerGroupSignature(layers);
      return <div key={variant.key}><strong>Variante de structure {index + 1}</strong><ul>{layers.map((layer, i) => <li key={i}>{layerLabel(layer)}</li>)}</ul><button type="button" onClick={() => onVariants({ ...variant, sourceRootKey: item.key, targetCoreSignature: signature, structureVariantConfig: item.structureVariantConfigs?.find((config) => config.targetCoreSignature === signature) })}>Modifier la variante de structure {index + 1}</button></div>;
    })}</details>
  </div>)}</div></section>;
}

function GroupColumn({ title, groups, selected, onToggle, onEdit, onCreateVariants, onRemove }) {
  const noneId = title.includes('dessus') ? 'none-above' : 'none-below';
  return <section className="db-generator-column"><h4>{title}</h4><div><div className="db-group-choice"><label><input type="checkbox" checked={selected.has(noneId)} onChange={() => onToggle(noneId)} /><span><strong>Aucune couche</strong><small>Variante sans groupe de ce côté</small></span></label></div>{groups.map((group) => <div className="db-group-choice" key={group.id}><label><input type="checkbox" checked={selected.has(group.id)} onChange={() => onToggle(group.id)} /><span><strong>{group.name}</strong><small>{group.layers.length} couche(s) · {groupConfigurationCount(group)} configuration(s) · {group.manual ? 'manuel' : `${group.sourceComponentIds?.length || 0} composant(s)`}</small></span></label><span>{group.manual ? <><button type="button" onClick={() => onEdit(group)}>Modifier</button><button type="button" onClick={() => onRemove(group.id)}>×</button></> : <button type="button" onClick={() => onCreateVariants(group)}>+ Variantes</button>}</span></div>)}</div></section>;
}
