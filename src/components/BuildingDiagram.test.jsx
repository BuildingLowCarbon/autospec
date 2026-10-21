import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BuildingDiagram, { BUILDING_PARTS, ROOF_TYPES } from './BuildingDiagram';

afterEach(cleanup);

describe('toiture souterraine indépendante', () => {
  it('sépare la catégorie des formes de toiture et des toits hors-sol', () => {
    expect(ROOF_TYPES.map((type) => type.id)).toEqual(['flat', 'pitched']);
    expect(BUILDING_PARTS.find((part) => part.id === 'roof').categories).not.toContain('underground_roof');
    expect(BUILDING_PARTS.find((part) => part.id === 'underground_roofs').categories).toEqual(['underground_roof']);
  });

  it('attribue seulement les lignes basses à la toiture souterraine', () => {
    const select = vi.fn();
    const { container } = render(<BuildingDiagram roofType="flat" selectedPart="underground_roofs" onSelectPart={select} />);
    const roof = container.querySelector('g[aria-label="Sélectionner le toit"]');
    const underground = container.querySelector('g[aria-label="Sélectionner la toiture souterraine"]');
    expect(roof.querySelector('path')).toHaveAttribute('d', 'M69 78L252 78');
    expect(roof.querySelectorAll('path')).toHaveLength(1);
    expect(underground.querySelector('path')).toHaveAttribute('d', 'M4 303H65M256 247H295M362 247H323');
    expect(underground).toHaveAttribute('aria-pressed', 'true');
    expect(roof).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(underground);
    expect(select).toHaveBeenCalledWith('underground_roofs');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('garde la toiture souterraine sélectionnable avec un toit en pente', () => {
    const select = vi.fn();
    render(<BuildingDiagram roofType="pitched" onSelectPart={select} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Sélectionner la toiture souterraine' }), { key: 'Enter' });
    expect(select).toHaveBeenCalledWith('underground_roofs');
  });
});
