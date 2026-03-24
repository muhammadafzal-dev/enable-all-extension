// background.js — Service worker managing per-tab state for both features

const STORAGE_KEY = 'tabStates';

async function getTabStates() {
  const data = await chrome.storage.session.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

async function setTabStates(states) {
  await chrome.storage.session.set({ [STORAGE_KEY]: states });
}

function defaultState() {
  return { enableButtons: false, enableDragdrop: false, count: 0 };
}

async function injectScript(tabId, file) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [file]
    });
  } catch (err) {
    console.warn(`Failed to inject ${file}:`, err.message);
  }
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script may not be ready
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    const { action, feature, tabId, count } = message;

    if (action === 'enable') {
      const states = await getTabStates();
      if (!states[tabId]) states[tabId] = defaultState();

      if (feature === 'buttons') {
        states[tabId].enableButtons = true;
        states[tabId].count = 0;
        await setTabStates(states);
        await injectScript(tabId, 'content.js');
      } else if (feature === 'dragdrop') {
        states[tabId].enableDragdrop = true;
        await setTabStates(states);
        await injectScript(tabId, 'content-dragdrop.js');
      }
      return { success: true };
    }

    if (action === 'disable') {
      const states = await getTabStates();
      if (!states[tabId]) return { success: true };

      if (feature === 'buttons') {
        states[tabId].enableButtons = false;
        states[tabId].count = 0;
        await setTabStates(states);
        await sendToTab(tabId, { action: 'disconnect', feature: 'buttons' });
      } else if (feature === 'dragdrop') {
        states[tabId].enableDragdrop = false;
        await setTabStates(states);
        await sendToTab(tabId, { action: 'disconnect', feature: 'dragdrop' });
      }

      // Clean up if both disabled
      if (!states[tabId].enableButtons && !states[tabId].enableDragdrop) {
        delete states[tabId];
        await setTabStates(states);
      }
      return { success: true };
    }

    if (action === 'getState') {
      const states = await getTabStates();
      return states[tabId] || defaultState();
    }

    if (action === 'countUpdate') {
      const senderTabId = sender.tab?.id;
      if (senderTabId == null) return;
      const states = await getTabStates();
      if (states[senderTabId]) {
        states[senderTabId].count = count;
        await setTabStates(states);
      }
      return { count };
    }
  };

  handler().then(sendResponse);
  return true;
});

// Re-inject on page navigation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const states = await getTabStates();
  const state = states[tabId];
  if (!state) return;

  if (state.enableButtons) {
    state.count = 0;
    await setTabStates(states);
    await injectScript(tabId, 'content.js');
  }
  if (state.enableDragdrop) {
    await injectScript(tabId, 'content-dragdrop.js');
  }
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const states = await getTabStates();
  if (states[tabId]) {
    delete states[tabId];
    await setTabStates(states);
  }
});
