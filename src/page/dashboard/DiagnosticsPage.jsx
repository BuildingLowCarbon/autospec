import React, { useContext, useEffect, useState } from 'react';
import { apiJson, labelOf } from './dashboardApi';
import LangContext from '../../context/LangContext';
import { dashboardText } from './dashboardI18n';

export default function DiagnosticsPage() {
  const { lang } = useContext(LangContext);
  const t = dashboardText(lang);
  const [scope, setScope] = useState('selected');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => apiJson(`/api/lignum/diagnostics?scope=${scope}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="db-stack">
    <section className="db-card">
      <div className="db-title-row"><div><h2>{t.diagnosticsTitle}</h2><p>{t.diagnosticsIntro}</p></div><select value={scope} onChange={(e) => setScope(e.target.value)}><option value="selected">{t.selectedDatabase}</option><option value="unified">{t.unifiedDatabase}</option></select></div>
      {error ? <p className="db-error">{error}</p> : <div className="db-stats"><span><strong>{data?.summary?.components ?? '—'}</strong> {t.components}</span><span><strong>{data?.summary?.errors ?? '—'}</strong> {t.errors.toLowerCase()}</span><span><strong>{data?.summary?.warnings ?? '—'}</strong> {t.warnings}</span><span><strong>{data?.summary?.unresolvedIds ?? '—'}</strong> {t.unresolvedIds}</span></div>}
    </section>
    {data?.issues?.length ? <section className="db-card"><h3>{t.generalIssues}</h3>{data.issues.map((issue, index) => <div className={`db-issue ${issue.severity}`} key={`${issue.type}-${issue.componentId}-${index}`}><strong>{issue.type}</strong> — {issue.message} {issue.componentId && <code>{issue.componentId}</code>}</div>)}</section> : null}
    <section className="db-card"><h3>{t.unresolvedReferences}</h3>{data && !data.unresolved.length ? <p className="db-success">{t.allReferencesResolved}</p> : data?.unresolved?.map((group) => <details className="db-problem" key={group.referenceId}><summary><code>{group.referenceId}</code> — {group.occurrences.length} {t.occurrences}</summary><div>{group.occurrences.map((item, i) => <p key={`${item.componentId}-${i}`}><strong>{item.serialNo || item.componentId}</strong> · {labelOf(item, lang)} · {t.layer} {item.layer + 1} « {labelOf({ translations: item.layerTranslations, workingtitle: item.layerName }, lang) || '—'} »</p>)}</div></details>)}</section>
  </div>;
}
