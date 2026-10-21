import React from 'react';
import LayerGroupEditor from './LayerGroupEditor';

export default function StructureVariantEditor(props) {
  return <LayerGroupEditor {...props} allowPosition={false} title="Variantes de la structure (porteuse et couches intégrées)" onSave={(value) => props.onSave({ ...value, includesIntegratedLayers: true })} />;
}
