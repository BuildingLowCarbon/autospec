import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Custom from './Custom';

const mocks = vi.hoisted(() => ({ request: vi.fn(), navigate: vi.fn(), role: 'admin' }));
vi.mock('react-router-dom', async (original) => ({ ...(await original()), useNavigate: () => mocks.navigate }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'user', role: mocks.role }, can: () => mocks.role === 'admin', request: mocks.request,
}) }));
vi.mock('../components/Header', () => ({ default: () => null }));
vi.mock('../components/Graphic', () => ({ ViewSVG: () => null, DEFAULT_PX_PER_MM_X: 1 }));
vi.mock('../utils/loadMaterials', () => ({ default: async () => [] }));
vi.mock('../utils/loadProducts', () => ({ default: async () => [] }));
vi.mock('../utils/loadComponents', () => ({
  default: async () => [{ id: 'original', categoryId: 'floor_assembly', __sourceFile: 'components_lignum_selected.json', structure: { layers: [] } }],
  invalidateComponentsCache: vi.fn(),
  fetchDbSources: async () => [{ file: 'components_custom.json', label: 'Custom' }, { file: 'components_minergie_enriched.json', label: 'Minergie' }],
}));

beforeEach(() => {
  mocks.role = 'admin';
  mocks.navigate.mockClear();
  mocks.request.mockReset().mockImplementation(async (url, options) => {
    if (url === '/api/organizations') return { organizations: [] };
    const { item, component } = JSON.parse(options.body);
    const clean = Object.fromEntries(Object.entries(item || component).filter(([key]) => !key.startsWith('__')));
    return component ? { component: { ...clean, __sourceFile: decodeURIComponent(url.split('/').pop()) } }
      : { item: { ...clean, __contentId: 'mongo' } };
  });
});
afterEach(cleanup);

const open = (id = 'new') => render(<MemoryRouter initialEntries={[`/custom/${id}`]}><Routes><Route path="/custom/:id" element={<Custom />} /></Routes></MemoryRouter>);

describe('destination des nouveaux composants', () => {
  it('permet à l’administrateur de créer une toiture souterraine dans la base choisie', async () => {
    open();
    const destination = await screen.findByRole('combobox', { name: /Base de destination/ });
    fireEvent.change(destination, { target: { value: 'components_minergie_enriched.json' } });
    const category = screen.getByRole('option', { name: 'Toiture souterraine' }).closest('select');
    fireEvent.change(category, { target: { value: 'underground_roof' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le composant' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/api/components-source/components_minergie_enriched.json', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(mocks.request.mock.calls.find(([url]) => url.includes('/api/components-source/'))[1].body);
    expect(payload.component.categoryId).toBe('underground_roof');
  });

  it('duplique vers la base choisie avec un nouvel identifiant, sans modifier l’original', async () => {
    open('original');
    fireEvent.change(await screen.findByRole('combobox', { name: /Base de destination/ }), { target: { value: 'components_custom.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dupliquer composant' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/api/components-source/components_custom.json', expect.objectContaining({ method: 'POST' })));
    const payload = JSON.parse(mocks.request.mock.calls.find(([url]) => url.includes('/api/components-source/'))[1].body);
    expect(payload.component.id).not.toBe('original');
    expect(payload.component.parent).toBe('original');
  });

  it('garde l’enregistrement utilisateur et masque les bases système pour un non-administrateur', async () => {
    mocks.role = 'user';
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Créer le composant' }));
    expect(screen.queryByRole('combobox', { name: /Base de destination/ })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/api/content/components', expect.objectContaining({ method: 'POST' })));
    expect(mocks.request.mock.calls.some(([url]) => url.includes('/api/components-source/'))).toBe(false);
  });
});
