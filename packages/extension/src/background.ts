chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener((message: { type?: string }, sender: any, sendResponse: (response: unknown) => void) => {
  if (message?.type !== 'OPEN_SIDEPANEL') return false;

  const openPanel = async (): Promise<{ ok: true }> => {
    const windowId = sender.tab?.windowId ?? (await chrome.windows.getCurrent()).id;
    if (!windowId) throw new Error('No Chrome window available for the GENIE side panel.');
    await chrome.sidePanel.open({ windowId });
    return { ok: true };
  };

  openPanel()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});
