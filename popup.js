// popup.js

let currentTabId = null;
let currentState = { enableButtons: false, enableDragdrop: false, count: 0 };

// Safe element refs — all IDs exist in popup.html
const el = {
  toggleButtons: document.getElementById('toggle-buttons'),
  toggleDragdrop: document.getElementById('toggle-dragdrop'),
  statusButtons:  document.getElementById('status-buttons'),
  statusDragdrop: document.getElementById('status-dragdrop'),
  cardButtons:    document.getElementById('card-buttons'),
  cardDragdrop:   document.getElementById('card-dragdrop'),
  statsBar:       document.getElementById('stats'),
  statCount:      document.getElementById('stat-count'),
};

// Verify all elements found — bail with a console warning if any missing
const missing = Object.entries(el).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.warn('[EnableAll] Missing elements:', missing);
}

function updateUI() {
  const { enableButtons, enableDragdrop, count } = currentState;

  if (el.toggleButtons)  el.toggleButtons.checked  = enableButtons;
  if (el.toggleDragdrop) el.toggleDragdrop.checked  = enableDragdrop;

  el.cardButtons?.classList.toggle('active', enableButtons);
  el.cardDragdrop?.classList.toggle('active', enableDragdrop);

  if (el.statusButtons) {
    el.statusButtons.textContent = enableButtons
      ? (count > 0 ? `${count} element${count !== 1 ? 's' : ''} enabled` : 'Watching for disabled elements...')
      : 'Removes disabled, readonly & blocked states';
  }

  if (el.statusDragdrop) {
    el.statusDragdrop.textContent = enableDragdrop
      ? 'Drag & drop unblocked on this page'
      : 'Unblocks file drag & drop on any site';
  }

  const anyActive = enableButtons || enableDragdrop;
  if (el.statsBar)  el.statsBar.style.display  = anyActive ? 'flex' : 'none';
  if (el.statCount) el.statCount.textContent    = anyActive ? (count || 0) : 0;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  chrome.runtime.sendMessage({ action: 'getState', tabId: currentTabId }, (response) => {
    if (chrome.runtime.lastError) return; // popup closed before response
    if (response) {
      currentState.enableButtons  = response.enableButtons  || false;
      currentState.enableDragdrop = response.enableDragdrop || false;
      currentState.count          = response.count          || 0;
    }
    updateUI();
  });
}

el.toggleButtons?.addEventListener('change', () => {
  if (currentTabId == null) return;
  const enabled = el.toggleButtons.checked;
  currentState.enableButtons = enabled;
  if (!enabled) currentState.count = 0;
  updateUI();
  chrome.runtime.sendMessage({ action: enabled ? 'enable' : 'disable', feature: 'buttons', tabId: currentTabId });
});

el.toggleDragdrop?.addEventListener('change', () => {
  if (currentTabId == null) return;
  const enabled = el.toggleDragdrop.checked;
  currentState.enableDragdrop = enabled;
  updateUI();
  chrome.runtime.sendMessage({ action: enabled ? 'enable' : 'disable', feature: 'dragdrop', tabId: currentTabId });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'countUpdate' && message.tabId === currentTabId) {
    currentState.count = message.count || 0;
    updateUI();
  }
});

init();
