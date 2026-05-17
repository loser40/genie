(function attachGenieGraphifyUtils(globalScope: typeof globalThis) {
  const BRIDGE_ORIGIN = 'http://127.0.0.1:14747';
  const PROJECT_PATH_KEY = 'genieProjectPath';
  const MEMORY_POINTER_KEY = 'genieMemoryLastInjectedIndex';
  const MEMORY_CHUNK_SIZE = 10;

  function normalizeProjectPath(value: unknown): string {
    return String(value || '').trim().replace(/^["']|["']$/g, '');
  }

  async function getStoredProjectPath(): Promise<string> {
    const result = await storageGet(PROJECT_PATH_KEY);
    return normalizeProjectPath(result[PROJECT_PATH_KEY]);
  }

  function setStoredProjectPath(projectPath: string): Promise<void> {
    return chrome.storage.local.set({ [PROJECT_PATH_KEY]: normalizeProjectPath(projectPath) });
  }

  async function getMemoryPointer(): Promise<number> {
    const result = await storageGet(MEMORY_POINTER_KEY);
    const pointer = Number(result[MEMORY_POINTER_KEY] || 0);
    return Number.isFinite(pointer) && pointer > 0 ? Math.floor(pointer) : 0;
  }

  function setMemoryPointer(pointer: number): Promise<void> {
    return chrome.storage.local.set({ [MEMORY_POINTER_KEY]: Math.max(0, Math.floor(pointer)) });
  }

  function storageGet(key: string): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result: Record<string, unknown>) => resolve(result));
    });
  }

  async function fetchBridgeJson(endpoint: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${BRIDGE_ORIGIN}${endpoint}`, init);
    if (!response.ok) throw new Error(await readBridgeError(response));
    return response.json();
  }

  async function fetchCapsule(projectPath?: string): Promise<{ capsule: WishCapsule; generatedAt: string; active?: boolean }> {
    const normalizedPath = normalizeProjectPath(projectPath);
    const url = new URL(`${BRIDGE_ORIGIN}/bridge/capsule`);
    if (normalizedPath) url.searchParams.set('path', normalizedPath);
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) throw new Error(await readBridgeError(response));
    const payload = await response.json() as { capsule?: WishCapsule | null; generatedAt?: string; active?: boolean };
    if (!payload.capsule) throw new Error('No live Capsule returned by GENIE bridge.');
    return {
      capsule: payload.capsule,
      generatedAt: payload.generatedAt || new Date().toISOString(),
      active: payload.active,
    };
  }

  async function clearCapsule(): Promise<void> {
    await fetchBridgeJson('/bridge/capsule', { method: 'DELETE' });
    await setStoredProjectPath('');
  }

  async function fetchMemory(): Promise<BridgeMemoryResponse> {
    return fetchBridgeJson('/bridge/memory', { method: 'GET' }) as Promise<BridgeMemoryResponse>;
  }

  async function postMemory(exchanges: BridgeMemoryExchange[], meta: MemoryCaptureMeta = {}): Promise<BridgeMemorySaveResponse> {
    return fetchBridgeJson('/bridge/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchanges,
        platform: meta.platform,
        sourceUrl: meta.sourceUrl,
      }),
    }) as Promise<BridgeMemorySaveResponse>;
  }

  async function nextMemoryChunk(): Promise<MemoryChunk> {
    const memory = await fetchMemory();
    const exchanges = Array.isArray(memory.exchanges) ? memory.exchanges : [];
    if (exchanges.length === 0) {
      throw new Error('No captured chat memory found. Click Generate first.');
    }

    const pointer = await getMemoryPointer();
    const start = pointer >= exchanges.length ? 0 : pointer;
    const chunk = exchanges.slice(start, start + MEMORY_CHUNK_SIZE);
    const nextPointer = start + chunk.length;
    await setMemoryPointer(nextPointer >= exchanges.length ? 0 : nextPointer);

    return {
      exchanges: chunk,
      part: Math.floor(start / MEMORY_CHUNK_SIZE) + 1,
      startIndex: start,
      total: exchanges.length,
    };
  }

  async function readBridgeError(response: Response): Promise<string> {
    try {
      const data = await response.json() as { error?: string };
      return data.error || response.statusText || 'GENIE bridge request failed.';
    } catch {
      return response.statusText || 'GENIE bridge request failed.';
    }
  }

  async function checkBridgeHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${BRIDGE_ORIGIN}/bridge/health`, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  function buildCodebaseMemoryBlock(capsule: WishCapsule): string {
    const graph = capsule.graph;
    const stats = graph?.stats;
    const topIssues = capsule.issues.openIssues.slice(0, 20);
    const riskyFiles = (graph?.nodes || [])
      .filter((node) => node.status !== 'healthy' || node.issues.length > 0)
      .sort((a, b) => riskScore(b) - riskScore(a))
      .slice(0, 40);

    const lines = [
      '[GENIE CODEBASE MEMORY]',
      `Project: ${capsule.projectName}`,
      `Path: ${capsule.projectPath}`,
      `Updated: ${capsule.updatedAt}`,
      `Type: ${capsule.architecture.projectType}`,
      `Primary language: ${capsule.architecture.primaryLanguage}`,
      `Health: ${capsule.issues.healthScore} / 100`,
      `Architecture: ${capsule.architecture.summary}`,
      `Layers: ${capsule.architecture.layerStructure}`,
    ];

    if (stats) {
      lines.push(
        `Graph: ${stats.totalFiles} files, ${graph?.edges.length || 0} dependency edges`,
        `Risk mix: ${stats.chaosCount} circular, ${stats.duplicateCount} duplicate, ${stats.deadCount} orphan, ${stats.warningCount} warning`,
      );
    }

    if (topIssues.length > 0) {
      lines.push('', 'Open Issues:');
      topIssues.forEach((issue, index) => lines.push(`${index + 1}. ${truncate(issue, 280)}`));
    }

    if (riskyFiles.length > 0) {
      lines.push('', 'High-signal files:');
      riskyFiles.forEach((node) => {
        const issueText = node.issues.map((issue) => `${issue.severity}: ${issue.title}`).join('; ');
        lines.push(`- ${node.relativePath} [${node.status}, ${node.lineCount} lines, imports ${node.importCount}, used by ${node.importedByCount}] ${truncate(issueText, 320)}`);
      });
    }

    lines.push('[/GENIE CODEBASE MEMORY]');
    return `${lines.join('\n')}\n`;
  }

  function buildActionPromptBlock(fetchedData: string): string {
    const siren = String.fromCodePoint(0x1F6A8);
    const emDash = String.fromCodePoint(0x2014);
    return [
      `${siren} [GENIE SYSTEM OVERRIDE: AUTONOMOUS REPAIR INITIATED] ${siren}`,
      '',
      `You are a Principal Software Architect. I am providing you with the "GENIE Capsule"${emDash}a complete architectural blueprint and health scan of my current project. `,
      '',
      'YOUR DIRECTIVE:',
      '1. Analyze the "Dark Spots" and identified errors in the context below.',
      '2. You must immediately resolve the highest-priority issues preventing this app from compiling or running optimally.',
      '3. Provide the exact, complete file rewrites needed to fix these issues. ',
      '4. Do not ask for permission. Execute the repair plan immediately.',
      '',
      '--- [BEGIN GENIE CAPSULE CONTEXT] ---',
      '',
      fetchedData.trim(),
      '',
      '--- [END GENIE CAPSULE CONTEXT] ---',
      '',
    ].join('\n');
  }

  function buildDynamicRepairPrompt(capsule: WishCapsule): string {
    const rawCapsuleData = JSON.stringify(capsule, null, 2);
    const healthScore = readHealthScore(capsule);
    const totalFiles = readTotalFiles(capsule);
    let dynamicDirectives = '';

    if (totalFiles === 0 || healthScore === 10) {
      dynamicDirectives = [
        'PRIMARY DIRECTIVE:',
        'Focus ONLY on identifying and repairing compile blockers, structural corruption, missing source mappings, and scan failures preventing proper project analysis.',
        'RULES:',
        '- Do NOT generate placeholder architecture.',
        '- Do NOT hallucinate missing files.',
        '- If diagnostics are unavailable, determine WHY the scanner failed to detect source files.',
        '- Prioritize recovery of project structure and readable source indexing.',
      ].join('\n');
    } else if (healthScore === 100) {
      dynamicDirectives = 'The project is currently healthy. Analyze the architecture and suggest optimizations or implement new features.';
    } else {
      dynamicDirectives = 'CRITICAL: The project health is failing. Focus EXCLUSIVELY on fixing the compile-blockers and syntax errors listed in the diagnostics.';
    }

    const diagnostics = readCapsuleDiagnostics(capsule);
    const specificErrors = diagnostics.length > 0
      ? diagnostics.slice(0, 3).join(', ')
      : 'None detected.';

    return [
      '🚨 [GENIE V2 OVERRIDE: DYNAMIC REPAIR INITIATED] 🚨',
      'You are operating as a Principal Software Architect. I am providing the REAL project state extracted directly from the filesystem.',
      '',
      `PROJECT STATUS: Health Score ${healthScore}/100`,
      `TOP ERRORS: ${specificErrors}`,
      '',
      dynamicDirectives,
      '',
      'Provide exact fixes only. Wrap every rewrite in markdown blocks using filepath attributes.',
      '',
      '--- [BEGIN VERIFIED CAPSULE CONTEXT] ---',
      rawCapsuleData,
      '--- [END VERIFIED CAPSULE CONTEXT] ---',
      '',
    ].join('\n');
  }

  function buildChatMemoryBlock(chunk: MemoryChunk): string {
    const lines = [
      `[GENIE MEMORY STREAM: PART ${chunk.part}]`,
      `Range: exchanges ${chunk.startIndex + 1}-${chunk.startIndex + chunk.exchanges.length} of ${chunk.total}`,
    ];

    chunk.exchanges.forEach((exchange, index) => {
      const absoluteIndex = chunk.startIndex + index + 1;
      lines.push(
        '',
        `Exchange ${absoluteIndex}`,
        `User: ${truncate(exchange.user, 1800)}`,
        `AI: ${truncate(exchange.ai, 2400)}`,
      );
    });

    lines.push('[/GENIE MEMORY STREAM]');
    return `${lines.join('\n')}\n`;
  }

  function nodeColor(node: CapsuleGraphNode, capsule: WishCapsule): string {
    const health = Number(capsule?.issues?.healthScore ?? capsule?.graph?.healthScore ?? 50);
    const risk = Math.max(0, Math.min(100, 100 - health + riskScore(node) * 8));
    const hue = Math.round(132 - risk * 1.12);
    const saturation = Math.round(56 + risk * 0.32);
    const lightness = Math.round(42 + Math.max(0, 45 - risk) * 0.12);
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }

  function nodeRadius(node: CapsuleGraphNode): number {
    const lines = Number(node.lineCount || 0);
    const complexity = Number(node.importCount || 0) + Number(node.importedByCount || 0) + (node.issues?.length || 0) * 4;
    return Math.max(7, Math.min(30, 7 + Math.sqrt(lines + 1) * 0.38 + complexity * 0.35));
  }

  function edgeColor(edge: CapsuleGraphEdge, capsule: WishCapsule): string {
    const health = Number(capsule?.issues?.healthScore ?? capsule?.graph?.healthScore ?? 50);
    const risk = Math.max(0, Math.min(100, 100 - health + (edge.isCircular ? 42 : 0)));
    return `hsl(${Math.round(150 - risk * 1.2)} ${Math.round(45 + risk * 0.35)}% ${Math.round(46 + (100 - risk) * 0.1)}%)`;
  }

  function formatIssueCount(node: CapsuleGraphNode): string {
    const count = Array.isArray(node.issues) ? node.issues.length : 0;
    return count === 1 ? '1 dark spot' : `${count} dark spots`;
  }

  function findEditor(): Element | null {
    const active = document.activeElement;
    if (isEditor(active)) return active;

    const selectors = [
      'textarea:not([readonly])',
      '[contenteditable="true"]',
      '.ProseMirror',
      '[role="textbox"]',
      'div[aria-label*="message" i]',
      'div[aria-label*="prompt" i]',
    ];
    return selectors.map((selector) => document.querySelector(selector)).find(isEditor) || null;
  }

  function isEditor(element: Element | null): element is HTMLElement {
    if (!element) return false;
    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    return tag === 'textarea' || (element as HTMLElement).isContentEditable || element.getAttribute('role') === 'textbox';
  }

  function insertTextIntoEditor(editor: Element | null, text: string): void {
    if (!editor) throw new Error('No active chat input found.');
    (editor as HTMLElement).focus();

    if (editor.tagName && editor.tagName.toLowerCase() === 'textarea') {
      const textarea = editor as HTMLTextAreaElement;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
      textarea.selectionStart = start + text.length;
      textarea.selectionEnd = start + text.length;
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editor.textContent = `${editor.textContent || ''}${text}`;
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  function riskScore(node: CapsuleGraphNode): number {
    const statusPenalty = {
      chaos: 11,
      duplicate: 7,
      dead: 6,
      warning: 4,
      healthy: 0,
    }[node.status] || 0;
    return statusPenalty + (node.isCircular ? 5 : 0) + (node.issues?.length || 0);
  }

  function readHealthScore(capsule: WishCapsule): number {
    const score = Number(capsule?.healthScore ?? capsule?.issues?.healthScore ?? capsule?.graph?.healthScore ?? 0);
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function readTotalFiles(capsule: WishCapsule): number {
    const totalFiles = Number(capsule?.stats?.totalFiles ?? capsule?.graph?.stats?.totalFiles ?? capsule?.graph?.nodes?.length ?? 0);
    if (!Number.isFinite(totalFiles)) return 0;
    return Math.max(0, Math.round(totalFiles));
  }

  function readCapsuleDiagnostics(capsule: WishCapsule): string[] {
    const topLevelDiagnostics = Array.isArray(capsule.diagnostics) ? capsule.diagnostics : [];
    const openIssues = Array.isArray(capsule.issues?.openIssues) ? capsule.issues.openIssues : [];
    const nodeDiagnostics = Array.isArray(capsule.graph?.nodes)
      ? capsule.graph.nodes.flatMap((node) => [
        ...(Array.isArray(node.diagnostics) ? node.diagnostics : []),
        ...(Array.isArray(node.issues) ? node.issues.map((issue) => issue.title) : []),
      ])
      : [];

    return dedupeStrings([...topLevelDiagnostics, ...openIssues, ...nodeDiagnostics])
      .map((item) => truncate(item, 220))
      .filter(Boolean);
  }

  function dedupeStrings(values: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
    return result;
  }

  function truncate(value: string, limit: number): string {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) return normalized;
    return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
  }

  (globalScope as any).GenieGraphifyUtils = {
    BRIDGE_ORIGIN,
    MEMORY_CHUNK_SIZE,
    PROJECT_PATH_KEY,
    buildActionPromptBlock,
    buildChatMemoryBlock,
    buildCodebaseMemoryBlock,
    buildDynamicRepairPrompt,
    checkBridgeHealth,
    clearCapsule,
    edgeColor,
    fetchCapsule,
    fetchMemory,
    findEditor,
    formatIssueCount,
    getStoredProjectPath,
    insertTextIntoEditor,
    nextMemoryChunk,
    nodeColor,
    nodeRadius,
    normalizeProjectPath,
    postMemory,
    setMemoryPointer,
    setStoredProjectPath,
  };
})(globalThis);
