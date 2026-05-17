import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GeniePanel, ScanSummary } from './components/GeniePanel';
import { LampDesktop, LampState } from './components/LampDesktop';
import './styles/widget.css';
import './styles/glassmorphism.css';

type AppState = LampState;
const STAGE_WIDTH = 360;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1;
const SCALE_STEP = 0.25;

function Widget(): JSX.Element {
  const [state, setState] = useState<AppState>('idle');
  const [panelOpen, setPanelOpen] = useState(false);
  const [scanResult, setScanResult] = useState<ScanSummary | null>(null);
  const [uiScale, setUiScale] = useState(1);
  const [summonKey, setSummonKey] = useState(0);
  const summonTimers = useRef<number[]>([]);

  useEffect(() => {
    clearSummonTimers();
    setState('idle');
    setPanelOpen(false);
    setScanResult(null);
    setSummonKey(0);
  }, []);

  useEffect(() => () => clearSummonTimers(), []);

  useEffect(() => {
    const regions = [
      { x: 126, y: 300, width: 234, height: 220 },
      { x: 180, y: 230, width: 130, height: 190 },
    ];

    if (state === 'summoning') {
      regions.push({ x: 150, y: 96, width: 190, height: 330 });
    }

    if (state === 'summoning' || state === 'open') {
      regions.push({ x: 70, y: 150, width: 290, height: 280 });
    }

    if (panelOpen) {
      regions.push({ x: 24, y: 14, width: 300, height: 380 });
    }

    window.genie.setHitRegions(regions.map(scaleHitRegion));
  }, [panelOpen, state, uiScale]);

  function scaleHitRegion(region: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    return {
      x: Math.round(STAGE_WIDTH - (STAGE_WIDTH - region.x) * uiScale),
      y: Math.round(region.y * uiScale),
      width: Math.round(region.width * uiScale),
      height: Math.round(region.height * uiScale),
    };
  }

  function clearSummonTimers(): void {
    for (const timer of summonTimers.current) {
      window.clearTimeout(timer);
    }
    summonTimers.current = [];
  }

  function handleLampClick(): void {
    clearSummonTimers();

    if (state === 'open' || state === 'summoning' || state === 'vibrating') {
      setPanelOpen(false);
      setState('idle');
      return;
    }

    setPanelOpen(false);
    setSummonKey((current) => current + 1);
    setState('vibrating');
    summonTimers.current = [
      window.setTimeout(() => setState('summoning'), 460),
      window.setTimeout(() => {
        setState('open');
      }, 1780),
    ];
  }

  function handleGenieClick(): void {
    clearSummonTimers();
    if (state === 'summoning' || state === 'vibrating') {
      setState('open');
    }
    setPanelOpen(true);
  }

  function handleClose(): void {
    setPanelOpen(false);
  }

  function adjustScale(direction: -1 | 1): void {
    setUiScale((current) => {
      const next = Math.round((current + direction * SCALE_STEP) * 100) / 100;
      return Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    });
  }

  function resetScale(): void {
    setUiScale(1);
  }

  return (
    <div className="widget-root">
      <div
        className="widget-stage"
        style={{ transform: `scale(${uiScale})`, transformOrigin: 'top right' }}
      >
        {panelOpen ? (
          <GeniePanel
            onClose={handleClose}
            scanResult={scanResult}
            onScanResult={setScanResult}
            uiScale={uiScale}
            onScaleDown={() => adjustScale(-1)}
            onScaleUp={() => adjustScale(1)}
            onScaleReset={resetScale}
            canScaleDown={uiScale > MIN_SCALE}
            canScaleUp={uiScale < MAX_SCALE}
          />
        ) : null}
        <LampDesktop
          state={state}
          summonKey={summonKey}
          onClick={handleLampClick}
          onGenieClick={handleGenieClick}
          onMouseEnter={() => state === 'idle' && setState('hover')}
          onMouseLeave={() => state === 'hover' && setState('idle')}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Widget />
  </React.StrictMode>,
);
