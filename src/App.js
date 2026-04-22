import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Filters from './page/Filters';
import TbzResult from './page/tbz_result';
import Element from './page/Element';
import Custom from './page/Custom';
import Material from './page/Material';
import Product from './page/Product';
import React, { useState } from 'react';
import LangContext from './context/LangContext';
import { SelectedItemsProvider } from './context/SelectedItemsContext';
import { SelectedFactorsProvider } from './context/SelectedFactorsContext';

function App() {
  const [lang, setLang] = useState('fr');
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <SelectedItemsProvider>
        <SelectedFactorsProvider>
          <Router>
            <Routes>
              <Route path="/" element={<Filters />} />
              <Route path="/tbz-result" element={<TbzResult />} />
              <Route path="/element/:id" element={<Element />} />
              <Route path="/custom/:id" element={<Custom />} />
              <Route path="/material/:id" element={<Material />} />
              <Route path="/product/:id" element={<Product />} />
            </Routes>
          </Router>
        </SelectedFactorsProvider>
      </SelectedItemsProvider>
    </LangContext.Provider>
  );
}

export default App;
