import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import categoriesData from '../data/categories.json';
import kbobData from '../data/KBOB_mat_db.json';
import loadMaterials from '../utils/loadMaterials';
import loadProducts from '../utils/loadProducts';
import { fetchDbSources, invalidateComponentsCache } from '../utils/loadComponents';
import { calculateComponentProperties } from '../utils/componentPropriety';
import { applyCustomFireTimingToComponent } from '../utils/customFireTiming';
import {
  deleteFileCustomComponent,
  deleteLocalCustomComponent,
  mergeById,
  withCustomSource,
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
  const res = await fetch(path);
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
  const { lang, setLang } = useContext(LangContext);
  const [sources, setSources] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedRecalc, setSelectedRecalc] = useState(
    RECALC_OPTIONS.reduce((acc, option) => ({ ...acc, [option.key]: true }), {}),
  );
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedCount = selectedFiles.length;
  const selectedRecalcCount = Object.values(selectedRecalc).filter(Boolean).length;

  useEffect(() => {
    const load = async () => {
      const [dbSources, materialsJson, productsJson] = await Promise.all([
        fetchDbSources(process.env.PUBLIC_URL || ''),
        loadMaterials(),
        loadProducts(),
      ]);
      setSources(dbSources);
      setSelectedFiles(dbSources.map((source) => source.file));
      setMaterials(materialsJson);
      setProducts(productsJson);
      const fileCustomItems = await fetchJsonArray('/db/components_custom.json');
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

  const filteredCustomItems = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    if (!query) return customItems;
    return customItems.filter((item) => {
      const title = normalizeSearch(getComponentTitle(item));
      const id = normalizeSearch(item?.id);
      return title.includes(query) || id.includes(query);
    });
  }, [customItems, searchTerm]);

  const toggleFile = (file) => {
    setSelectedFiles((prev) =>
      prev.includes(file) ? prev.filter((item) => item !== file) : [...prev, file],
    );
  };

  const toggleRecalc = (key) => {
    setSelectedRecalc((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const refreshCustomItems = async () => {
    const items = await fetchJsonArray('/db/components_custom.json');
    writeLocalCustomComponents(items);
    invalidateComponentsCache();
    setCustomItems(items);
    return items;
  };

  const handleRecalculateToCustom = async () => {
    if (!selectedFiles.length || !selectedRecalcCount) return;
    setBusy(true);
    setStatus('Recalcul en cours...');
    try {
      const dbPayloads = await Promise.all(
        selectedFiles.map((file) =>
          fetchJsonArray(`/db/${file}`).then((items) => ({ file, items })),
        ),
      );

      const recalculated = dbPayloads.flatMap(({ file, items }) =>
        items.map((item) => {
          const sourcePreserved = {
            ...item,
            __sourceFile: 'components_custom.json',
            source: item.source ?? {
              databaseId: file.replace('.json', ''),
              name: file.replace('.json', '').replace(/_/g, ' '),
            },
          };
          const calculated = calculateComponentProperties(sourcePreserved, materials, products, kbobData, {
            categories: categoriesData?.categories ?? [],
            componentServiceLifeYears: 60,
          });
          const timed = applyCustomFireTimingToComponent(calculated, materials, products);
          return withCustomSource(pickSelectedValues(sourcePreserved, calculated, timed, selectedRecalc));
        }),
      );

      const existingFileCustom = await fetchJsonArray('/db/components_custom.json');
      const merged = mergeById([...existingFileCustom, ...recalculated]);
      writeLocalCustomComponents(merged);
      await writeDbComponentsFile('components_custom.json', merged);
      invalidateComponentsCache();
      setCustomItems(merged);
      setStatus(`${recalculated.length} elements recalcules et enregistres dans custom (${selectedSourceLabels}).`);
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

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <h2>Dashboard bases de donnees</h2>

        <section style={cardStyle}>
          <h3>Recalculer vers Custom</h3>
          <p>
            Les elements recalcules sont ajoutes ou mis a jour dans <strong>components_custom.json</strong>.
            La source d'origine est conservee.
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
            onClick={handleRecalculateToCustom}
            disabled={busy || !selectedCount || !selectedRecalcCount}
            style={{ ...buttonStyle, marginTop: '12px' }}
          >
            Recalculer les elements selectionnes vers custom
          </button>
        </section>

        <section style={cardStyle}>
          <h3>Elements Custom ({filteredCustomItems.length}/{customItems.length})</h3>
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
                {filteredCustomItems.map((item) => (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{getComponentTitle(item)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      <Link to={`/element/${item.id}`}>{item.id}</Link>
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {item.source?.databaseId || item.source?.name || 'N/A'}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustom(item.id)}
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
      </main>
    </>
  );
}
