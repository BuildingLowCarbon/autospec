import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ComponentPreviewViews from './ComponentPreviewViews';
import ComponentGroupCard from './ComponentGroupCard';

vi.mock('./Graphic', () => ({
  DEFAULT_PX_PER_MM_X: 1,
  ViewSVG: ({ view }) => <svg data-testid={view} />,
}));

afterEach(cleanup);

describe('aperçus des groupes et variantes', () => {
  it('affiche les coupes transverse et longitudinale', () => {
    render(<ComponentPreviewViews layers={[{ thickness_mm: 100 }]} />);
    expect(screen.getByRole('img', { name: 'Coupe transverse' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Coupe longitudinale' })).toBeInTheDocument();
    expect(screen.getByTestId('transverse')).toBeInTheDocument();
    expect(screen.getByTestId('longitudinal')).toBeInTheDocument();
  });

  it('gère les composants sans couches', () => {
    render(<ComponentPreviewViews />);
    expect(screen.getByText('Aucun aperçu')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('affiche les deux vues sur la carte sans la mention de la variante', () => {
    const representative = { structure: { layers: [{ thickness_mm: 100 }] } };
    render(<ComponentGroupCard group={{ __representative: representative, __groupMembers: [representative] }} selected={false} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.queryByText(/Illustration de la variante/)).not.toBeInTheDocument();
  });
});
