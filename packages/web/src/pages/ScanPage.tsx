import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchScan } from '../api';
import { ScanProgress, ScanResult } from '../types';

const phases: ScanProgress['phase'][] = ['walking', 'dependencies', 'duplicates', 'ai', 'graph', 'capsule', 'done'];

export function ScanPage(): JSX.Element {
  const { id = '' } = useParams();
  const [progress, setProgress] = useState<ScanProgress>({ phase: 'walking', message: 'Connecting...', percent: 0 });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || id === 'latest') return undefined;
    window.localStorage.setItem('genie:lastScanId', id);
    const source = new EventSource(`/api/progress/${id}`);
    source.onmessage = (event) => {
      const nextProgress = JSON.parse(event.data) as ScanProgress;
      setProgress(nextProgress);
      if (nextProgress.phase === 'done') {
        source.close();
        fetchScan(id).then(setResult).catch((scanError: unknown) => setError(scanError instanceof Error ? scanError.message : String(scanError)));
      }
    };
    source.onerror = () => {
      source.close();
      fetchScan(id).then(setResult).catch((scanError: unknown) => setError(scanError instanceof Error ? scanError.message : String(scanError)));
    };
    return () => source.close();
  }, [id]);

  return (
    <main className="page">
      <Nav />
      <h1 className="page-title">Scan</h1>
      <div className="progress-wrap">
        <p>{progress.message}</p>
        <div className="progress-track"><div className="progress-bar" style={{ width: `${progress.percent}%` }} /></div>
        <div className="phase-list">
          {phases.map((phase) => <span className={`phase ${phase === progress.phase ? 'active' : ''}`} key={phase}>{phase}</span>)}
        </div>
      </div>

      {error ? <p style={{ color: 'var(--red)' }}>{error}</p> : null}
      {result ? <ScanSummary result={result} /> : null}
    </main>
  );
}

function ScanSummary({ result }: { result: ScanResult }): JSX.Element {
  const issues = result.ai?.issues ?? [];
  return (
    <>
      <div className="stats-grid">
        <div className="score-ring"><strong>{result.graph.healthScore}</strong></div>
        <div className="stat"><strong>{result.filesScanned}</strong><span>files</span></div>
        <div className="stat"><strong>{result.deps.circularChains.length}</strong><span>circular deps</span></div>
        <div className="stat"><strong>{result.duplicates.length}</strong><span>duplicates</span></div>
        <div className="stat"><strong>{result.graph.stats.deadCount}</strong><span>dead nodes</span></div>
      </div>
      <div className="action-row">
        <Link className="ghost-button" to={`/graph/${result.id}`}>Open Graph</Link>
        <Link className="ghost-button" to={`/repair/${result.id}`}>Manual Mode</Link>
        <Link className="ghost-button" to={`/repair/${result.id}`}>Grant Wish</Link>
        <Link className="ghost-button" to={`/capsule/${result.id}`}>Create Capsule</Link>
      </div>
      <section className="issues" style={{ marginTop: 24 }}>
        {issues.length === 0 ? <p>No AI issues returned. Structural scan completed.</p> : issues.map((issue) => (
          <article className="issue panel" key={issue.id}>
            <strong>[{issue.severity}] {issue.title}</strong>
            <p>{issue.explanation}</p>
          </article>
        ))}
      </section>
    </>
  );
}

function Nav(): JSX.Element {
  return (
    <div className="topbar">
      <Link className="brand" to="/">GENIE</Link>
    </div>
  );
}
