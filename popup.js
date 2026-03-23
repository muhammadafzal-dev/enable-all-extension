// popup.js — Toggle UI logic and messaging with background service worker

const toggleEl = document.getElementById('toggle');
const statusEl = document.getElementById('status');

let currentTabId = null;

function updateStatus(enabled, count) {
  if (enabled) {
    statusEl.textContent = count > 0
      ? `${count} element${count !== 1 ? 's' : ''} enabled`
      : 'Watching for disabled elements...';
    statusEl.classList.add('active');
  } else {
    statusEl.textContent = 'Inactive';
    statusEl.classList.remove('active');
  }
}

async function init() {
  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  // Fetch current state from background
  const state = await chrome.runtime.sendMessage({
    action: 'getState',
    tabId: currentTabId
  });

  toggleEl.checked = state.enabled;
  updateStatus(state.enabled, state.count);
}

toggleEl.addEventListener('change', async () => {
  if (currentTabId == null) return;

  const enabled = toggleEl.checked;

  await chrome.runtime.sendMessage({
    action: enabled ? 'enable' : 'disable',
    tabId: currentTabId
  });

  updateStatus(enabled, 0);
});

// Listen for count updates from background (relayed from content script)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'countUpdate' && toggleEl.checked) {
    updateStatus(true, message.count);
  }
});

init();
