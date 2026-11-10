import { describe, expect, it } from 'vitest';
import { addSurfaceRow, assignSurfaceRow, reconcileSurfaceRows, removeSurfaceRow, surfaceRows, targetSurfaceRow } from './buildingSurfaceRows';

const defaults = { floors: 100, roof: 80 };
const selections = (...ids) => ({ floors: ids.map((id) => ({ id })), roof: [] });
const reconcile = (state, ...ids) => reconcileSurfaceRows(state, selections(...ids), defaults);

describe('surfaces indépendantes des sélections', () => {
  it('migre les anciennes surfaces et conserve leurs valeurs après désélection et rechargement', () => {
    const old = { 'component:a': { value: 42, auto: false, partId: 'floors' }, 'component:b': { value: 7, auto: false, partId: 'floors' } };
    const migrated = reconcile(old, 'a', 'b').surfaces;
    const detached = reconcile(migrated).surfaces;
    expect(surfaceRows(detached, 'floors').map((row) => row.value)).toEqual([42, 7]);
    expect(surfaceRows(detached, 'floors').every((row) => row.assignedItemId === null)).toBe(true);
    expect(reconcile(JSON.parse(JSON.stringify(detached))).surfaces).toEqual(detached);
    expect(old['component:a'].value).toBe(42);
  });

  it('réutilise une ligne vide et initialise seulement les lignes supplémentaires à zéro', () => {
    const empty = reconcile({ 'range:floors': { value: 42, auto: false } }).surfaces;
    const assigned = reconcile(empty, 'a', 'b').surfaces;
    expect(surfaceRows(assigned, 'floors').map((row) => [row.value, row.assignedItemId])).toEqual([[42, 'a'], [0, 'b']]);
    const changed = reconcile(assigned, 'b', 'c').surfaces;
    expect(surfaceRows(changed, 'floors').map((row) => [row.value, row.assignedItemId])).toEqual([[42, 'c'], [0, 'b']]);
  });

  it('affecte la nouvelle sélection à la cible choisie et retire l’ancienne affectation', () => {
    const original = reconcile({ 'component:a': { value: 42, auto: false } }, 'a').surfaces;
    const key = surfaceRows(original, 'floors')[0].key;
    const result = reconcile(targetSurfaceRow(original, key), 'a', 'b');
    expect(result.unselectedIds).toEqual(['a']);
    expect(surfaceRows(result.surfaces, 'floors')).toMatchObject([{ value: 42, assignedItemId: 'b', target: false }]);
    expect(reconcile(result.surfaces, 'b').surfaces[key].value).toBe(42);
  });

  it('supprime uniquement sur demande explicite et ne recrée pas les lignes supprimées', () => {
    const original = reconcile({}, 'a').surfaces;
    const key = surfaceRows(original, 'floors')[0].key;
    const removed = removeSurfaceRow(original, key);
    expect(removed.unselectedIds).toEqual(['a']);
    expect(surfaceRows(reconcile(removed.surfaces).surfaces, 'floors')).toHaveLength(0);
    const added = addSurfaceRow(removed.surfaces, 'floors');
    expect(surfaceRows(added, 'floors')).toMatchObject([{ value: 0, target: true, assignedItemId: null }]);
  });

  it('ne cible pas une autre catégorie et conserve les surfaces manuelles si la géométrie change', () => {
    const state = addSurfaceRow(reconcile({ 'range:floors': { value: 42, auto: false } }).surfaces, 'roof');
    const result = reconcile(state, 'a').surfaces;
    expect(surfaceRows(result, 'roof').find((row) => row.target).assignedItemId).toBeNull();
    expect(reconcileSurfaceRows(result, selections('a'), { floors: 250, roof: 160 }).surfaces['range:floors'].value).toBe(42);
  });

  it('permet d’affecter le même groupe à plusieurs surfaces sans perdre les autres affectations', () => {
    const initial = reconcile({}, 'a').surfaces;
    const added = addSurfaceRow(initial, 'floors');
    const empty = surfaceRows(added, 'floors').find((row) => row.target);
    const assigned = assignSurfaceRow(added, empty.key, 'a');
    expect(surfaceRows(assigned.surfaces, 'floors').filter((row) => row.assignedItemId === 'a')).toHaveLength(2);
    expect(removeSurfaceRow(assigned.surfaces, empty.key).unselectedIds).toEqual([]);
    expect(assignSurfaceRow(assigned.surfaces, empty.key, null).unselectedIds).toEqual([]);
  });

  it('ajoute les nouvelles catégories aux bâtiments existants mais ne recrée pas une surface supprimée', () => {
    const old = reconcile({ 'component:a': { value: 42, auto: false } }, 'a').surfaces;
    const parts = { ...selections('a'), floor_screed: [], floor_covering: [] };
    const areas = { ...defaults, floor_screed: 200, floor_covering: 200 };
    const additional = ['floor_screed', 'floor_covering'];
    const added = reconcileSurfaceRows(old, parts, areas, additional).surfaces;
    expect(added['component:a'].value).toBe(42);
    expect(surfaceRows(added, 'floor_screed')).toMatchObject([{ value: 200 }]);
    const removed = removeSurfaceRow(added, 'range:floor_screed').surfaces;
    expect(surfaceRows(reconcileSurfaceRows(removed, parts, areas, additional).surfaces, 'floor_screed')).toHaveLength(0);
  });
});
