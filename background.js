// background.js — Service worker managing per-tab state and content script injection

const STORAGE_KEY = 'enabledTabs';

async function getEnabledTabs() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

async function setEnabledTabs(tabs) {
  await chrome.storage.session.set({ [STORAGE_KEY]: tabs });
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js']
    });
  } catch (err) {
    console.warn('Failed to inject content script:', err.message);
  }
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script may not be ready yet — ignore
  }
}

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    const { action, tabId, count } = message;

    if (action === 'enable') {
      const tabs = await getEnabledTabs();
      tabs[tabId] = { enabled: true, count: 0 };
      await setEnabledTabs(tabs);
      await injectContentScript(tabId);
      return { success: true };
    }

    if (action === 'disable') {
      const tabs = await getEnabledTabs();
      delete tabs[tabId];
      await setEnabledTabs(tabs);
      await sendToTab(tabId, { action: 'disconnect' });
      return { success: true };
    }

    if (action === 'getState') {
      const tabs = await getEnabledTabs();
      const state = tabs[tabId] || { enabled: false, count: 0 };
      return state;
    }

    if (action === 'countUpdate') {
      const senderTabId = sender.tab?.id;
      if (senderTabId == null) return;
      const tabs = await getEnabledTabs();
      if (tabs[senderTabId]) {
        tabs[senderTabId].count = count;
        await setEnabledTabs(tabs);
      }
      return { count };
    }
  };

  handler().then(sendResponse);
  return true; // keep message channel open for async response
});

// Re-inject content script when an enabled tab navigates to a new page
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const tabs = await getEnabledTabs();
  if (tabs[tabId]?.enabled) {
    tabs[tabId].count = 0;
    await setEnabledTabs(tabs);
    await injectContentScript(tabId);
  }
});

// Clean up state when a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabs = await getEnabledTabs();
  if (tabs[tabId]) {
    delete tabs[tabId];
    await setEnabledTabs(tabs);
  }
});
