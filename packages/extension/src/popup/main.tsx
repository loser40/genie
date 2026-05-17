import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../utils';
import './popup.css';

const utils = window.GenieGraphifyUtils;

function Popup(): JSX.Element {
  const [projectPath, setProjectPath] = useState('');
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [capsule, setCapsule] = useState<WishCapsule | null>(null);
  const [error, setError] = useState('');
  const [activeCapsule, setActiveCapsule] = useState(false);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize(): Promise<void> {
    await refresh('', true);
  }

  async function savePath(): Promise<void> {
    const normalized = utils.normalizeProjectPath(projectPath);
    await utils.setStoredProjectPath(normalized);
    setProjectPath(normalized);
    await refresh(normalized);
  }

  async function refresh(pathOverride = projectPath, preferActive = false): Promise<void> {
    setStatus('checking');
    setError('');
    setActiveCapsule(false);
    const bridgeOnline = await utils.checkBridgeHealth();
    if (!bridgeOnline) {
      setStatus('offline');
      resetCapsuleUi();
      setError('Local Server Offline. Run genie bridge.');
      return;
    }

    setStatus('online');
    const normalizedPath = utils.normalizeProjectPath(pathOverride);
    if (preferActive) {
      try {
        const payload = await utils.fetchCapsule();
        setCapsule(payload.capsule);
        setProjectPath(payload.capsule.projectPath);
        setActiveCapsule(true);
        await utils.setStoredProjectPath(payload.capsule.projectPath);
        return;
      } catch {
        setActiveCapsule(false);
        await utils.setStoredProjectPath('');
        setProjectPath('');
        resetCapsuleUi();
        setError('No live Capsule loaded.');
        return;
      }
    }

    if (!normalizedPath) {
      resetCapsuleUi();
      setError('Set a project path to load a live Capsule.');
      return;
    }

    try {
      const payload = await utils.fetchCapsule(normalizedPath);
      setCapsule(payload.capsule);
    } catch (caught) {
      resetCapsuleUi();
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function resetCapsuleUi(): void {
    setCapsule(null);
    setActiveCapsule(false);
  }

  async function clearCapsule(): Promise<void> {
    setStatus('checking');
    setError('');
    try {
      // Nuclear wipe: clear capsule AND chat memory on the backend.
      await utils.clearCapsule();
      await fetch('http://127.0.0.1:14747/bridge/memory', { method: 'DELETE' }).catch(() => {});
      setProjectPath('');
      resetCapsuleUi();
      setStatus('online');
      setError('GENIE state cleared.');
    } catch (caught) {
      setStatus('offline');
      resetCapsuleUi();
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function openVisualizer(): Promise<void> {
    if (!capsule) return;
    if (activeCapsule) {
      await utils.setStoredProjectPath(capsule.projectPath);
    } else {
      await savePath();
    }
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
  }

  return (
    <main className="popup-shell">
      <header>
        <div>
          <p className="eyebrow">GENIE Graphify</p>
          <h1>Capsule Visualizer</h1>
        </div>
        <span className={`status ${status}`}>{status === 'online' ? 'Bridge online' : status === 'offline' ? 'Offline' : 'Checking'}</span>
      </header>

      {activeCapsule && capsule ? (
        <section className="active-project">
          <span>Active Project</span>
          <strong>{capsule.projectName}</strong>
        </section>
      ) : (
        <label className="field">
          <span>Project path</span>
          <textarea value={projectPath} onChange={(event) => setProjectPath(event.target.value)} spellCheck={false} />
        </label>
      )}

      {capsule ? (
        <section className="capsule-card">
          <strong>{capsule.projectName}</strong>
          <span>{capsule.architecture.projectType} / {capsule.architecture.primaryLanguage}</span>
          <b>Health {capsule.issues.healthScore} / 100</b>
        </section>
      ) : (
        <section className="message">{error || 'No live Capsule loaded.'}</section>
      )}

      <div className="actions">
        <button type="button" onClick={() => refresh(projectPath)}>Refresh</button>
        <button type="button" onClick={openVisualizer} disabled={!capsule}>Open Visualizer</button>
        <button className="clear-action" type="button" onClick={clearCapsule}>🗑 Clear</button>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Popup />);
