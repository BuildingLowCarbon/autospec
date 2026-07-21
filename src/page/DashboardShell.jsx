import React, { useContext } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import Dashboard from './Dashboard';
import CatalogPage from './dashboard/CatalogPage';
import ComponentEditorPage from './dashboard/ComponentEditorPage';
import DiagnosticsPage from './dashboard/DiagnosticsPage';
import MappingsPage from './dashboard/MappingsPage';
import SelectionPage from './dashboard/SelectionPage';
import UnifyPage from './dashboard/UnifyPage';
import './dashboard/dashboard.css';
import { dashboardText } from './dashboard/dashboardI18n';

const pages = { unifier: UnifyPage, selection: SelectionPage, erreurs: DiagnosticsPage, correspondances: MappingsPage, catalogue: CatalogPage, composants: ComponentEditorPage };
const linkKeys = [['unifier', 'unification'], ['selection', 'selection'], ['erreurs', 'errors'], ['correspondances', 'mappings'], ['catalogue', 'materialsProducts'], ['composants', 'componentEditing'], ['custom', 'customTools']];

export default function DashboardShell() {
  const { section } = useParams();
  const { lang, setLang } = useContext(LangContext);
  const t = dashboardText(lang);
  if (!section) return <Navigate to="/dashboard/unifier" replace />;
  if (section === 'custom') return <Dashboard />;
  const Page = pages[section];
  return <><Header lang={lang} setLang={setLang} /><main className="db-dashboard"><header className="db-dashboard-header"><div><span className="db-eyebrow">{t.administration}</span><h1>{t.databases}</h1></div><nav>{linkKeys.map(([path, key]) => <NavLink key={path} to={`/dashboard/${path}`}>{t[key]}</NavLink>)}</nav></header>{Page ? <Page /> : <Navigate to="/dashboard/unifier" replace />}</main></>;
}
