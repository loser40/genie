import React, { useEffect, useState } from 'react';
import { DropZone } from './DropZone';
import { PanelButton } from './PanelButton';

export interface ScanSummary {
  healthScore: number;
  filesScanned: number;
  issueCount: number;
  projectName: string;
  capsule: boolean;
  projectPath: string;
  circularChains: number;
  duplicateGroups: number;
}

interface Progress {
  message: string;
  percent: number;
}

interface RepairApplyResult {
  success: boolean;
  rewrittenFiles: string[];
  backups: string[];
  finalHealthScore: number;
  message: string;
  usedFallback: boolean;
  handoffMode: boolean;
}

interface Props {
  onClose: () => void;
  scanResult: ScanSummary | null;
  onScanResult: (result: ScanSummary | null) => void;
  uiScale: number;
  onScaleDown: () => void;
  onScaleUp: () => void;
  onScaleReset: () => void;
  canScaleDown: boolean;
  canScaleUp: boolean;
}

type ActiveView = 'dashboard' | 'chat';

export function GeniePanel({
  canScaleDown,
  canScaleUp,
  onClose,
  onScaleDown,
  onScaleReset,
  onScaleUp,
  scanResult,
  onScanResult,
  uiScale,
}: Props): JSX.Element {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [projectPath, setProjectPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ message: 'Ready', percent: 0 });
  const [chatInput, setChatInput] = useState('');
  const [chatReply, setChatReply] = useState('Drop a project or ask me what to fix.');
  const [chatLoading, setChatLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [handoffMode, setHandoffMode] = useState(false);
  const handoffMessage = 'Local repair failed (Code too complex). A Web Capsule has been generated. Open Claude or ChatGPT and click the GENIE Lamp to inject this context.';

  useEffect(() => {
    resetLocalState(false);
  }, []);

  useEffect(() => {
    const offProgress = window.genie.onScanProgress((data) => {
      const next = data as Progress;
      setProgress({ message: next.message, percent: next.percent });
    });
    const offDone = window.genie.onScanDone((data) => {
      const summary = data as ScanSummary;
      setScanning(false);
      setProgress({ message: 'Scan complete', percent: 100 });
      setChatReply(`${summary.projectName}: ${summary.healthScore}/100 health, ${summary.issueCount} structural issues.`);
      onScanResult(summary);
    });
    const offError = window.genie.onScanError((data) => {
      const error = data as { message: string };
      setScanning(false);
      setChatReply(`Scan failed: ${error.message}`);
    });
    return () => {
      offProgress();
      offDone();
      offError();
    };
  }, [onScanResult]);

  async function handleScan(): Promise<void> {
    if (!projectPath.trim()) return;
    setHandoffMode(false);
    setScanning(true);
    setProgress({ message: 'Starting scan...', percent: 0 });
    await window.genie.scanProject(projectPath.trim());
  }

  function resetLocalState(clearScanResult = true): void {
    setProjectPath('');
    setScanning(false);
    setProgress({ message: 'Ready', percent: 0 });
    setChatInput('');
    setChatReply('Drop a project or ask me what to fix.');
    setChatLoading(false);
    setRepairing(false);
    setHandoffMode(false);
    setActiveView('dashboard');
    if (clearScanResult) onScanResult(null);
  }

  async function handleClear(): Promise<void> {
    resetLocalState();
    try {
      // Nuclear wipe: clear capsule AND chat memory on backend.
      await fetch('http://127.0.0.1:14747/bridge/capsule', { method: 'DELETE' });
      await fetch('http://127.0.0.1:14747/bridge/memory', { method: 'DELETE' }).catch(() => {});
      setChatReply('GENIE state cleared.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setChatReply(`Clear failed: ${message}`);
    }
  }

  async function handleOpenFolder(): Promise<void> {
    const picked = await window.genie.openFolder();
    if (picked) setProjectPath(picked);
  }

  async function handleDrop(droppedPath: string): Promise<void> {
    setProjectPath(droppedPath);
    setHandoffMode(false);
    setScanning(true);
    setProgress({ message: 'Reading drop...', percent: 0 });
    if (droppedPath.toLowerCase().endsWith('.zip')) {
      await window.genie.scanZip(droppedPath);
    } else {
      await window.genie.scanProject(droppedPath);
    }
  }

  async function handleInject(): Promise<void> {
    if (!projectPath.trim()) return;
    const text = await window.genie.getInjectText(projectPath.trim());
    await navigator.clipboard.writeText(text);
    setChatReply('/genie context copied to clipboard.');
  }

  async function handleCapsule(): Promise<void> {
    if (!projectPath.trim()) return;
    setHandoffMode(false);
    setScanning(true);
    setProgress({ message: 'Creating Wish Capsule...', percent: 0 });
    await window.genie.createCapsule(projectPath.trim());
    setScanning(false);
    setChatReply('Wish Capsule created.');
  }

  async function handleGrantWish(): Promise<void> {
    if (!projectPath.trim() || repairing) return;

    setRepairing(true);
    setHandoffMode(false);
    setScanning(true);
    setProgress({ message: 'GENIE is rewriting files...', percent: 12 });
    setChatReply('GENIE is rewriting files...');

    try {
      const response = await fetch('http://127.0.0.1:14747/api/repair/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: projectPath.trim(),
          allowFallback: true,
        }),
      });
      const payload = await response.json() as RepairApplyResult | { error?: string };
      if ('handoffMode' in payload && payload.handoffMode) {
        setScanning(false);
        setHandoffMode(true);
        setChatReply(handoffMessage);
        setProgress({ message: 'Handoff Mode: Web Capsule ready', percent: 100 });
        return;
      }

      if (!response.ok || !('success' in payload) || !payload.success) {
        const message = 'error' in payload && payload.error ? payload.error : 'GENIE repair did not rewrite any files.';
        throw new Error(message);
      }

      setChatReply([
        `Wish granted. Rewritten: ${payload.rewrittenFiles.join(', ') || 'none'}.`,
        `Backup: ${payload.backups[0] ?? 'not needed'}.`,
        `Verified health: ${payload.finalHealthScore}/100.`,
      ].join(' '));
      setProgress({ message: 'Repair complete. Rescanning...', percent: 88 });
      await handleScan();
    } catch (error) {
      setScanning(false);
      try {
        await window.genie.createCapsule(projectPath.trim());
        setHandoffMode(true);
        setChatReply(handoffMessage);
        setProgress({ message: 'Handoff Mode: Web Capsule ready', percent: 100 });
      } catch {
        const message = error instanceof Error ? error.message : String(error);
        setChatReply(`Grant Wish failed: ${message}`);
        setProgress({ message: 'Repair failed', percent: 0 });
      }
    } finally {
      setRepairing(false);
    }
  }

  async function handleAsk(): Promise<void> {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    const reply = await window.genie.askGenie(chatInput.trim());
    setChatReply(reply);
    setChatInput('');
    setChatLoading(false);
  }

  function handleQuit(): void {
    window.genie.quitApp();
  }

  return (
    <div
      className="panel glass"
      onClick={(event) => event.stopPropagation()}
      onMouseEnter={() => window.genie.setInteractive(true)}
      onMouseLeave={() => window.genie.setInteractive(false)}
    >
      <div className="panel-header">
        <span className="panel-title">GENIE</span>
        <div className="panel-actions">
          <div className="scale-strip" aria-label="Widget size">
            <button type="button" onClick={onScaleDown} disabled={!canScaleDown}>-</button>
            <span>{Math.round(uiScale * 100)}%</span>
            <button type="button" onClick={onScaleUp} disabled={!canScaleUp}>+</button>
            <button className="scale-reset" type="button" onClick={onScaleReset}>↺ Reset</button>
          </div>
          <button className="hide-btn" type="button" onClick={onClose}>Hide</button>
          <button className="close-btn" type="button" onClick={handleQuit} aria-label="Close GENIE">x</button>
        </div>
      </div>

      {/* View Router Nav */}
      <div className="view-nav">
        <button
          type="button"
          className={`view-nav-btn ${activeView === 'dashboard' ? 'view-nav-active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          🛠️ Dashboard
        </button>
        <button
          type="button"
          className={`view-nav-btn ${activeView === 'chat' ? 'view-nav-active' : ''}`}
          onClick={() => setActiveView('chat')}
        >
          💬 Chat
        </button>
      </div>

      {/* Dashboard View */}
      <div className={`view-panel ${activeView === 'dashboard' ? 'view-active' : 'view-hidden'}`}>
        <HealthBar score={scanResult?.healthScore ?? 0} />
        <DropZone onDrop={handleDrop} />

        <div className="path-row">
          <input
            className="path-input"
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            placeholder="D:\\path\\to\\project"
            onKeyDown={(event) => event.key === 'Enter' && handleScan()}
          />
          <button className="clear-btn" type="button" onClick={handleClear}>🗑 Clear</button>
          <button className="scan-btn" type="button" onClick={handleScan} disabled={scanning}>
            {scanning ? '...' : '>'}
          </button>
        </div>

        <div className="progress-wrap">
          <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
          <span className="progress-label">{progress.message}</span>
        </div>

        <div className="btn-grid">
          <PanelButton icon="S" label="Scan Project" onClick={handleScan} />
          <PanelButton icon="G" label="Graph Summary" onClick={() => setChatReply(scanResult ? `${scanResult.circularChains} circular chains, ${scanResult.duplicateGroups} duplicate groups.` : 'Run a scan first.')} />
          <PanelButton icon="C" label="Wish Capsule" onClick={handleCapsule} />
          <PanelButton icon="/" label="/genie Inject" onClick={handleInject} />
          <PanelButton icon="F" label="Pick Folder" onClick={handleOpenFolder} />
          <PanelButton
            icon="W"
            label={repairing ? 'GENIE is rewriting files...' : 'Grant Wish'}
            onClick={handleGrantWish}
            disabled={repairing || !projectPath.trim()}
          />
        </div>

        <div className={`chat-reply ${handoffMode ? 'chat-reply-handoff' : ''}`}>
          <span className="chat-genie-label">{handoffMode ? 'HANDOFF MODE' : 'GENIE'}</span>
          <p className="chat-text">{chatReply}</p>
        </div>
      </div>

      {/* Chat View */}
      <div className={`view-panel ${activeView === 'chat' ? 'view-active' : 'view-hidden'}`}>
        <div className={`chat-reply chat-reply-full ${handoffMode ? 'chat-reply-handoff' : ''}`}>
          <span className="chat-genie-label">{handoffMode ? 'HANDOFF MODE' : 'GENIE'}</span>
          <p className="chat-text">{chatReply}</p>
        </div>
        <div className="chat-row">
          <input
            className="chat-input"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder="Ask GENIE..."
            onKeyDown={(event) => event.key === 'Enter' && handleAsk()}
            disabled={chatLoading}
          />
          <button className="chat-send" type="button" onClick={handleAsk} disabled={chatLoading}>
            {chatLoading ? '...' : '>'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HealthBar({ score }: { score: number }): JSX.Element {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="health-bar">
      <span className="health-label">Health</span>
      <div className="health-track">
        <div className="health-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="health-score">{score || '--'}/100</span>
    </div>
  );
}
