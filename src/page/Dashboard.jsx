import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import categoriesData from '../data/categories.json';
import kbobData from '../data/KBOB_mat_db.json';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import { fetchDbSources, invalidateComponentsCache } from '../utils/loadComponents';
import { calculateComponentProperties } from '../utils/componentPropriety';
import { applyCustomFireTimingToComponent } from '../utils/customFireTiming';
import publicBase from '../utils/publicBase';
import {
  deleteFileCustomComponent,
  deleteFileSourceComponent,
  deleteLocalCustomComponent,
  writeDbComponentsFile,
  writeLocalCustomComponents,
} from '../utils/customComponentsStore';

const RECALC_OPTIONS = [
  { key: 'span', label: 'Portees' },
  { key: 'gwp', label: 'GWP' },
  { key: 'thickness', label: 'Epaisseur' },
  { key: 'uValue', label: 'Valeur U' },
  { key: 'weight', label: 'Masse surfacique' },
];

const buttonStyle = {
  border: '1px solid #777',
  background: '#f7f7f7',
  borderRadius: '4px',
  padding: '7px 12px',
  color: '#222',
  cursor: 'pointer',
};

const cardStyle = {
  border: '1px solid #ccc',
  borderRadius: '8px',
  background: '#fff',
  padding: '14px',
  marginBottom: '16px',
};

const fetchJsonArray = async (path) => {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Chargement impossible: ${path} (${res.status})`);
  const payload = await res.json();
  return Array.isArray(payload) ? payload : [];
};

const getComponentTitle = (component) =>
  component?.translations?.fr?.name || component?.serialNo || component?.id || 'Sans nom';

const normalizeSearch = (value) => String(value ?? '').trim().toLowerCase();

const pickSelectedValues = (base, calculated, timed, selectedRecalc) => {
  const next = { ...base };
  const shouldUpdateLayers =
    selectedRecalc.thickness ||
    selectedRecalc.weight ||
    selectedRecalc.gwp ||
    selectedRecalc.uValue ||
    selectedRecalc.span;

  if (selectedRecalc.thickness) next.thickness_mm = calculated.thickness_mm;
  if (selectedRecalc.weight) next.weight_kg_m2 = calculated.weight_kg_m2;
  if (selectedRecalc.gwp) next.gwp_kgco2e_m2 = calculated.gwp_kgco2e_m2;
  if (selectedRecalc.uValue) next.uValue_W_m2K = calculated.uValue_W_m2K;
  if (shouldUpdateLayers) next.structure = calculated.structure;

  if (selectedRecalc.span) {
    next.structure = timed.structure;
    next.fire_resistance = {
      ...(next.fire_resistance ?? {}),
      ...(timed.fire_resistance ?? {}),
    };
    next.spanMax_m =
      timed.fire_resistance?.wood_beam_span?.ambient?.L_ambient_governing_m ??
      timed.fire_resistance?.wood_beam_span?.fire?.find((item) => item?.fireMinutes === 30)?.Max_span ??
      next.spanMax_m ??
      null;
  }

  return next;
};

export default function Dashboard() {
  const [sources, setSources] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [listedFiles, setListedFiles] = useState([]);
  const [selectedRecalc, setSelectedRecalc] = useState(
    RECALC_OPTIONS.reduce((acc, option) => ({ ...acc, [option.key]: true }), {}),
  );
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [databaseItems, setDatabaseItems] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedCount = selectedFiles.length;
  const selectedRecalcCount = Object.values(selectedRecalc).filter(Boolean).length;

  useEffect(() => {
    const load = async () => {
      const [dbSources, materialsJson, productsJson] = await Promise.all([
        fetchDbSources(publicBase),
        loadMaterials(),
        loadProducts(),
      ]);
      const systemSources = dbSources.filter((source) => source.file?.endsWith('.json') && !source.file.includes(':'));
      setSources(systemSources);
      setSelectedFiles(systemSources.map((source) => source.file));
      setListedFiles(systemSources.map((source) => source.file));
      setMaterials(materialsJson);
      setProducts(productsJson);
      const loadedDatabases = await Promise.all(systemSources.map(async (source) => [source.file, await fetchJsonArray(`/db/${source.file}`)]));
      const itemsByFile = Object.fromEntries(loadedDatabases);
      setDatabaseItems(itemsByFile);
      const fileCustomItems = itemsByFile['components_custom.json'] || [];
      writeLocalCustomComponents(fileCustomItems);
      invalidateComponentsCache();
      setCustomItems(fileCustomItems);
    };
    load().catch((error) => setStatus(error.message));
  }, []);

  const selectedSourceLabels = useMemo(
    () => sources.filter((source) => selectedFiles.includes(source.file)).map((source) => source.label).join(', '),
    [sources, selectedFiles],
  );

  const selectedComponents = useMemo(() => listedFiles.flatMap((file) => {
    const items = file === 'components_custom.json' ? customItems : (databaseItems[file] || []);
    return items.map((item) => ({ ...item, __dashboardSourceFile: file }));
  }), [customItems, databaseItems, listedFiles]);

  const filteredComponents = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    if (!query) return selectedComponents;
    return selectedComponents.filter((item) => {
      const title = normalizeSearch(getComponentTitle(item));
      const id = normalizeSearch(item?.id);
      const source = normalizeSearch(item.__dashboardSourceFile);
      return title.includes(query) || id.includes(query) || source.includes(query);
    });
  }, [searchTerm, selectedComponents]);

  const toggleFile = (file) => {
    setSelectedFiles((prev) =>
      prev.includes(file) ? prev.filter((item) => item !== file) : [...prev, file],
    );
  };

  const toggleListedFile = (file) => {
    setListedFiles((current) => current.includes(file) ? current.filter((item) => item !== file) : [...current, file]);
  };

  const toggleRecalc = (key) => {
    setSelectedRecalc((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const refreshCustomItems = async () => {
    const items = await fetchJsonArray('/db/components_custom.json');
    writeLocalCustomComponents(items);
    invalidateComponentsCache();
    setCustomItems(items);
    setDatabaseItems((current) => ({ ...current, 'components_custom.json': items }));
    return items;
  };

  const handleRecalculateSources = async () => {
    if (!selectedFiles.length || !selectedRecalcCount) return;
    setBusy(true);
    setStatus('Recalcul en cours...');
    try {
      const dbPayloads = await Promise.all(
        selectedFiles.map((file) =>
          fetchJsonArray(`/db/${file}`).then((items) => ({ file, items })),
        ),
      );

      const recalculatedDatabases = dbPayloads.map(({ file, items }) => ({
        file,
        items: items.map((item) => {
          const sourcePreserved = { ...item };
          const calculated = calculateComponentProperties(sourcePreserved, materials, products, kbobData, {
            categories: categoriesData?.categories ?? [],
            componentServiceLifeYears: 60,
          });
          const timed = applyCustomFireTimingToComponent(calculated, materials, products);
          return pickSelectedValues(sourcePreserved, calculated, timed, selectedRecalc);
        }),
      }));

      await Promise.all(recalculatedDatabases.map(({ file, items }) => writeDbComponentsFile(file, items)));
      setDatabaseItems((current) => ({ ...current, ...Object.fromEntries(recalculatedDatabases.map(({ file, items }) => [file, items])) }));
      invalidateComponentsCache();
      if (selectedFiles.includes('components_custom.json')) await refreshCustomItems();
      const recalculatedCount = recalculatedDatabases.reduce((count, database) => count + database.items.length, 0);
      setStatus(`${recalculatedCount} elements recalcules dans leur base d'origine (${selectedSourceLabels}).`);
    } catch (error) {
      setStatus(`Erreur: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCustom = async (componentId) => {
    if (!componentId) return;
    setBusy(true);
    setStatus('Suppression en cours...');
    try {
      deleteLocalCustomComponent(componentId);
      await deleteFileCustomComponent(componentId);
      invalidateComponentsCache();
      await refreshCustomItems();
      setStatus('Element custom supprime.');
    } catch (error) {
      setStatus(`Erreur suppression: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteComponent = async (sourceFile, componentId) => {
    if (!sourceFile || !componentId) return;
    const component = (sourceFile === 'components_custom.json' ? customItems : databaseItems[sourceFile] || [])
      .find((item) => String(item.id) === String(componentId));
    const title = getComponentTitle(component);
    if (typeof window !== 'undefined' && !window.confirm(`Supprimer définitivement « ${title} » de ${sourceFile} ? Une sauvegarde de la base sera créée.`)) return;
    if (sourceFile === 'components_custom.json') return handleDeleteCustom(componentId);
    setBusy(true);
    setStatus('Suppression en cours...');
    try {
      const result = await deleteFileSourceComponent(sourceFile, componentId);
      setDatabaseItems((current) => ({
        ...current,
        [sourceFile]: (current[sourceFile] || []).filter((item) => String(item.id) !== String(componentId)),
      }));
      invalidateComponentsCache();
      setStatus(`Composant supprimé de ${sourceFile}. Sauvegarde : ${result.backupDirectory}`);
    } catch (error) {
      setStatus(`Erreur suppression: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
      <div className="db-components-page">
        <h2>Composants</h2>

        <section style={cardStyle}>
          <h3>Recalculer les proprietes</h3>
          <p>
            Les valeurs selectionnees sont recalculees directement dans chaque base d'origine.
            La composition et les identifiants des composants restent inchanges.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <h4>Bases selectionnees ({selectedCount})</h4>
              {sources.map((source) => (
                <label key={source.file} style={{ display: 'block', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(source.file)}
                    onChange={() => toggleFile(source.file)}
                  />{' '}
                  {source.label} <span style={{ color: '#666' }}>({source.file})</span>
                </label>
              ))}
            </div>

            <div>
              <h4>Valeurs a recalculer ({selectedRecalcCount})</h4>
              {RECALC_OPTIONS.map((option) => (
                <label key={option.key} style={{ display: 'block', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedRecalc[option.key])}
                    onChange={() => toggleRecalc(option.key)}
                  />{' '}
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRecalculateSources}
            disabled={busy || !selectedCount || !selectedRecalcCount}
            style={{ ...buttonStyle, marginTop: '12px' }}
          >
            Recalculer dans les bases d'origine
          </button>
        </section>

        <section style={cardStyle}>
          <h3>Composants des bases sélectionnées ({filteredComponents.length}/{selectedComponents.length})</h3>
          <p>Les composants sont supprimés de leur base d’origine. Une sauvegarde est créée avant chaque suppression d’une base système.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginBottom: '12px' }}>
            {sources.map((source) => <label key={source.file}><input type="checkbox" checked={listedFiles.includes(source.file)} onChange={() => toggleListedFile(source.file)} /> {source.label}</label>)}
          </div>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Rechercher par nom ou ID"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '8px',
              marginBottom: '12px',
              border: '1px solid #bbb',
              borderRadius: '4px',
            }}
          />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#eee' }}>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Nom</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>ID</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'left' }}>Source</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredComponents.map((item) => (
                  <tr key={`${item.__dashboardSourceFile}:${item.id}`}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{getComponentTitle(item)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <Link to={`/element/${item.id}`}>{item.id}</Link>
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {sources.find((source) => source.file === item.__dashboardSourceFile)?.label || item.__dashboardSourceFile}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteComponent(item.__dashboardSourceFile, item.id)}
                        disabled={busy}
                        style={buttonStyle}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {status ? (
          <div style={{ ...cardStyle, background: status.startsWith('Erreur') ? '#ffecec' : '#f7f7f7' }}>
            {status}
          </div>
        ) : null}
      </div>
  );
}
