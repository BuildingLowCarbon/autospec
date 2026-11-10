import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BuildingCarbonSummary from './BuildingCarbonSummary';
import { COMPARISON_ROWS, defaultBuildingSurfaces, impactPerSreYear, partForComponent } from './BuildingCarbonSummary';

it('affiche les parties du bilan carbone dans l’ordre demandé', () => {
  const { container } = render(<BuildingCarbonSummary building={{}} />);
  expect([...container.querySelectorAll('.building-carbon-parts article > h4')].map((heading) => heading.textContent)).toEqual([
    'Radier', 'Mur extérieur sous-terrain', 'Toiture souterraine', 'Mur extérieur hors terrain', 'Fenêtres',
    'Toit', 'Parois intérieures', 'Cloisons', 'Plancher', 'Balcon',
  ]);
});

describe('liens des groupes dans l’impact carbone', () => {
  const member = { id: 'floor', categoryId: 'floor_assembly', gwp_kgco2e_m2: 12 };
  const group = { ...member, id: 'group', __isComponentGroup: true, __groupMembers: [member], translations: { fr: { name: 'Groupe de planchers' } } };
  const building = { floorCount: 2, length: 10, width: 10, sre: 200 };

  it('ouvre le groupe en conservant la surface et l’impact affichés', () => {
    const open = vi.fn();
    render(<BuildingCarbonSummary building={building} selectedItems={[group]} onOpenGroup={open}
      surfaces={{ 'component:group': { value: 42, auto: false, partId: 'floors' } }} />);
    const article = screen.getByRole('heading', { name: 'Plancher' }).closest('article');
    const line = article.querySelector('.building-carbon-line');
    const impact = line.querySelector('strong').textContent;
    fireEvent.click(within(article).getByRole('button', { name: /Groupe de planchers/ }));
    expect(open).toHaveBeenCalledWith(group);
    expect(article.querySelector(':scope > .building-carbon-line input[type=number]')).toHaveValue(42);
    expect(line.querySelector('strong').textContent).toBe(impact);
  });

  it('permet d’ouvrir chaque groupe d’un regroupement sans modifier la ligne de surface', () => {
    const open = vi.fn();
    const collection = { ...group, id: 'collection', __isGroupCollection: true, __childGroups: [group], translations: { fr: { name: 'Groupes filtrés' } } };
    render(<BuildingCarbonSummary building={building} selectedItems={[collection]} onOpenGroup={open} />);
    const article = screen.getByRole('heading', { name: 'Plancher' }).closest('article');
    fireEvent.click(within(article).getByText('Groupes filtrés'));
    fireEvent.click(within(article).getByRole('button', { name: 'Groupe de planchers' }));
    expect(open).toHaveBeenCalledWith(group);
    expect(article.querySelectorAll(':scope > .building-carbon-line input[type=number]')).toHaveLength(1);
  });
});

describe('impactPerSreYear', () => {
  it('divise l’impact par la SRE et 60 ans', () => {
    expect(impactPerSreYear(12000, 200)).toBe(1);
  });

  it('refuse une SRE nulle', () => {
    expect(impactPerSreYear(12000, 0)).toBeNull();
  });
});

describe('toits hors-sol et souterrains dans le bilan', () => {
  it('affiche les deux sélections séparément et attribue le souterrain au poste dédié', () => {
    const roof = { id: 'above', categoryId: 'flat_roof_shed_roof', gwp_kgco2e_m2: 10,
      translations: { fr: { name: 'Toit hors-sol choisi' } } };
    const underground = { id: 'buried', categoryId: 'underground_roof', gwp_kgco2e_m2: 20,
      translations: { fr: { name: 'Toit souterrain choisi' } },
      structure: { layers: [{ ecccId: 'C04.04', gwp_kgco2e_m2: 12 }, { ecccId: 'F01.01', gwp_kgco2e_m2: 8 }] } };
    render(<BuildingCarbonSummary roofType="flat" building={{ length: 10, width: 10, sre: 100 }}
      selectedItems={[roof, underground]} surfaces={{
        'component:above': { value: 20, auto: false, partId: 'roof' },
        'component:buried': { value: 30, auto: false, partId: 'underground_roofs' },
      }} />);
    const roofArticle = screen.getByRole('heading', { name: 'Toit' }).closest('article');
    const buriedArticle = screen.getByRole('heading', { name: 'Toiture souterraine' }).closest('article');
    expect(within(roofArticle).getByText('Toit hors-sol choisi')).toBeInTheDocument();
    expect(within(buriedArticle).getByText('Toit souterrain choisi')).toBeInTheDocument();
    expect(within(roofArticle).getByRole('spinbutton')).toHaveValue(20);
    expect(within(buriedArticle).getByRole('spinbutton')).toHaveValue(30);
    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    const buriedRow = within(table).getByText('Toitures souterraines').closest('tr');
    expect(buriedRow.children[1]).toHaveTextContent('0.1');
  });
});

describe('defaultBuildingSurfaces', () => {
  it('calcule les hypothèses de surface depuis la géométrie du bâtiment', () => {
    expect(defaultBuildingSurfaces({
      floorCount: 3,
      length: 10,
      width: 8,
      floorHeight: 3,
      totalHeight: 9,
      sre: 240,
      partitionRate: 0.4,
      windowsRatio: 0.25,
      interiorBearingLines: 1,
      spanDirection: 'width',
    })).toEqual({
      roof: 80,
      underground_roofs: 80,
      floors: 160,
      floor_screed: 240,
      floor_covering: 240,
      partitions: 288,
      interior_walls: 90,
      outer_walls: 243,
      underground_walls: 108,
      foundation: 80,
      balcony: 0,
      windows: 81,
    });
  });
});

describe('partForComponent', () => {
  it('distingue les murs extérieurs hors terrain et enterrés', () => {
    expect(partForComponent({ categoryId: 'outer_wall', subcategoryId: 'above_ground' })).toBe('outer_walls');
    expect(partForComponent({ categoryId: 'outer_wall', subcategoryId: 'below_ground' })).toBe('underground_walls');
  });

  it('respecte le type de toiture sélectionné', () => {
    expect(partForComponent({ categoryId: 'steep_roof' }, 'pitched')).toBe('roof');
    expect(partForComponent({ categoryId: 'flat_roof_shed_roof' }, 'flat')).toBe('roof');
    expect(partForComponent({ categoryId: 'underground_roof' }, 'flat')).toBe('underground_roofs');
    expect(partForComponent({ categoryId: 'underground_roof' }, 'pitched')).toBe('underground_roofs');
  });
});

describe('surfaces des composants', () => {
  const building = { floorCount: 2, length: 10, width: 10, floorHeight: 3, totalHeight: 6, sre: 200 };
  const first = { id: 'floor-1', categoryId: 'floor_assembly', gwp_kgco2e_m2: 10, translations: { fr: { name: 'Plancher 1' } } };
  const second = { id: 'floor-2', categoryId: 'floor_assembly', gwp_kgco2e_m2: 20, translations: { fr: { name: 'Plancher 2' } } };

  function Harness({ items }) {
    const [surfaces, setSurfaces] = useState({});
    return <BuildingCarbonSummary building={building} selectedItems={items} surfaces={surfaces} onSurfacesChange={setSurfaces} />;
  }

  const floorInputs = () => {
    const article = screen.getByRole('heading', { name: 'Plancher' }).closest('article');
    return [...article.querySelectorAll(':scope > .building-carbon-line input[type=number]')];
  };

  it('ajoute, cible, remplace puis supprime une surface sans perdre les autres lignes', async () => {
    const choosePart = vi.fn();
    function EditableHarness() {
      const [items, setItems] = useState([]);
      const [surfaces, setSurfaces] = useState({});
      return <>
        <button onClick={() => setItems((current) => [...current, first])}>Choisir A</button>
        <button onClick={() => setItems((current) => [...current, second])}>Choisir B</button>
        <button onClick={() => setItems((current) => current.filter((item) => item.id !== second.id))}>Désélectionner B</button>
        <output aria-label="Sélections">{items.map((item) => item.id).join(',')}</output>
        <BuildingCarbonSummary building={building} selectedItems={items} surfaces={surfaces} onSurfacesChange={setSurfaces}
          onSelectPart={choosePart} onUnselectItems={(ids) => setItems((current) => current.filter((item) => !ids.includes(item.id)))} />
      </>;
    }
    render(<EditableHarness />);
    fireEvent.change(floorInputs()[0], { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choisir A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une surface — Plancher' }));
    expect(floorInputs()).toHaveLength(2);
    expect(floorInputs()[1]).toHaveValue(0);
    fireEvent.change(floorInputs()[1], { target: { value: '7' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Prochaine sélection — surface 1 — Plancher' }));
    expect(choosePart).toHaveBeenCalledWith('floors');
    fireEvent.click(screen.getByRole('button', { name: 'Choisir B' }));
    await waitFor(() => expect(screen.getByLabelText('Sélections')).toHaveTextContent('floor-2'));
    expect(screen.getByLabelText('Sélections')).not.toHaveTextContent('floor-1');
    expect(floorInputs().map((input) => input.value)).toEqual(['42', '7']);
    fireEvent.click(screen.getByRole('button', { name: 'Désélectionner B' }));
    expect(floorInputs().map((input) => input.value)).toEqual(['42', '7']);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la surface 1 — Plancher' }));
    expect(floorInputs()).toHaveLength(1);
    expect(floorInputs()[0]).toHaveValue(7);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la surface 1 — Plancher' }));
    const article = screen.getByRole('heading', { name: 'Plancher' }).closest('article');
    expect(article.querySelectorAll(':scope > .building-carbon-line input[type=number]')).toHaveLength(0);
  });

  it('additionne une surface affectée et une surface libre dans les résultats copiables', () => {
    const state = {
      __surfaceRowsVersion: 1, __surfaceSelectionIds: [first.id],
      one: { surfaceRow: true, assignedItemId: first.id, value: 42, auto: false, partId: 'floors' },
      two: { surfaceRow: true, assignedItemId: null, value: 7, auto: false, partId: 'floors' },
    };
    render(<BuildingCarbonSummary building={building} selectedItems={[first]} surfaces={state}
      candidatesByPart={{ floors: [second] }} />);
    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    const row = within(table).getByText('Planchers internes').closest('tr');
    expect(row.children[1]).toHaveTextContent('0.047');
    expect(row.children[2]).toHaveTextContent('0.047');
    expect(floorInputs().map((input) => input.value)).toEqual(['42', '7']);
  });

  it('restaure les surfaces enregistrées avant le chargement asynchrone des sélections supplémentaires', async () => {
    function SavedHarness({ ready, items }) {
      const [surfaces, setSurfaces] = useState({
        'component:floor-1': { value: 42, auto: false, partId: 'floors' },
        'component:floor-2': { value: 7, auto: false, partId: 'floors' },
      });
      return <BuildingCarbonSummary building={building} selectedItems={items} selectionReady={ready} surfaces={surfaces} onSurfacesChange={setSurfaces} />;
    }

    const view = render(<SavedHarness ready={false} items={[]} />);
    view.rerender(<SavedHarness ready items={[first, second]} />);
    await waitFor(() => expect(floorInputs()).toHaveLength(2));
    expect(floorInputs()[0]).toHaveValue(42);
    expect(floorInputs()[1]).toHaveValue(7);
    expect(floorInputs()[1].closest('label')).toHaveClass('is-manual');
  });

  it('conserve toutes les lignes et surfaces après désélection et réaffectation', async () => {
    const view = render(<Harness items={[]} />);
    await waitFor(() => expect(floorInputs()[0]).toHaveValue(100));
    fireEvent.change(floorInputs()[0], { target: { value: '42' } });
    expect(floorInputs()[0]).toHaveValue(42);
    expect(floorInputs()[0].closest('label')).toHaveClass('is-manual');

    view.rerender(<Harness items={[first]} />);
    await waitFor(() => expect(floorInputs()[0]).toHaveValue(42));

    view.rerender(<Harness items={[first, second]} />);
    await waitFor(() => expect(floorInputs()).toHaveLength(2));
    expect(floorInputs()[0]).toHaveValue(42);
    expect(floorInputs()[1]).toHaveValue(0);
    fireEvent.change(floorInputs()[1], { target: { value: '7' } });

    view.rerender(<Harness items={[first]} />);
    await waitFor(() => expect(floorInputs()).toHaveLength(2));
    expect(floorInputs()[0]).toHaveValue(42);
    expect(floorInputs()[1]).toHaveValue(7);

    view.rerender(<Harness items={[first, second]} />);
    await waitFor(() => expect(floorInputs()).toHaveLength(2));
    expect(floorInputs()[1]).toHaveValue(7);

    view.rerender(<Harness items={[first]} />);
    await waitFor(() => expect(floorInputs()).toHaveLength(2));
    view.rerender(<Harness items={[]} />);
    await waitFor(() => expect(floorInputs()).toHaveLength(2));
    expect(floorInputs()[0]).toHaveValue(42);
    expect(floorInputs()[1]).toHaveValue(7);
  });
});

describe('comparaison Excel', () => {
  it('imbrique les compléments sous le plancher et additionne leurs impacts dans Planchers internes', () => {
    const component = (id, categoryId, impact, ecccId) => ({ id, categoryId, gwp_kgco2e_m2: impact,
      translations: { fr: { name: id } }, structure: { layers: [{ ecccId, gwp_kgco2e_m2: impact }] } });
    const floor = component('plancher-choisi', 'floor_assembly', 6, 'C04.01');
    const covering = component('revetement-choisi', 'floor_covering', 3, 'G02.02');
    const choosePart = vi.fn();
    render(<BuildingCarbonSummary building={{ sre: 100 }} selectedItems={[floor, covering]} onSelectPart={choosePart}
      onSurfacesChange={vi.fn()} candidatesByPart={{ floor_screed: [component('chape-a', 'floor_screed', 1, 'G02.01'), component('chape-b', 'floor_screed', 3, 'G02.01')] }}
      surfaces={{
        'component:plancher-choisi': { value: 100, auto: false, partId: 'floors' },
        'component:revetement-choisi': { value: 100, auto: false, partId: 'floor_covering' },
        'range:floor_screed': { value: 100, auto: false, partId: 'floor_screed' },
      }} />);
    const article = screen.getByRole('heading', { name: 'Plancher' }).closest('article');
    const screed = within(article).getByRole('region', { name: 'Chape supplémentaire' });
    const coveringSection = within(article).getByRole('region', { name: 'Revêtement de sol' });
    expect(within(screed).getByRole('spinbutton')).toHaveValue(100);
    expect(within(coveringSection).getByText('revetement-choisi')).toBeInTheDocument();
    fireEvent.click(within(screed).getByRole('radio'));
    expect(choosePart).toHaveBeenCalledWith('floor_screed');
    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    const row = within(table).getByText('Planchers internes').closest('tr');
    expect(row.children[1]).toHaveTextContent('0.167');
    expect(row.children[2]).toHaveTextContent('0.2');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(11);
  });

  it('regroupe tous les revêtements dans leur macro-composant, sans perdre d’impact', async () => {
    const labels = ['Fouilles', 'Fondations, radiers', 'Parois extérieures souterraines', 'Toitures souterraines',
      'Parois extérieures hors terrain', 'Fenetres et portes', 'Toitures (structure porteuse)',
      'Parois intérieures porteuse', 'Planchers internes', 'Balcons, avant-toits', 'Parois intérieures (cloison)'];
    const component = (id, categoryId, layers) => ({ id, categoryId, gwp_kgco2e_m2: 100,
      structure: { layers: layers.map(([ecccId, impact]) => ({ ecccId, gwp_kgco2e_m2: impact })) } });
    const items = [
      component('wall', 'outer_wall', [['C02.01', 40], ['E02.03', 40], ['G03.02', 20]]),
      component('roof', 'flat_roof_shed_roof', [['C04.04', 40], ['F01.02', 40], ['G04.02', 20]]),
      component('floor', 'floor_assembly', [['C04.01', 40], ['G02.01', 20], ['G02.02', 20], ['G04.01', 20]]),
      component('partition', 'partition_wall', [['G01.01', 40], ['G01.05', 20], ['G03.01', 40]]),
      component('foundation', 'foundation', [['B06.01', 10], ['C01.03', 90]]),
    ];
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<BuildingCarbonSummary building={{ sre: 100 }} roofType="flat" selectedItems={items}
      surfaces={Object.fromEntries(items.map((item) => [`component:${item.id}`, { value: 60, auto: false }]))} />);
    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows.map((row) => row.children[0].textContent)).toEqual(labels);
    for (const label of ['Parois extérieures hors terrain', 'Toitures (structure porteuse)', 'Planchers internes', 'Parois intérieures (cloison)']) {
      expect(within(table).getByText(label).closest('tr').children[1]).toHaveTextContent(/^1$/);
    }
    expect(within(table).getByText('Fouilles').closest('tr').children[1]).toHaveTextContent('0.1');
    expect(within(table).getByText('Fondations, radiers').closest('tr').children[1]).toHaveTextContent('0.9');
    fireEvent.click(screen.getByRole('button', { name: 'Copier résultats' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0][0].split('\n');
    expect(copied).toHaveLength(11);
    expect(copied.join('\n')).not.toContain(',');
    expect(copied.reduce((sum, row) => sum + Number(row.split('\t')[0]), 0)).toBeCloseTo(5);
  });

  it('regroupe les couches avant de calculer les bornes des variantes', () => {
    const variant = (id, structureImpact, finishImpact) => ({ id, categoryId: 'floor_assembly', gwp_kgco2e_m2: 30,
      structure: { layers: [{ ecccId: 'C04.01', gwp_kgco2e_m2: structureImpact }, { ecccId: 'G02.02', gwp_kgco2e_m2: finishImpact }] } });
    render(<BuildingCarbonSummary building={{ sre: 100 }} candidatesByPart={{ floors: [variant('a', 10, 20), variant('b', 20, 10)] }}
      surfaces={{ 'range:floors': { value: 100, auto: false } }} />);
    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    const row = within(table).getByText('Planchers internes').closest('tr');
    expect(row.children[1]).toHaveTextContent(/^0\.5$/);
    expect(row.children[2]).toHaveTextContent(/^0\.5$/);
  });

  it('affiche les 11 postes et copie uniquement les deux colonnes d’impact', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const component = {
      id: 'floor-excel',
      categoryId: 'floor_assembly',
      gwp_kgco2e_m2: 10,
      structure: {
        layers: [
          { ecccId: 'C04.01', gwp_kgco2e_m2: 6 },
          { ecccId: 'G02.01', gwp_kgco2e_m2: 2 },
          { ecccId: 'G02.02', gwp_kgco2e_m2: 2 },
        ],
      },
    };
    render(<BuildingCarbonSummary
      building={{ floorCount: 2, length: 10, width: 10, floorHeight: 3, sre: 200 }}
      selectedItems={[component]}
      surfaces={{ 'component:floor-excel': { value: 100, auto: false, partId: 'floors' } }}
    />);

    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    expect(within(table).getAllByRole('row')).toHaveLength(COMPARISON_ROWS.length + 1);
    const floorRow = within(table).getByText('Planchers internes').closest('tr');
    expect(floorRow.children[1]).toHaveTextContent('0.083');
    expect(floorRow.children[2]).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'Copier résultats' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copiedRows = writeText.mock.calls[0][0].split('\n');
    expect(copiedRows).toHaveLength(11);
    expect(copiedRows.every((row) => row.split('\t').length === 2)).toBe(true);
  });

  it('affiche les bornes minimale et maximale des composants disponibles', () => {
    const candidate = (id, impact) => ({
      id,
      categoryId: 'floor_assembly',
      gwp_kgco2e_m2: impact,
      structure: { layers: [{ ecccId: 'C04.01', gwp_kgco2e_m2: impact }] },
    });
    render(<BuildingCarbonSummary
      building={{ floorCount: 2, length: 10, width: 10, floorHeight: 3, sre: 200 }}
      candidatesByPart={{ floors: [candidate('low', 6), candidate('high', 12)] }}
      surfaces={{ 'range:floors': { value: 100, auto: false, partId: 'floors' } }}
    />);

    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    const floorRow = within(table).getByText('Planchers internes').closest('tr');
    expect(floorRow.children[1]).toHaveTextContent('0.05');
    expect(floorRow.children[2]).toHaveTextContent('0.1');
  });

  it('conserve une plage lorsqu’un groupe de structure est sélectionné', () => {
    const member = (id, impact) => ({
      id,
      categoryId: 'floor_assembly',
      gwp_kgco2e_m2: impact,
      structure: { layers: [{ ecccId: 'C04.01', gwp_kgco2e_m2: impact }] },
    });
    const low = member('low', 6);
    const high = member('high', 12);
    const group = {
      ...low,
      id: 'structure-group:floor',
      __isComponentGroup: true,
      __groupMembers: [low, high],
      translations: { fr: { name: 'Structure groupée' } },
    };
    render(<BuildingCarbonSummary
      building={{ floorCount: 2, length: 10, width: 10, floorHeight: 3, sre: 200 }}
      selectedItems={[group]}
      surfaces={{ 'component:structure-group:floor': { value: 100, auto: false, partId: 'floors' } }}
    />);

    const floorArticle = screen.getByRole('heading', { name: 'Plancher' }).closest('article');
    expect(within(floorArticle).getByText(/0\.05.*0\.1/)).toBeInTheDocument();
    expect(floorArticle.querySelector('.building-carbon-line strong')).toHaveTextContent('0.05 – 0.1 kg CO₂-eq/(m² SRE·an)');
    expect(document.querySelector('.building-carbon-eccc tbody tr td:last-child')).toHaveTextContent('0.05 – 0.1 kg CO₂-eq/(m² SRE·an)');
    const table = screen.getByRole('heading', { name: 'Comparaison' }).closest('section').querySelector('table');
    const floorRow = within(table).getByText('Planchers internes').closest('tr');
    expect(floorRow.children[1]).toHaveTextContent('0.05');
    expect(floorRow.children[2]).toHaveTextContent('0.1');
  });
});
