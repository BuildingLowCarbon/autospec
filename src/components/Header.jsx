import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import LangContext from '../context/LangContext';
import { useAuth } from '../context/AuthContext';


function Header() {
  const { lang, setLang } = useContext(LangContext);
  const { user, can, logout } = useAuth();
  const accountLinkStyle = { color: '#526159', fontSize: '14px', textDecoration: 'none' };
  const languageLabels = { fr: 'Langue', de: 'Sprache', it: 'Lingua', en: 'Language' };

  return (
    <div style={{
      width: '100%',
      padding: '12px 16px',
      backgroundColor: '#f2f2f2',
      borderBottom: '1px solid #ccc',
      marginBottom: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <h1 style={{ margin: 0, fontSize: '25px', fontWeight: 'bold' }}>AutoSpec</h1>
        <Link to="/" style={{ color: '#222' }}>Filtres</Link>
        <Link to="/building" style={{ color: '#222' }}>Building</Link>
        {can('dashboard') && <Link to="/dashboard" style={{ color: '#222' }}>Dashboard</Link>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {user && <Link to="/organizations" style={accountLinkStyle}>Organisations</Link>}
        {user
          ? <Link to="/profile" style={accountLinkStyle}>{user.displayName || user.username}</Link>
          : <Link to="/login" style={{ ...accountLinkStyle, color: '#246b4b', fontWeight: 700 }}>Connexion</Link>}
        <label htmlFor="lang-select" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontSize: '14px' }}>
          <span>{languageLabels[lang] || languageLabels.fr} :</span>
          <select id="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
          <option value="en">English</option>
          </select>
        </label>
        {user && <button type="button" onClick={logout} style={{ padding: '6px 9px', border: '1px solid #aeb8b2', borderRadius: '5px', background: '#fff', cursor: 'pointer' }}>Déconnexion</button>}
      </div>
    </div>
  );
}

export default Header;
