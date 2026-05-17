import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchScan } from '../api';
import { ScanResult } from '../types';

export function RepairPage(): JSX.Element {
  const { id = '' } = useParams();
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    if (!id || id === 'latest') return;
    fetchScan(id).then(setResult).catch(() => setResult(null));
  }, [id]);

  const issues = result?.ai?.issues ?? [];
  return (
    <main className="page">
      <div className="topbar">
        <Link className="brand" to="/">GENIE</Link>
        <Link className="ghost-button" to={`/scan/${id}`}>Scan</Link>
      </div>
      <h1 className="page-title">Repair</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>
        Autonomous repair is intentionally gated behind checkpoint and confirmation flows. Manual guidance is available now.
      </p>
      <section className="issues" style={{ marginTop: 24 }}>
        {issues.map((issue) => (
          <article className="issue panel" key={issue.id}>
            <strong>[{issue.severity}] {issue.title}</strong>
            <p>{issue.fix}</p>
            <code>{issue.codeComment}</code>
          </article>
        ))}
      </section>
    </main>
  );
}
