import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BuildingCriteria from './BuildingCriteria';

describe('BuildingCriteria en mode My Buildings', () => {
  it('ignore et ne modifie pas les filtres généraux de Building', async () => {
    const generalState = JSON.stringify({ floorCount: 9, buildingLength: 99 });
    window.sessionStorage.setItem('autospec-building-criteria', generalState);
    const onStateChange = vi.fn();

    render(
      <BuildingCriteria
        selectedCategories={['floor_assembly']}
        initialState={{ floorCount: 3, buildingLength: 12, buildingWidth: 8 }}
        storageKey={null}
        onStateChange={onStateChange}
      />,
    );

    expect(screen.getByLabelText(/Nombre d’étages/)).toHaveValue(3);
    fireEvent.change(screen.getByLabelText(/Nombre d’étages/), { target: { value: '4' } });
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ floorCount: '4' })));
    expect(window.sessionStorage.getItem('autospec-building-criteria')).toBe(generalState);
  });
});
