import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './LampWidget.css';

type LampState = 'idle' | 'hover' | 'vibrating' | 'summoned' | 'panel-open';

export function LampWidget(): JSX.Element {
  const [state, setState] = useState<LampState>('idle');
  const location = useLocation();
  const scanId = getCurrentScanId(location.pathname);

  useEffect(() => {
    if (state !== 'vibrating') return undefined;
    const summonedTimer = window.setTimeout(() => setState('summoned'), 500);
    const panelTimer = window.setTimeout(() => setState('panel-open'), 900);
    return () => {
      window.clearTimeout(summonedTimer);
      window.clearTimeout(panelTimer);
    };
  }, [state]);

  const isSummoned = state === 'summoned' || state === 'panel-open';

  return (
    <div
      className={`lamp-widget lamp-${state}`}
      onMouseEnter={() => state === 'idle' && setState('hover')}
      onMouseLeave={() => state === 'hover' && setState('idle')}
    >
      {state === 'idle' || state === 'hover' ? <div className="lamp-tooltip">Need help fixing your codebase?</div> : null}
      {isSummoned ? <GenieCharacter /> : null}
      {state === 'vibrating' || isSummoned ? <Smoke /> : null}
      {state === 'panel-open' ? <GeniePanel scanId={scanId} /> : null}
      <button
        className="lamp-button"
        type="button"
        aria-label="Summon GENIE"
        onClick={() => setState(state === 'panel-open' ? 'idle' : 'vibrating')}
      >
        <GenieLamp />
      </button>
    </div>
  );
}

function GenieLamp(): JSX.Element {
  return (
    <svg className="lamp-svg" viewBox="0 0 180 110" role="img" aria-label="Golden lamp">
      <defs>
        <linearGradient id="lampGold" x1="0" x2="1">
          <stop offset="0%" stopColor="#a16207" />
          <stop offset="45%" stopColor="#ffd166" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <ellipse cx="82" cy="78" rx="54" ry="18" fill="url(#lampGold)" />
      <path d="M42 70 C58 30 112 30 132 70 C113 86 61 86 42 70Z" fill="url(#lampGold)" />
      <path d="M128 62 C154 54 168 58 174 74 C155 70 142 74 130 82" fill="none" stroke="#ffd166" strokeWidth="10" strokeLinecap="round" />
      <path d="M42 70 C22 58 11 57 5 68 C24 66 33 74 45 82" fill="none" stroke="#f4a825" strokeWidth="8" strokeLinecap="round" />
      <rect x="70" y="26" width="31" height="16" rx="8" fill="#facc15" />
      <circle cx="88" cy="34" r="38" fill="rgba(139,92,246,.14)" className="lamp-glow" />
    </svg>
  );
}

function GenieCharacter(): JSX.Element {
  return (
    <svg className="genie-svg" viewBox="0 0 120 150" role="img" aria-label="Genie character">
      <path d="M61 104 C80 112 76 133 51 143 C62 129 48 123 40 113 C33 104 38 94 49 94Z" fill="#8b5cf6" opacity="0.75" />
      <circle cx="61" cy="45" r="24" fill="#7dd3fc" />
      <path d="M36 40 C43 16 77 15 87 42 C76 31 55 32 36 40Z" fill="#4c1d95" />
      <circle cx="53" cy="45" r="3" fill="#05030f" />
      <circle cx="70" cy="45" r="3" fill="#05030f" />
      <path d="M52 57 C58 62 67 62 72 57" fill="none" stroke="#05030f" strokeWidth="3" strokeLinecap="round" />
      <path d="M37 79 C13 73 13 48 33 45" fill="none" stroke="#7dd3fc" strokeWidth="12" strokeLinecap="round" />
      <path d="M84 78 C108 72 108 48 88 45" fill="none" stroke="#7dd3fc" strokeWidth="12" strokeLinecap="round" />
      <path d="M38 72 C48 62 75 62 85 72 C84 96 72 109 60 109 C48 109 38 96 38 72Z" fill="#06b6d4" />
    </svg>
  );
}

function Smoke(): JSX.Element {
  return (
    <div className="smoke" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function GeniePanel({ scanId }: { scanId: string | null }): JSX.Element {
  const actions = [
    { label: 'Repair Project', to: scanId ? `/repair/${scanId}` : '/' },
    { label: 'Create Wish Capsule', to: scanId ? `/capsule/${scanId}` : '/' },
    { label: 'Open Graph', to: scanId ? `/graph/${scanId}` : '/' },
    { label: 'Manual Mode', to: scanId ? `/scan/${scanId}` : '/' },
    { label: 'Grant Wish (Auto)', to: scanId ? `/repair/${scanId}` : '/' },
    { label: 'Restore Checkpoint', to: scanId ? `/repair/${scanId}` : '/' },
  ];

  return (
    <div className="genie-panel">
      {actions.map((action) => (
        <Link className="genie-action" key={action.label} to={action.to}>
          {action.label}
        </Link>
      ))}
    </div>
  );
}

function getCurrentScanId(pathname: string): string | null {
  const match = pathname.match(/^\/(?:scan|graph|repair|capsule)\/([^/]+)/);
  if (match?.[1] && match[1] !== 'latest') return match[1];
  return window.localStorage.getItem('genie:lastScanId');
}
