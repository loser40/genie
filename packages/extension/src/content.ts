(function mountUniversalGenieInjector() {
  const utils = window.GenieGraphifyUtils;
  const wrapperId = 'genie-lamp-wrapper';
  const styleId = 'genie-omni-injector-style';
  const menuId = 'genie-omni-injector-menu';
  const lampUrl = chrome.runtime.getURL('assets/lamp.png');
  const lampPositionKey = 'genieLampViewportPosition';
  let mountedEditor: Element | null = null;
  let toastTimer = 0;
  let positionLoaded = false;
  let suppressNextToggleClick = false;
  let dragState: {
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
    wrapper: HTMLDivElement;
  } | null = null;

  if (!utils) return;

  function mount(): void {
    const editor = utils.findEditor();
    if (editor) mountedEditor = editor;

    ensureStyles();

    let wrapper = document.getElementById(wrapperId) as HTMLDivElement | null;
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = wrapperId;
      Object.assign(wrapper.style, {
        position: 'fixed',
        right: '30px',
        bottom: '30px',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      });
      wrapper.innerHTML = `
        <div class="genie-lamp-cluster">
          <button type="button" class="genie-lamp-button" data-genie-action="toggle" aria-label="Open GENIE memory menu">
            <img src="${lampUrl}" alt="GENIE Lamp" class="genie-lamp-img" style="width: 60px; height: 60px; object-fit: contain; cursor: pointer; filter: drop-shadow(0px 0px 8px rgba(168, 85, 247, 0.6));" draggable="false" />
            <span class="genie-lamp-smoke" aria-hidden="true"></span>
          </button>
          <div id="${menuId}" class="genie-inject-menu" hidden>
            <button type="button" data-genie-action="save-chat">&#128190; Save Chat</button>
            <button type="button" data-genie-action="drop-code">&#128229; Drop Code</button>
            <button type="button" data-genie-action="drop-chat">&#128229; Drop Chat</button>
          </div>
        </div>
        <div class="genie-toast" role="status" aria-live="polite"></div>
      `;
      wrapper.addEventListener('click', handleWrapperClick);
      wrapper.addEventListener('pointerdown', stopNativeEvent);
      wrapper.addEventListener('mousedown', handleDragStart);
      document.addEventListener('click', handleOutsideClick, true);
    }

    if (wrapper.parentElement !== document.body) {
      document.body.appendChild(wrapper);
    }

    if (!positionLoaded) {
      positionLoaded = true;
      void applyStoredLampPosition(wrapper);
    }
  }

  async function handleWrapperClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-genie-action]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      const action = button.dataset.genieAction;
      if (action === 'toggle') {
        if (suppressNextToggleClick) {
          suppressNextToggleClick = false;
          return;
        }
        toggleMenu();
        return;
      }
      if (action === 'save-chat') {
        await saveChatMemory();
        return;
      }
      if (action === 'drop-code') {
        await dropCodeMemory();
        return;
      }
      if (action === 'drop-chat') {
        await dropChatMemory();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), true);
    }
  }

  function stopNativeEvent(event: Event): void {
    event.stopPropagation();
  }

  function handleOutsideClick(event: MouseEvent): void {
    const wrapper = document.getElementById(wrapperId);
    if (wrapper && !wrapper.contains(event.target as Node)) closeMenu();
  }

  async function saveChatMemory(): Promise<void> {
    const exchanges = scrapeConversation();
    if (exchanges.length === 0) {
      throw new Error('No user/AI exchanges were detected on this page yet.');
    }

    const response = await utils.postMemory(exchanges, {
      platform: detectPlatform(),
      sourceUrl: window.location.href,
    });
    closeMenu();
    showToast(response.saved > 0 ? 'Chat Context Saved to Local Memory!' : 'No new chat context was saved.');
  }

  async function dropCodeMemory(): Promise<void> {
    const editor = utils.findEditor() || mountedEditor;
    closeMenu();

    const lamp = document.querySelector<HTMLButtonElement>('.genie-lamp-button');
    await runLampAnimation(lamp);

    const { block, label } = await getCodeDropBlock();
    const inserted = await injectIntoEditorOrClipboard(editor, `${block}\n`);
    if (inserted) showToast(label);
  }

  async function dropChatMemory(): Promise<void> {
    const editor = utils.findEditor() || mountedEditor;
    closeMenu();

    const lamp = document.querySelector<HTMLButtonElement>('.genie-lamp-button');
    await runLampAnimation(lamp);

    const { block, label } = await getChatDropBlock();
    const inserted = await injectIntoEditorOrClipboard(editor, `${block}\n`);
    if (inserted) showToast(label);
  }

  async function getCodeDropBlock(): Promise<{ block: string; label: string }> {
    const payload = await utils.fetchCapsule();
    await utils.setStoredProjectPath(payload.capsule.projectPath);
    return {
      block: utils.buildDynamicRepairPrompt(payload.capsule),
      label: 'Dropped GENIE dynamic code repair prompt.',
    };
  }

  async function getChatDropBlock(): Promise<{ block: string; label: string }> {
    const memory = await utils.fetchMemory();
    const exchanges = Array.isArray(memory.exchanges) ? memory.exchanges : [];
    if (exchanges.length === 0) throw new Error('No captured chat memory found. Click Save Chat first.');

    const lines = [
      '[GENIE CHAT MEMORY]',
      `Updated: ${memory.updatedAt || new Date().toISOString()}`,
      `Exchanges: ${exchanges.length}`,
    ];

    exchanges.forEach((exchange, index) => {
      lines.push(
        '',
        `Exchange ${index + 1}`,
        `User: ${exchange.user}`,
        `AI: ${exchange.ai}`,
      );
    });

    lines.push('[/GENIE CHAT MEMORY]');
    return {
      block: lines.join('\n'),
      label: 'Dropped saved chat memory.',
    };
  }

  function scrapeConversation(): BridgeMemoryExchange[] {
    const messages = collectRoleMessages();
    const fallbackMessages = messages.length >= 2 ? messages : collectFallbackMessages();
    return pairMessages(fallbackMessages).map((exchange) => ({
      ...exchange,
      platform: detectPlatform(),
      sourceUrl: window.location.href,
      capturedAt: new Date().toISOString(),
    }));
  }

  function collectRoleMessages(): RawChatMessage[] {
    const selectors = [
      '[data-message-author-role]',
      '[data-author]',
      '[data-testid*="user" i]',
      '[data-testid*="assistant" i]',
      '[data-testid*="bot" i]',
      '[aria-label*="user" i]',
      '[aria-label*="assistant" i]',
      '[aria-label*="response" i]',
    ];

    return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))))
      .map((element) => {
        const role = inferRole(element);
        const text = extractVisibleText(element);
        return role && text ? { role, text } : null;
      })
      .filter((message): message is RawChatMessage => message !== null);
  }

  function collectFallbackMessages(): RawChatMessage[] {
    const selectors = [
      'main article',
      'main [role="article"]',
      'main [data-testid*="message" i]',
      'main .message',
      'main .chat-message',
    ];
    const blocks = uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector))))
      .map(extractVisibleText)
      .filter((text) => text.length > 12 && !text.includes('Save Chat') && !text.includes('Drop Code') && !text.includes('Drop Chat'));

    return dedupeConsecutive(blocks).map((text, index) => ({
      role: index % 2 === 0 ? 'user' : 'ai',
      text,
    }));
  }

  function pairMessages(messages: RawChatMessage[]): BridgeMemoryExchange[] {
    const pairs: BridgeMemoryExchange[] = [];
    let pendingUser = '';
    let pendingAi: string[] = [];

    for (const message of messages) {
      if (message.role === 'user') {
        if (pendingUser && pendingAi.length > 0) {
          pairs.push({ user: pendingUser, ai: pendingAi.join('\n\n') });
        }
        pendingUser = message.text;
        pendingAi = [];
      } else if (pendingUser) {
        pendingAi.push(message.text);
      }
    }

    if (pendingUser && pendingAi.length > 0) {
      pairs.push({ user: pendingUser, ai: pendingAi.join('\n\n') });
    }

    if (pairs.length > 0) return pairs;

    const transcript = messages
      .map((message) => `${message.role === 'user' ? 'User' : 'AI'}: ${message.text}`)
      .join('\n\n')
      .trim();
    return transcript ? [{ user: 'Conversation capture', ai: transcript }] : [];
  }

  function inferRole(element: HTMLElement): 'user' | 'ai' | null {
    const marker = [
      element.getAttribute('data-message-author-role'),
      element.getAttribute('data-author'),
      element.getAttribute('data-testid'),
      element.getAttribute('aria-label'),
      element.className,
    ].join(' ').toLowerCase();

    if (/\b(user|human|you)\b/.test(marker)) return 'user';
    if (/\b(assistant|ai|bot|model|response|claude|chatgpt|gemini|grok)\b/.test(marker)) return 'ai';
    return null;
  }

  function extractVisibleText(element: HTMLElement): string {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(`#${wrapperId}, script, style, button, svg, nav, header, footer`).forEach((child) => child.remove());
    return clone.innerText.replace(/\s+/g, ' ').trim();
  }

  function detectPlatform(): string {
    const host = window.location.hostname.replace(/^www\./, '');
    if (host.includes('chatgpt.com')) return 'ChatGPT';
    if (host.includes('claude.ai')) return 'Claude';
    if (host.includes('openrouter.ai')) return 'OpenRouter';
    if (host.includes('grok.com')) return 'Grok';
    if (host.includes('gemini.google.com')) return 'Gemini';
    if (host.includes('lovable.dev')) return 'Lovable';
    return host;
  }

  function uniqueElements(elements: HTMLElement[]): HTMLElement[] {
    return Array.from(new Set(elements)).filter((element) => element.offsetParent !== null);
  }

  function dedupeConsecutive(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
      if (value !== result[result.length - 1]) result.push(value);
    }
    return result;
  }

  function toggleMenu(): void {
    const menu = document.getElementById(menuId) as HTMLElement | null;
    if (!menu) return;
    menu.hidden = !menu.hidden;
  }

  function closeMenu(): void {
    const menu = document.getElementById(menuId) as HTMLElement | null;
    if (menu) menu.hidden = true;
  }

  function showToast(message: string, isError = false): void {
    const toast = document.querySelector<HTMLElement>('.genie-toast');
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.state = isError ? 'error' : 'ok';
    toast.classList.add('visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function runLampAnimation(lamp: HTMLElement | null): Promise<void> {
    if (!lamp) return Promise.resolve();
    lamp.classList.add('is-casting');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        lamp.classList.remove('is-casting');
        resolve();
      }, 780);
    });
  }

  async function injectIntoEditorOrClipboard(editor: Element | null, text: string): Promise<boolean> {
    if (editor && await tryProgrammaticInsert(editor, text)) {
      return true;
    }

    await navigator.clipboard.writeText(text);
    showToast('Capsule copied to clipboard. Please press Ctrl+V to paste.', true);
    return false;
  }

  async function tryProgrammaticInsert(editor: Element, text: string): Promise<boolean> {
    const target = editor as HTMLElement;
    target.focus();

    try {
      if (document.execCommand('insertText', false, text)) {
        dispatchEditorEvents(target, text);
        return true;
      }
    } catch {
      // Continue through the React-compatible fallbacks below.
    }

    if (isTextAreaLike(editor)) {
      if (setTextAreaValue(editor, text)) {
        dispatchEditorEvents(editor, text);
        return true;
      }
    }

    if (target.isContentEditable || target.getAttribute('role') === 'textbox') {
      if (insertIntoContentEditable(target, text)) {
        dispatchEditorEvents(target, text);
        return true;
      }
    }

    try {
      utils.insertTextIntoEditor(editor, text);
      dispatchEditorEvents(target, text);
      return true;
    } catch {
      return false;
    }
  }

  function setTextAreaValue(editor: HTMLTextAreaElement | HTMLInputElement, text: string): boolean {
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? editor.value.length;
    const nextValue = `${editor.value.slice(0, start)}${text}${editor.value.slice(end)}`;
    const prototype = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(editor, nextValue);
    if (editor.value !== nextValue) editor.value = nextValue;
    editor.selectionStart = start + text.length;
    editor.selectionEnd = start + text.length;
    return editor.value === nextValue;
  }

  function insertIntoContentEditable(editor: HTMLElement, text: string): boolean {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && selection.anchorNode && editor.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    editor.textContent = `${editor.textContent || ''}${text}`;
    return true;
  }

  function dispatchEditorEvents(editor: Element, text: string): void {
    editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: text.slice(-1) || ' ' }));
  }

  function isTextAreaLike(editor: Element): editor is HTMLTextAreaElement | HTMLInputElement {
    const tag = editor.tagName.toLowerCase();
    return tag === 'textarea' || tag === 'input';
  }

  function handleDragStart(event: MouseEvent): void {
    stopNativeEvent(event);
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.genie-lamp-button') || target.closest('.genie-inject-menu')) return;

    const wrapper = document.getElementById(wrapperId) as HTMLDivElement | null;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
      wrapper,
    };
    closeMenu();
    event.preventDefault();
    document.addEventListener('mousemove', handleDragMove, true);
    document.addEventListener('mouseup', handleDragEnd, true);
  }

  function handleDragMove(event: MouseEvent): void {
    if (!dragState) return;
    stopNativeEvent(event);
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (distance > 3) dragState.moved = true;

    const next = clampLampPosition(
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY,
      dragState.wrapper,
    );
    setLampPosition(dragState.wrapper, next);
    event.preventDefault();
  }

  function handleDragEnd(event: MouseEvent): void {
    if (!dragState) return;
    stopNativeEvent(event);
    const { wrapper, moved } = dragState;
    dragState = null;
    document.removeEventListener('mousemove', handleDragMove, true);
    document.removeEventListener('mouseup', handleDragEnd, true);

    const rect = wrapper.getBoundingClientRect();
    const next = clampLampPosition(rect.left, rect.top, wrapper);
    setLampPosition(wrapper, next);
    void chrome.storage.local.set({ [lampPositionKey]: next });
    suppressNextToggleClick = moved;
  }

  async function applyStoredLampPosition(wrapper: HTMLDivElement): Promise<void> {
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get([lampPositionKey], (value: Record<string, unknown>) => resolve(value));
    });
    const stored = result[lampPositionKey] as { top?: unknown; left?: unknown } | undefined;
    const left = Number(stored?.left);
    const top = Number(stored?.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      setLampPosition(wrapper, clampLampPosition(left, top, wrapper));
    }
  }

  function setLampPosition(wrapper: HTMLElement, position: { top: number; left: number }): void {
    wrapper.style.left = `${Math.round(position.left)}px`;
    wrapper.style.top = `${Math.round(position.top)}px`;
    wrapper.style.right = 'auto';
    wrapper.style.bottom = 'auto';
  }

  function clampLampPosition(left: number, top: number, wrapper: HTMLElement): { top: number; left: number } {
    const width = wrapper.offsetWidth || 60;
    const height = wrapper.offsetHeight || 60;
    const padding = 8;
    return {
      left: Math.max(padding, Math.min(window.innerWidth - width - padding, Math.round(left))),
      top: Math.max(padding, Math.min(window.innerHeight - height - padding, Math.round(top))),
    };
  }

  function ensureStyles(): void {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #${wrapperId},
      #${wrapperId} * {
        box-sizing: border-box;
      }

      #${wrapperId} {
        pointer-events: auto;
      }

      #${wrapperId} button {
        border: 0;
        cursor: pointer;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #${wrapperId} .genie-lamp-cluster {
        height: 60px;
        position: relative;
        width: 60px;
      }

      #${wrapperId} .genie-lamp-button {
        align-items: center;
        background: transparent;
        border-radius: 12px;
        display: flex;
        height: 60px;
        justify-content: center;
        overflow: visible;
        padding: 0;
        position: relative;
        width: 60px;
      }

      #${wrapperId} .genie-lamp-img {
        object-fit: contain;
        position: relative;
        transition: filter 160ms ease, transform 160ms ease;
        z-index: 2;
      }

      #${wrapperId} .genie-lamp-button:hover .genie-lamp-img {
        filter: drop-shadow(0 0 12px rgba(190, 97, 255, 0.82)) !important;
        transform: translateY(-1px) scale(1.04);
      }

      #${wrapperId} .genie-lamp-smoke,
      #${wrapperId} .genie-lamp-button::before,
      #${wrapperId} .genie-lamp-button::after {
        background: radial-gradient(circle, rgba(214, 148, 255, 0.78), rgba(130, 55, 230, 0.22) 68%, transparent 72%);
        border-radius: 999px;
        content: "";
        height: 22px;
        left: 25px;
        opacity: 0;
        pointer-events: none;
        position: absolute;
        top: 1px;
        transform: translate3d(0, 8px, 0) scale(0.55);
        width: 12px;
        z-index: 1;
      }

      #${wrapperId} .genie-lamp-button.is-casting .genie-lamp-img {
        animation: genie-lamp-glow 780ms ease-out;
      }

      #${wrapperId} .genie-lamp-button.is-casting .genie-lamp-smoke {
        animation: genie-smoke-rise 760ms ease-out;
      }

      #${wrapperId} .genie-lamp-button.is-casting::before {
        animation: genie-smoke-rise 760ms 80ms ease-out;
        left: 29px;
      }

      #${wrapperId} .genie-lamp-button.is-casting::after {
        animation: genie-smoke-rise 760ms 150ms ease-out;
        left: 22px;
      }

      #${wrapperId} .genie-inject-menu {
        background: #1e1e2e;
        border: 1px solid #a855f7;
        border-radius: 8px;
        bottom: 70px;
        box-shadow: 0 16px 42px rgba(31, 16, 68, 0.52);
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        position: absolute;
        right: 0;
        width: 158px;
      }

      #${wrapperId} .genie-inject-menu[hidden] {
        display: none;
      }

      #${wrapperId} .genie-inject-menu button {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        padding: 9px 10px;
        text-align: left;
        white-space: nowrap;
      }

      #${wrapperId} .genie-inject-menu button:hover {
        background: rgba(142, 88, 255, 0.24);
      }

      #${wrapperId} .genie-toast {
        background: rgba(14, 10, 24, 0.94);
        border: 1px solid rgba(184, 139, 255, 0.35);
        border-radius: 8px;
        bottom: 60px;
        box-shadow: 0 12px 34px rgba(44, 23, 90, 0.42);
        color: #fff;
        font: 700 11px Inter, system-ui, sans-serif;
        max-width: 260px;
        opacity: 0;
        padding: 8px 10px;
        pointer-events: none;
        position: absolute;
        right: 0;
        transform: translateY(4px);
        transition: opacity 160ms ease, transform 160ms ease;
        white-space: nowrap;
      }

      #${wrapperId} .genie-toast.visible {
        opacity: 1;
        transform: translateY(0);
      }

      #${wrapperId} .genie-toast[data-state="error"] {
        border-color: rgba(255, 108, 142, 0.62);
      }

      @keyframes genie-lamp-glow {
        0% { filter: drop-shadow(0px 0px 8px rgba(168, 85, 247, 0.6)); transform: translateZ(0) scale(1); }
        35% { filter: drop-shadow(0 0 18px rgba(196, 128, 255, 0.94)); transform: translateZ(0) scale(1.12) rotate(-2deg); }
        70% { filter: drop-shadow(0 0 22px rgba(220, 160, 255, 0.92)); transform: translateZ(0) scale(1.06) rotate(2deg); }
        100% { filter: drop-shadow(0px 0px 8px rgba(168, 85, 247, 0.6)); transform: translateZ(0) scale(1); }
      }

      @keyframes genie-smoke-rise {
        0% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.5) rotate(0deg); }
        28% { opacity: 0.88; transform: translate3d(-4px, -7px, 0) scale(1.05) rotate(18deg); }
        100% { opacity: 0; transform: translate3d(7px, -38px, 0) scale(1.9) rotate(48deg); }
      }
    `;
    document.documentElement.appendChild(style);
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('focus', mount);
  window.addEventListener('resize', handleViewportResize);
  mount();

  function handleViewportResize(): void {
    mount();
    const wrapper = document.getElementById(wrapperId) as HTMLDivElement | null;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const next = clampLampPosition(rect.left, rect.top, wrapper);
    setLampPosition(wrapper, next);
    void chrome.storage.local.set({ [lampPositionKey]: next });
  }
})();
