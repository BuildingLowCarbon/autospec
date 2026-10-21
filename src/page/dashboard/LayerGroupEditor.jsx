import React, { useState } from 'react';
import LayerFields, { emptyEditableLayer, normalizeEditedLayer } from './LayerFields';

export default function LayerGroupEditor({ initialValue, catalog, lang = 'fr', busy, onClose, onSave, allowVariants = true, allowPosition = true, title = 'Modifier le groupe de couches' }) {
  const [value, setValue] = useState(() => JSON.parse(JSON.stringify(initialValue)));
  const updateLayer = (index, patch) => setValue((current) => ({ ...current, layers: current.layers.map((layer, i) => i === index ? { ...layer, ...patch } : layer) }));
  const move = (index, offset) => setValue((current) => {
    const layers = [...current.layers];
    [layers[index], layers[index + offset]] = [layers[index + offset], layers[index]];
    return { ...current, layers };
  });
  return <section className="db-group-editor">
    <div className="db-editor-title"><h3>{title}</h3><button type="button" onClick={onClose} disabled={busy}>Fermer</button></div>
    <label>Nom du groupe<input value={value.name || ''} onChange={(event) => setValue({ ...value, name: event.target.value })} /></label>
    {allowPosition ? <label>Position<select value={value.position || 'above'} onChange={(event) => setValue({ ...value, position: event.target.value })}><option value="above">Au-dessus</option><option value="below">Au-dessous</option></select></label> : null}
    {value.layers.map((layer, index) => <div className="db-editable-layer" key={index}>
      <div className="db-editor-title"><strong>Couche {index + 1}{layer.isSupportStructure ? ' — structure porteuse' : ''}</strong><div><button type="button" disabled={!index} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === value.layers.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" onClick={() => setValue({ ...value, layers: value.layers.filter((_, i) => i !== index) })}>Supprimer la couche</button></div></div>
      <LayerFields layer={layer} catalog={catalog} lang={lang} onChange={(patch) => updateLayer(index, patch)} />
      {allowVariants ? <div className="db-layer-variants"><div className="db-editor-title"><strong>Variantes de cette couche</strong><button type="button" onClick={() => updateLayer(index, { variants: [...(layer.variants || []), { id: crypto.randomUUID(), productId: '', layerFunctionId: '' }] })}>+ Variante</button></div>{(layer.variants || []).map((variant, variantIndex) => <div className="db-editable-variant" key={variant.id || variantIndex}><strong>Variante {variantIndex + 1}</strong><LayerFields inherit base={layer} layer={variant} lang={lang} catalog={catalog} onChange={(patch) => updateLayer(index, { variants: layer.variants.map((item, i) => i === variantIndex ? { ...item, ...patch } : item) })} /><button type="button" onClick={() => updateLayer(index, { variants: layer.variants.filter((_, i) => i !== variantIndex) })}>Supprimer la variante</button></div>)}</div> : null}
    </div>)}
    <div className="db-title-actions"><button type="button" onClick={() => setValue({ ...value, layers: [...value.layers, emptyEditableLayer()] })}>+ Couche</button><button type="button" className="db-primary" disabled={busy} onClick={() => onSave({ ...value, layers: value.layers.map((layer, order) => normalizeEditedLayer(layer, order)) })}>{busy ? 'Enregistrement…' : 'Enregistrer le groupe'}</button></div>
  </section>;
}
