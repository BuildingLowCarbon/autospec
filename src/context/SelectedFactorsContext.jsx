import React, { createContext, useState } from 'react';

const SelectedFactorsContext = createContext();

export function SelectedFactorsProvider({ children }) {
  const [selectedFactors, setSelectedFactors] = useState({});

  return (
    <SelectedFactorsContext.Provider value={{ selectedFactors, setSelectedFactors }}>
      {children}
    </SelectedFactorsContext.Provider>
  );
}

export default SelectedFactorsContext;
