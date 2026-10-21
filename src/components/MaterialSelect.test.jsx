import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MaterialSelect from './MaterialSelect';

describe('recherche des matériaux', () => {
  it('affiche densité et KBOB et filtre sur ces valeurs', () => {
    const onChange = vi.fn();
    render(<MaterialSelect catalog={[{ id: 'wood', workingtitle: 'Bois', density_kg_m3: 450, kbobId: '07.001' }, { id: 'concrete', workingtitle: 'Béton', density_kg_m3: 2300, kbobId: '01.002' }]} onChange={onChange} />);
    expect(screen.getByRole('option', { name: /Bois · ρ 450 kg\/m³ · KBOB 07.001/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '2300 01.002' } });
    expect(screen.queryByRole('option', { name: /Bois/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Béton/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'concrete' } });
    expect(onChange).toHaveBeenCalledWith('concrete');
  });
});
