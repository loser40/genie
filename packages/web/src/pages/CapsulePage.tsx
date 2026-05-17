import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCapsule } from '../api';
import { WishCapsule } from '../types';

export function CapsulePage(): JSX.Element {
  const { id = '' } = useParams();
  const [capsule, setCapsule] = useState<WishCapsule | null>(null);

  useEffect(() => {
    if (!id || id === 'latest') return;
    fetchCapsule(id)
      .then((value) => setCapsule(value as WishCapsule | null))
      .catch(() => setCapsule(null));
  }, [id]);

  return (
    <main className="page">
      <div className="topbar">
        <Link className="brand" to="/">GENIE</Link>
        <Link className="ghost-button" to={`/scan/${id}`}>Scan</Link>
      </div>
      <h1 className="page-title">Wish Capsule</h1>
      {capsule ? (
        <>
          <div className="stats-grid">
            <div className="stat"><strong>{capsule.issues.healthScore}</strong><span>health</span></div>
            <div className="stat"><strong>{capsule.architecture.projectType}</strong><span>type</span></div>
            <div className="stat"><strong>{capsule.architecture.primaryLanguage}</strong><span>language</span></div>
          </div>
          <pre className="code-block">{capsule.injectText}</pre>
        </>
      ) : <p>No capsule is available for this scan yet.</p>}
    </main>
  );
}
