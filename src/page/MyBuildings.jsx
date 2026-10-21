import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import Building from './Building';
import { readBuildingDraft, writeBuildingDraft } from '../utils/buildingGroupSelections';
import './MyBuildings.css';

function MyBuildings() {
  const { lang, setLang } = useContext(LangContext);
  const { request, user } = useAuth();
  const projectSessionKey = `autospec-building-draft:${user?.id}`;
  const [buildings, setBuildings] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftState, setDraftState] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const draftStateRef = useRef({});

  const openBuilding = useCallback((building) => {
    setActiveId(building?.id || '');
    setDraftName(building?.name || '');
    const nextState = building?.state || {};
    draftStateRef.current = nextState;
    setDraftState(nextState);
    setDirty(false);
    setMessage('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    request('/api/buildings')
      .then((payload) => {
        if (cancelled) return;
        const items = payload.buildings || [];
        setBuildings(items);
        const draft = readBuildingDraft(projectSessionKey);
        const restored = items.find((item) => item.id === draft?.id);
        if (restored) {
          openBuilding({ ...restored, name: draft.name, state: draft.state });
          setDirty(Boolean(draft.dirty));
        } else if (items.length) openBuilding(items[0]);
      })
      .catch((error) => { if (!cancelled) setMessage(error.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [openBuilding, request, projectSessionKey]);

  useEffect(() => {
    if (activeId && !loading) writeBuildingDraft(projectSessionKey, { id: activeId, name: draftName, state: draftState, dirty });
  }, [activeId, draftName, draftState, dirty, loading, projectSessionKey]);

  const create = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload = await request('/api/buildings', {
        method: 'POST',
        body: JSON.stringify({ name: `Bâtiment ${buildings.length + 1}`, state: {} }),
      });
      setBuildings((current) => [payload.building, ...current]);
      openBuilding(payload.building);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!activeId) return;
    setSaving(true);
    setMessage('');
    try {
      const payload = await request(`/api/buildings/${activeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: draftName, state: draftState }),
      });
      setBuildings((current) => current.map((building) => building.id === activeId ? payload.building : building));
      setDraftName(payload.building.name);
      setDirty(false);
      setMessage('Bâtiment enregistré.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!activeId || !window.confirm(`Supprimer « ${draftName} » ?`)) return;
    setSaving(true);
    setMessage('');
    try {
      await request(`/api/buildings/${activeId}`, { method: 'DELETE' });
      const remaining = buildings.filter((building) => building.id !== activeId);
      setBuildings(remaining);
      openBuilding(remaining[0] || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const selectBuilding = (building) => {
    if (building.id === activeId) return;
    if (dirty && !window.confirm('Abandonner les modifications non enregistrées ?')) return;
    openBuilding(building);
  };

  const updateProjectState = useCallback((state) => {
    if (JSON.stringify(draftStateRef.current) === JSON.stringify(state)) return;
    draftStateRef.current = state;
    setDraftState(state);
    setDirty(true);
  }, []);

  const toolbar = activeId ? (
    <div className="my-buildings-toolbar">
      <label>
        <span>Nom du bâtiment</span>
        <input value={draftName} onChange={(event) => { setDraftName(event.target.value); setDirty(true); }} />
      </label>
      <button type="button" className="my-buildings-save" disabled={saving || !dirty || !draftName.trim()} onClick={save}>
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      <button type="button" className="my-buildings-delete" disabled={saving} onClick={remove}>Supprimer</button>
      {message ? <span className={message === 'Bâtiment enregistré.' ? 'success' : 'error'}>{message}</span> : null}
    </div>
  ) : null;

  return (
    <>
      <Header lang={lang} setLang={setLang} />
      <main className="my-buildings-page">
        <aside className="my-buildings-sidebar">
          <div className="my-buildings-sidebar-title">
            <div><small>Projets</small><h1>My Buildings</h1></div>
            <button type="button" onClick={create} disabled={saving}>+ Nouveau</button>
          </div>
          {loading ? <p>Chargement…</p> : null}
          {!loading && !buildings.length ? <p className="building-muted">Aucun bâtiment enregistré.</p> : null}
          <div className="my-buildings-list">
            {buildings.map((building) => (
              <button type="button" className={building.id === activeId ? 'active' : ''} key={building.id} onClick={() => selectBuilding(building)}>
                <strong>{building.name}</strong>
                <small>Modifié le {new Date(building.updatedAt).toLocaleDateString('fr-CH')}</small>
              </button>
            ))}
          </div>
          {!activeId && message ? <p className="my-buildings-error">{message}</p> : null}
        </aside>

        <section className="my-buildings-editor">
          {activeId ? (
            <Building
              key={activeId}
              showHeader={false}
              initialProjectState={draftState}
              onProjectStateChange={updateProjectState}
              projectToolbar={toolbar}
              projectSessionKey={projectSessionKey}
              projectId={activeId}
            />
          ) : (
            <div className="my-buildings-empty">
              <h2>Créez votre premier bâtiment</h2>
              <p>Les composants, surfaces, filtres et résultats carbone seront enregistrés dans votre compte.</p>
              <button type="button" onClick={create} disabled={saving}>Créer un bâtiment</button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default MyBuildings;
