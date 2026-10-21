import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LangContext from '../context/LangContext';
import { groupBuildingComponents } from '../utils/buildingComponentGroups';
import { makeGroupCollection, serializeGroupSelection, readBuildingDraft, writeBuildingDraft } from '../utils/buildingGroupSelections';
import ComponentGroup from './ComponentGroup';

const { components } = vi.hoisted(() => ({ components: [100, 200].map((thickness, index) => ({
  id: `component-${index}`, categoryId: 'floor_assembly',
  structure: { layers: [{ isSupportStructure: true, productId: 'wood', thickness_mm: thickness }] },
})) }));
vi.mock('../components/Header', () => ({ default: () => null }));
vi.mock('../utils/loadComponents', () => ({ default: async () => components }));
vi.mock('../utils/loadMaterials', () => ({ default: async () => [] }));
vi.mock('../utils/loadProducts', () => ({ default: async () => [] }));

describe('commandes de la page de groupe', () => {
  it('modifie le brouillon et retire un groupe de la collection sans changer sa clé de surface', async () => {
    const groups = groupBuildingComponents(components);
    const collection = makeGroupCollection(groups, 'surface-collection');
    const key = 'group-page-test-draft';
    writeBuildingDraft(key, { id: 'building-1', state: { selectedGroups: [serializeGroupSelection(collection)] } });
    render(<LangContext.Provider value={{ lang: 'fr', setLang: vi.fn() }}><MemoryRouter initialEntries={[{
      pathname: `/my-buildings/group/${encodeURIComponent(groups[0].__groupKey)}`,
      state: { projectId: 'building-1', projectSessionKey: key, descriptor: serializeGroupSelection(groups[0]), matchingIds: [components[0].id] },
    }]}><Routes><Route path="/my-buildings/group/:groupKey" element={<ComponentGroup />} /></Routes></MemoryRouter></LangContext.Provider>);
    const selected = await screen.findByRole('checkbox', { name: 'Sélectionner le groupe' });
    const ignored = screen.getByRole('checkbox', { name: 'Ignorer le groupe' });
    expect(selected).toBeChecked();
    fireEvent.click(ignored);
    expect(selected).not.toBeChecked();
    expect(ignored).toBeChecked();
    const draft = readBuildingDraft(key);
    expect(draft.dirty).toBe(true);
    expect(draft.state.selectedGroups[0].id).toBe('surface-collection');
    expect(draft.state.selectedGroups[0].children).toHaveLength(1);
    fireEvent.click(selected);
    expect(selected).toBeChecked();
    expect(ignored).not.toBeChecked();
    expect(readBuildingDraft(key).state.selectedGroups).toHaveLength(2);
    sessionStorage.removeItem(key);
  });
});
