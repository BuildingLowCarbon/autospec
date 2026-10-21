import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationHistoryPanel from './GenerationHistoryPanel';
import { apiJson } from './dashboardApi';

vi.mock('./dashboardApi', async (importOriginal) => ({ ...await importOriginal(), apiJson: vi.fn() }));
const component = { id: 'existing', translations: { fr: { name: 'Composant existant' } }, metadata: { updated_at: 'old-version' }, structure: { layers: [{ productId: 'wood', thickness_mm: 200, layerFunctionId: 'structure', isSupportStructure: true, structure: 'on-lying' }] } };
const run = { id: 'run-1', name: 'Lot initial', revision: 1, componentIds: [component.id], events: [] };

beforeEach(() => { apiJson.mockReset(); });

describe('historique des générations', () => {
  it('modifie une structure dans les mêmes trois colonnes que la nouvelle génération', async () => {
    apiJson.mockResolvedValueOnce({ history: [run], components: [component] });
    const updated = { ...component, structure: { layers: [{ ...component.structure.layers[0], thickness_mm: 240 }] } };
    apiJson.mockResolvedValueOnce({ updated: [updated], history: [{ ...run, revision: 2 }], versionFile: 'version.json' });
    const onUpdated = vi.fn();
    render(<MemoryRouter><GenerationHistoryPanel lang="fr" materials={[{ id: 'wood', workingtitle: 'Bois', density_kg_m3: 450, kbobId: '07.001' }]} products={[]} onUpdated={onUpdated} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier la structure 1' }));
    expect(screen.getByText('2. Couches au-dessus')).toBeInTheDocument();
    expect(screen.getByText('3. Couches au-dessous')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Épaisseur (mm)'), { target: { value: '240' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le groupe' }));
    fireEvent.click(screen.getByRole('button', { name: /Prévisualiser/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer aux composants existants' }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith([updated]));
    const [url, options] = apiJson.mock.calls[1];
    expect(url).toBe('/api/structures/history/run-1');
    expect(JSON.parse(options.body)).toMatchObject({ expectedRevision: 1, componentIds: ['existing'], replacements: [{ id: 'existing', layers: [{ productId: 'wood', thickness_mm: 240 }] }], expectedVersions: { existing: 'old-version' } });
  });

  it('supprime le lot après confirmation et transmet les identifiants retirés', async () => {
    apiJson.mockResolvedValueOnce({ history: [run], components: [component] });
    apiJson.mockResolvedValueOnce({ deletedIds: ['existing'], retainedIds: [], history: [], versionFile: 'backup.json' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleted = vi.fn();
    render(<MemoryRouter><GenerationHistoryPanel lang="fr" materials={[]} products={[]} onUpdated={vi.fn()} onDeleted={onDeleted} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer cette génération' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(['existing']));
    expect(confirm).toHaveBeenCalled();
    expect(apiJson.mock.calls[1][1].method).toBe('DELETE');
    confirm.mockRestore();
  });
});
