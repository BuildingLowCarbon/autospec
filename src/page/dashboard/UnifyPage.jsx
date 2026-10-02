import React, { useContext, useEffect, useState } from 'react';
import { apiJson } from './dashboardApi';
import LangContext from '../../context/LangContext';
import { dashboardText } from './dashboardI18n';

export default function UnifyPage() {
  const { lang } = useContext(LangContext);
  const t = dashboardText(lang);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => apiJson('/api/lignum/status').then(setStatus).catch((error) => setMessage(error.message));
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unify = async () => {
    setBusy(true);
    setMessage(t.unifying);
    try {
      const result = await apiJson('/api/lignum/unify', { method: 'POST', body: '{}' });
      setMessage(`${result.count} composants unifiés. Version créée : ${result.versionFile}`);
      await load();
    } catch (error) {
      setMessage(`Erreur : ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return <div className="db-stack">
    <section className="db-card">
      <h2>{t.unifyTitle}</h2>
      <p>{t.unifyIntro}</p>
      <div className="db-stats">
        <span><strong>{status?.counts?.unified ?? '—'}</strong> {t.currentComponents}</span>
        <span><strong>{status?.versions?.unified?.length ?? '—'}</strong> {t.archivedVersions}</span>
      </div>
      <button className="db-primary" type="button" disabled={busy} onClick={unify}>{busy ? t.unifying : t.unifyButton}</button>
      {message && <p className={message.startsWith('Erreur') ? 'db-error' : 'db-success'}>{message}</p>}
    </section>
    <section className="db-card">
      <h3>{t.sourcesUsed}</h3>
      <code>public/db/source_database/lignum/components/Lignum_components_de.json</code><br />
      <code>…/Lignum_components_en.json</code><br />
      <code>…/Lignum_components_fr.json</code>
      {status?.versions?.unified?.length ? <><h3>{t.latestVersions}</h3><ul>{status.versions.unified.slice(0, 8).map((file) => <li key={file}><code>{file}</code></li>)}</ul></> : null}
    </section>
  </div>;
}
