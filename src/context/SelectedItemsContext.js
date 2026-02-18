import React, { createContext, useState } from 'react';

const SelectedItemsContext = createContext();

export function SelectedItemsProvider({ children }) {
  const [selectedItems, setSelectedItems] = useState([]);

  return (
    <SelectedItemsContext.Provider value={{ selectedItems, setSelectedItems }}>
      {children}
    </SelectedItemsContext.Provider>
  );
}

export default SelectedItemsContext;
