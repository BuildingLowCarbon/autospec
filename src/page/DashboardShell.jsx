import React, { useContext } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import Header from '../components/Header';
import LangContext from '../context/LangContext';
import Dashboard from './Dashboard';
import CatalogPage from './dashboard/CatalogPage';
import ComponentEditorPage from './dashboard/ComponentEditorPage';
import ComponentCompletenessPage from './dashboard/ComponentCompletenessPage';
import DiagnosticsPage from './dashboard/DiagnosticsPage';
import MappingsPage from './dashboard/MappingsPage';
import SelectionPage from './dashboard/SelectionPage';
import TaxonomyPage from './dashboard/TaxonomyPage';
import UnifyPage from './dashboard/UnifyPage';
import UsersPage from './dashboard/UsersPage';
import './dashboard/dashboard.css';
import { dashboardText } from './dashboard/dashboardI18n';
import { useAuth } from '../context/AuthContext';

const pages = { unifier: UnifyPage, selection: SelectionPage, erreurs: DiagnosticsPage, correspondances: MappingsPage, catalogue: CatalogPage, composants: ComponentEditorPage, incomplets: ComponentCompletenessPage, taxonomies: TaxonomyPage, custom: Dashboard, utilisateurs: UsersPage };
const linkKeys = [['unifier', 'unification'], ['selection', 'selection'], ['erreurs', 'errors'], ['correspondances', 'mappings'], ['catalogue', 'materialsProducts'], ['composants', 'componentEditing'], ['incomplets', 'incompleteComponents'], ['taxonomies', 'taxonomyManagement'], ['custom', 'customTools']];

export default function DashboardShell() {
  const { section } = useParams();
  const { lang, setLang } = useContext(LangContext);
  const { can } = useAuth();
  const t = dashboardText(lang);
  if (!section) return <Navigate to="/dashboard/unifier" replace />;
  if (section === 'utilisateurs' && !can('manageUsers')) return <Navigate to="/dashboard/unifier" replace />;
  const Page = pages[section];
  const visibleLinks = can('manageUsers') ? [...linkKeys, ['utilisateurs', 'userManagement']] : linkKeys;
  return <><Header lang={lang} setLang={setLang} /><main className="db-dashboard"><header className="db-dashboard-header"><div><span className="db-eyebrow">{t.administration}</span><h1>{t.databases}</h1></div><nav>{visibleLinks.map(([path, key]) => <NavLink key={path} to={`/dashboard/${path}`}>{t[key]}</NavLink>)}</nav></header>{Page ? <Page /> : <Navigate to="/dashboard/unifier" replace />}</main></>;
}
