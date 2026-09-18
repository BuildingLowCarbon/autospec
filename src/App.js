import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Filters from './page/Filters';
import TbzResult from './page/tbz_result';
import Element from './page/Element';
import Custom from './page/Custom';
import DashboardShell from './page/DashboardShell';
import Building from './page/Building';
import Material from './page/Material';
import Product from './page/Product';
import Login from './page/Login';
import ProtectedRoute from './components/ProtectedRoute';
import Profile from './page/Profile';
import Organizations from './page/Organizations';
import MaterialEditor from './page/MaterialEditor';
import React, { useState } from 'react';
import LangContext from './context/LangContext';
import { AuthProvider } from './context/AuthContext';
import { SelectedItemsProvider } from './context/SelectedItemsContext';
import { SelectedFactorsProvider } from './context/SelectedFactorsContext';

function App() {
  const [lang, setLang] = useState('fr');
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <SelectedItemsProvider>
        <SelectedFactorsProvider>
          <Router>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Filters />} />
                <Route path="/tbz-result" element={<TbzResult />} />
                <Route path="/element/:id" element={<Element />} />
                <Route path="/building" element={<Building />} />
                <Route path="/material/:id" element={<Material />} />
                <Route path="/product/:id" element={<Product />} />
                <Route element={<ProtectedRoute permission="app" />}>
                  <Route path="/custom/:id" element={<Custom />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/organizations" element={<Organizations />} />
                  <Route path="/material-custom/:id" element={<MaterialEditor />} />
                </Route>
                <Route path="/dashboard/:section?" element={<ProtectedRoute permission="dashboard"><DashboardShell /></ProtectedRoute>} />
              </Routes>
            </AuthProvider>
          </Router>
        </SelectedFactorsProvider>
      </SelectedItemsProvider>
    </LangContext.Provider>
  );
}

export default App;
