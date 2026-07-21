import React, { useContext, useEffect, useMemo, useState } from 'react';
import { apiJson, fetchArray, labelOf, normalize } from './dashboardApi';
import LangContext from '../../context/LangContext';
import { dashboardText } from './dashboardI18n';

export default function SelectionPage() {
  const { lang } = useContext(LangContext);
  const t = dashboardText(lang);
  const [components, setComponents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState({ key: 'serialNo', direction: 'asc' });

  useEffect(() => {
    Promise.all([fetchArray('/db/components_unified.json'), fetchArray('/db/components_lignum_selected.json')])
      .then(([all, current]) => { setComponents(all); setSelected(new Set(current.map((item) => String(item.id)))); })
      .catch((error) => setMessage(`Erreur : ${error.message}`));
  }, []);

  const visible = useMemo(() => {
    const needle = normalize(query);
    const collator = new Intl.Collator(lang, { numeric: true, sensitivity: 'base' });
    return components
      .filter((item) => (!onlySelected || selected.has(String(item.id))) && (!needle || [item.id, item.serialNo, labelOf(item, lang)].some((value) => normalize(value).includes(needle))))
      .sort((a, b) => {
        const aValue = sort.key === 'name' ? labelOf(a, lang) : a[sort.key];
        const bValue = sort.key === 'name' ? labelOf(b, lang) : b[sort.key];
        const result = collator.compare(String(aValue ?? ''), String(bValue ?? ''));
        return sort.direction === 'asc' ? result : -result;
      });
  }, [components, lang, onlySelected, query, selected, sort]);

  const changeSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }));
  const sortLabel = (key, label) => `${label}${sort.key === key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}`;

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(String(id))) next.delete(String(id)); else next.add(String(id));
    return next;
  });

  const save = async () => {
    setBusy(true); setMessage('Enregistrement…');
    try {
      const result = await apiJson('/api/lignum/selection', { method: 'POST', body: JSON.stringify({ selectedIds: Array.from(selected) }) });
      setMessage(`${result.count} composants enregistrés. Version : ${result.versionFile}`);
    } catch (error) { setMessage(`Erreur : ${error.message}`); } finally { setBusy(false); }
  };

  return <section className="db-card">
    <div className="db-title-row"><div><h2>{t.selectionTitle}</h2><p>{t.selectionIntro}</p></div><button className="db-primary" disabled={busy} onClick={save}>{t.saveVersion} ({selected.size})</button></div>
    <div className="db-toolbar"><input type="search" placeholder={`${t.search} serialNo, id, ${t.name.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} /><label><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> {t.selectedOnly}</label><span>{visible.length}/{components.length}</span></div>
    {message && <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p>}
    <div className="db-table-wrap"><table className="db-table"><thead><tr><th>{t.select}</th><th><button className="db-sort" onClick={() => changeSort('serialNo')}>{sortLabel('serialNo', t.serialNo)}</button></th><th><button className="db-sort" onClick={() => changeSort('id')}>{sortLabel('id', t.id)}</button></th><th><button className="db-sort" onClick={() => changeSort('name')}>{sortLabel('name', t.name)}</button></th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className={selected.has(String(item.id)) ? 'is-selected' : ''}><td><input aria-label={`${t.select} ${item.serialNo}`} type="checkbox" checked={selected.has(String(item.id))} onChange={() => toggle(item.id)} /></td><td>{item.serialNo || '—'}</td><td><code>{item.id}</code></td><td>{labelOf(item, lang)}</td></tr>)}</tbody></table></div>
  </section>;
}
