import { describe, expect, it } from 'vitest';
import { createMaterialReferenceResolver } from './componentMaterialReferences';

describe('références matériaux des générations', () => {
  const materials = [{ id: 'tbz-wood', kbobId: 'wood' }, { id: 'other', kbobId: 'other-kbob' }];
  const resolver = createMaterialReferenceResolver(materials, [], [{ lignumId: 'source-wood', tbzId: 'tbz-wood' }]);
  it('applique uniquement une correspondance explicite et conserve sa provenance', () => {
    const source = { productId: 'source-wood', kbobId: 'old', thickness_mm: 100 };
    expect(resolver.layer(source)).toMatchObject({ productId: 'tbz-wood', kbobId: 'wood', sourceProductId: 'source-wood', thickness_mm: 100 });
    expect(source.productId).toBe('source-wood');
  });
  it('résout également les variantes et synchronise le KBOB du nouveau matériau', () => {
    const resolved = resolver.layer({ productId: 'tbz-wood', kbobId: 'wrong', variants: [{ productId: 'other', kbobId: 'wood' }] });
    expect(resolved.kbobId).toBe('wood');
    expect(resolved.variants[0].kbobId).toBe('other-kbob');
  });
  it('ne devine aucun matériau sur la seule base du KBOB', () => {
    expect(resolver.layer({ productId: 'unknown', kbobId: 'wood' }).productId).toBe('unknown');
  });
});
