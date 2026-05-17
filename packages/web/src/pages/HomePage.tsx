import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startScan } from '../api';

const features = ['Chaos Detection', 'Duplicate Finder', 'Architecture Repair', 'Wish Capsules', 'Dependency Graph', 'AI Repair Engine'];

export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const [projectPath, setProjectPath] = useState('');
  const [zip, setZip] = useState<File | undefined>();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stars = useMemo(() => Array.from({ length: 80 }, (_, index) => ({
    id: index,
    left: `${(index * 37) % 100}%`,
    top: `${(index * 61) % 100}%`,
    delay: `${(index % 9) * 0.25}s`,
  })), []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const result = await startScan({ projectPath: projectPath.trim() || undefined, zip, skipAI: false });
      window.localStorage.setItem('genie:lastScanId', result.scanId);
      navigate(`/scan/${result.scanId}`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    }
  }

  return (
    <main className="page">
      <div className="starfield">
        {stars.map((star) => (
          <span className="star" key={star.id} style={{ left: star.left, top: star.top, animationDelay: star.delay }} />
        ))}
      </div>

      <h1 className="hero-title">GENIE</h1>
      <p className="hero-copy">AI builds software fast. GENIE makes it maintainable.</p>

      <div className="feature-pills">
        {features.map((feature) => <span className="pill" key={feature}>{feature}</span>)}
      </div>

      <form className="scan-box" onSubmit={submit}>
        <label
          className="drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            setZip(event.dataTransfer.files[0]);
          }}
          style={{ borderColor: dragging ? 'var(--gold-light)' : undefined }}
        >
          {zip ? zip.name : 'Drop a project ZIP here'}
          <input
            hidden
            type="file"
            accept=".zip"
            onChange={(event) => setZip(event.target.files?.[0])}
          />
        </label>
        <div className="field-row">
          <input
            aria-label="Project folder path"
            placeholder="C:\\path\\to\\project"
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
          />
          <button className="primary-button" type="submit">Scan</button>
        </div>
        {error ? <p style={{ color: 'var(--red)' }}>{error}</p> : null}
      </form>
    </main>
  );
}
