import React, { useContext, useEffect, useMemo, useState } from 'react';
import { apiJson, fetchArray, labelOf, normalize } from './dashboardApi';
import LangContext from '../../context/LangContext';
import { dashboardText } from './dashboardI18n';

export default function ComponentEditorPage() {
  const { lang } = useContext(LangContext);
  const t = dashboardText(lang);
  const [items, setItems] = useState([]); const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState(''); const [json, setJson] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { fetchArray('/db/components_unified.json').then(setItems).catch((e) => setMessage(`Erreur : ${e.message}`)); }, []);
  const visible = useMemo(() => { const needle = normalize(query); return items.filter((item) => !needle || normalize(`${item.serialNo} ${item.id} ${labelOf(item, lang)}`).includes(needle)).slice(0, 100); }, [items, lang, query]);
  const choose = (item) => { setSelectedId(item.id); setJson(JSON.stringify(item, null, 2)); setMessage(''); };
  const save = async () => { try { const item = JSON.parse(json); if (String(item.id) !== String(selectedId)) throw new Error("L'id ne peut pas être changé dans cet éditeur."); const result = await apiJson('/api/lignum/component', { method: 'POST', body: JSON.stringify({ item }) }); setJson(JSON.stringify(result.item, null, 2)); setItems((current) => current.map((entry) => entry.id === item.id ? result.item : entry)); setMessage(`Composant enregistré dans ${result.versionFile}`); } catch (e) { setMessage(`Erreur : ${e.message}`); } };
  return <div className="db-component-editor"><section className="db-card"><h2>{t.componentCorrectionTitle}</h2><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`serialNo, ${t.id}, ${t.name}…`} /><div className="db-catalog-list">{visible.map((item) => <button className={selectedId === item.id ? 'active' : ''} key={item.id} onClick={() => choose(item)}><strong>{item.serialNo} · {labelOf(item, lang)}</strong><small><code>{item.id}</code></small></button>)}</div></section><section className="db-card"><h3>{t.componentJson}</h3><p>{t.componentJsonIntro}</p><textarea className="db-json-editor" value={json} disabled={!selectedId} onChange={(e) => setJson(e.target.value)} spellCheck="false" /> <button className="db-primary" disabled={!selectedId} onClick={save}>{t.saveVersion}</button>{message && <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p>}</section></div>;
}
