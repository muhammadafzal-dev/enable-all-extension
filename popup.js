// popup.js

let currentTabId = null;
let currentState = { enableButtons: false, enableDragdrop: false, enableModelOverride: false, modelOverrideTarget: 'gpt-5-3', count: 0 };

// Safe element refs — all IDs exist in popup.html
const el = {
  toggleButtons:       document.getElementById('toggle-buttons'),
  toggleDragdrop:      document.getElementById('toggle-dragdrop'),
  toggleModelOverride: document.getElementById('toggle-modeloverride'),
  selectModelOverride: document.getElementById('select-modeloverride'),
  statusButtons:       document.getElementById('status-buttons'),
  statusDragdrop:      document.getElementById('status-dragdrop'),
  statusModelOverride: document.getElementById('status-modeloverride'),
  cardButtons:         document.getElementById('card-buttons'),
  cardDragdrop:        document.getElementById('card-dragdrop'),
  cardModelOverride:   document.getElementById('card-modeloverride'),
  statsBar:            document.getElementById('stats'),
  statCount:           document.getElementById('stat-count'),
};

// Verify all elements found — bail with a console warning if any missing
const missing = Object.entries(el).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.warn('[EnableAll] Missing elements:', missing);
}

function updateUI() {
  const { enableButtons, enableDragdrop, enableModelOverride, count } = currentState;

  if (el.toggleButtons)       el.toggleButtons.checked       = enableButtons;
  if (el.toggleDragdrop)      el.toggleDragdrop.checked      = enableDragdrop;
  if (el.toggleModelOverride) el.toggleModelOverride.checked = enableModelOverride;
  if (el.selectModelOverride) el.selectModelOverride.value  = currentState.modelOverrideTarget;

  el.cardButtons?.classList.toggle('active', enableButtons);
  el.cardDragdrop?.classList.toggle('active', enableDragdrop);
  el.cardModelOverride?.classList.toggle('active', enableModelOverride);

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

  if (el.statusModelOverride) {
    el.statusModelOverride.textContent = enableModelOverride
      ? `Active — overriding model on requests`
      : 'Override model on all API requests';
  }

  const anyActive = enableButtons || enableDragdrop;
  if (el.statsBar)  el.statsBar.style.display  = anyActive ? 'flex' : 'none';
  if (el.statCount) el.statCount.textContent    = anyActive ? (count || 0) : 0;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  // Read directly from storage to avoid race condition with background messages
  const data = await chrome.storage.session.get('tabStates');
  const states = data.tabStates || {};
  const state  = states[currentTabId];
  if (state) {
    currentState.enableButtons       = state.enableButtons       || false;
    currentState.enableDragdrop      = state.enableDragdrop      || false;
    currentState.enableModelOverride = state.enableModelOverride || false;
    currentState.modelOverrideTarget = state.modelOverrideTarget || 'gpt-5-3';
    currentState.count               = state.count               || 0;
  }
  updateUI();
}

async function saveState(patch) {
  const data   = await chrome.storage.session.get('tabStates');
  const states = data.tabStates || {};
  if (!states[currentTabId]) {
    states[currentTabId] = { enableButtons: false, enableDragdrop: false, enableModelOverride: false, count: 0 };
  }
  Object.assign(states[currentTabId], patch);
  await chrome.storage.session.set({ tabStates: states });
}

el.toggleButtons?.addEventListener('change', async () => {
  if (currentTabId == null) return;
  const enabled = el.toggleButtons.checked;
  currentState.enableButtons = enabled;
  if (!enabled) currentState.count = 0;
  updateUI();
  await saveState({ enableButtons: enabled, count: currentState.count });
  chrome.runtime.sendMessage({ action: enabled ? 'enable' : 'disable', feature: 'buttons', tabId: currentTabId });
});

el.toggleDragdrop?.addEventListener('change', async () => {
  if (currentTabId == null) return;
  const enabled = el.toggleDragdrop.checked;
  currentState.enableDragdrop = enabled;
  updateUI();
  await saveState({ enableDragdrop: enabled });
  chrome.runtime.sendMessage({ action: enabled ? 'enable' : 'disable', feature: 'dragdrop', tabId: currentTabId });
});

el.toggleModelOverride?.addEventListener('change', async () => {
  if (currentTabId == null) return;
  const enabled = el.toggleModelOverride.checked;
  currentState.enableModelOverride = enabled;
  updateUI();
  await saveState({ enableModelOverride: enabled });
  chrome.runtime.sendMessage({
    action: enabled ? 'enable' : 'disable',
    feature: 'modeloverride',
    model: currentState.modelOverrideTarget,
    tabId: currentTabId,
  });
});

el.selectModelOverride?.addEventListener('change', async () => {
  if (currentTabId == null) return;
  const model = el.selectModelOverride.value;
  currentState.modelOverrideTarget = model;
  await saveState({ modelOverrideTarget: model });
  // If override is active, update the target model live
  if (currentState.enableModelOverride) {
    chrome.runtime.sendMessage({ action: 'setModel', feature: 'modeloverride', model, tabId: currentTabId });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'countUpdate' && message.tabId === currentTabId) {
    currentState.count = message.count || 0;
    updateUI();
  }
});

init();
