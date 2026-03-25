import React, { useContext } from 'react';
import LangContext from '../context/LangContext';


function Header() {
  const { lang, setLang } = useContext(LangContext);

  return (
    <div style={{
      width: '100%',
      padding: '12px 16px',
      backgroundColor: '#f2f2f2',
      borderBottom: '1px solid #ccc',
      marginBottom: '16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <h1 style={{ margin: 0, fontSize: '25px', fontWeight: 'bold' }}>AutoSpec</h1>

      <div>
        <label htmlFor="lang-select" style={{ marginRight: '8px' }}>Langue :</label>
        <select id="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="it">Italiano</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  );
}

export default Header;
