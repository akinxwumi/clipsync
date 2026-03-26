// popup.js

// SVG Icons as constants
const ICONS = {
    copy: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`,
    sync: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="17 1 21 5 17 9"></polyline>
        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
        <polyline points="7 23 3 19 7 15"></polyline>
        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
    </svg>`,
    delete: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>`,
    more: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="1"></circle>
        <circle cx="12" cy="5" r="1"></circle>
        <circle cx="12" cy="19" r="1"></circle>
    </svg>`,
    sun: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>`,
    moon: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>`
};

const views = {
    setup: document.getElementById('view-setup'),
    dashboard: document.getElementById('view-dashboard')
};

const els = {
    btnCreate: document.getElementById('btn-create'),
    btnJoin: document.getElementById('btn-join'),
    inputCode: document.getElementById('input-code'),
    errorMsg: document.getElementById('setup-error'),

    displayCode: document.getElementById('display-code'),
    codeText: document.querySelector('#display-code .code-text'),
    statusBadge: document.getElementById('status-badge'),
    statusLabel: document.querySelector('#status-badge .status-label'),

    // Clipboard elements
    currentClipboard: document.getElementById('current-clipboard'),
    clipboardBanner: document.getElementById('clipboard-banner'),

    // Unified history
    historyList: document.getElementById('history-list'),

    btnReset: document.getElementById('btn-reset'),

    // Header menu elements
    headerMenuWrapper: document.querySelector('.header-menu-wrapper'),
    btnHeaderMenu: document.querySelector('.btn-header-menu'),
    headerDropdown: document.querySelector('.header-dropdown'),

    // Sync code modal elements
    syncCodeModal: document.getElementById('sync-code-modal'),
    btnCloseCodeModal: document.getElementById('btn-close-code-modal'),

    // Theme elements
    btnThemeSetup: document.getElementById('btn-theme-setup'),
    btnThemeLight: document.getElementById('btn-theme-light'),
    btnThemeDark: document.getElementById('btn-theme-dark')
};

let syncCode = null;
let currentClipboardText = '';
let bannerTimeout = null;
let activeDropdown = null;
let headerDropdownOpen = false;

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    // Close item dropdowns
    if (activeDropdown && !e.target.closest('.item-menu-wrapper')) {
        activeDropdown.classList.remove('open');
        activeDropdown = null;
    }

    // Close header dropdown
    if (headerDropdownOpen && !e.target.closest('.header-menu-wrapper')) {
        els.headerDropdown?.classList.remove('open');
        headerDropdownOpen = false;
    }
});

// Init
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    const data = await chrome.storage.local.get(['syncCode', 'history', 'currentClipboard']);

    if (data.syncCode) {
        showDashboard(data.syncCode);
        renderHistory(data.history || []);
        if (data.currentClipboard?.text) {
            currentClipboardText = data.currentClipboard.text;
            displayCurrentClipboard(data.currentClipboard.text);
        }
        // Focus window and read clipboard after a short delay
        window.focus();
        setTimeout(async () => {
            await refreshClipboard();
        }, 100);
    } else {
        showSetup();
    }

    // Clear badge
    chrome.action.setBadgeText({ text: '' });

    // Setup header menu
    setupHeaderMenu();
});

// Setup header menu functionality
function setupHeaderMenu() {
    els.btnHeaderMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
        headerDropdownOpen = !headerDropdownOpen;
        els.headerDropdown?.classList.toggle('open', headerDropdownOpen);
    });

    // Show sync code action
    document.querySelector('.action-show-code')?.addEventListener('click', (e) => {
        e.stopPropagation();
        els.headerDropdown?.classList.remove('open');
        headerDropdownOpen = false;
        showSyncCodeModal();
    });

    // Reset action
    els.btnReset?.addEventListener('click', async (e) => {
        e.stopPropagation();
        els.headerDropdown?.classList.remove('open');
        headerDropdownOpen = false;

        if (confirm("Reset ClipSync? This will clear your sync code and all history. You'll need to generate or enter a new code.")) {
            await chrome.storage.local.remove(['syncCode', 'history', 'currentClipboard']);
            syncCode = null;
            showSetup();
            chrome.runtime.reload();
        }
    });

    // Close modal
    els.btnCloseCodeModal?.addEventListener('click', () => {
        hideSyncCodeModal();
    });

    // Close modal on backdrop click
    els.syncCodeModal?.addEventListener('click', (e) => {
        if (e.target === els.syncCodeModal) {
            hideSyncCodeModal();
        }
    });
}

function showSyncCodeModal() {
    els.syncCodeModal?.classList.remove('hidden');
}

function hideSyncCodeModal() {
    els.syncCodeModal?.classList.add('hidden');
}

// Setup Events
els.btnCreate.addEventListener('click', async () => {
    try {
        const res = await chrome.runtime.sendMessage({ cmd: 'generate_code' });
        if (res.code) {
            await connect(res.code);
        }
    } catch (err) {
        showError(err.message);
    }
});

els.btnJoin.addEventListener('click', async () => {
    const code = els.inputCode.value.trim();
    if (!code) {
        showError("Please enter a code");
        return;
    }
    if (code.split('-').length < 3) {
        showError("Invalid code format");
        return;
    }
    await connect(code);
});

els.displayCode?.addEventListener('click', () => {
    navigator.clipboard.writeText(syncCode);
    const originalText = els.codeText.textContent;
    els.codeText.textContent = '✓ Copied!';
    els.codeText.style.color = 'var(--success)';
    setTimeout(() => {
        els.codeText.textContent = originalText;
        els.codeText.style.color = '';
    }, 1500);
});

// Read current clipboard and update UI
async function refreshClipboard(retries = 2) {
    try {
        window.focus();
        const text = await navigator.clipboard.readText();
        currentClipboardText = text;

        if (text && text.trim()) {
            displayCurrentClipboard(text);
            await setCurrentClipboardState(text, 'local');
        } else {
            els.currentClipboard.innerHTML = `
                <div class="clipboard-preview">
                    <span class="placeholder">Clipboard is empty</span>
                </div>
            `;
        }
    } catch (err) {
        console.error('Clipboard read error:', err);

        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 150));
            return refreshClipboard(retries - 1);
        }

        // Show last known clipboard from history if available
        const data = await chrome.storage.local.get(['history', 'currentClipboard']);
        const history = data.history || [];
        const current = data.currentClipboard || null;

        if (current?.text) {
            displayCurrentClipboard(current.text);
            currentClipboardText = current.text;
        } else if (history.length > 0) {
            displayCurrentClipboard(history[0].text);
            currentClipboardText = history[0].text;
        } else {
            els.currentClipboard.innerHTML = `
                <div class="clipboard-preview">
                    <span class="placeholder">Click refresh to read clipboard</span>
                </div>
            `;
        }
    }
}

function displayCurrentClipboard(text) {
    els.currentClipboard.innerHTML = `
        <div class="clipboard-preview">
            <div class="clipboard-text">${escapeHtmlFull(text)}</div>
        </div>
        <div class="clipboard-actions-embedded">
            <button id="btn-copy-current" class="btn-action-embedded" title="Copy clipboard">
                ${ICONS.copy}
            </button>
            <button id="btn-sync-current" class="btn-action-embedded" title="Sync clipboard">
                ${ICONS.sync}
            </button>
        </div>
    `;

    const btnCopy = document.getElementById('btn-copy-current');
    const btnSync = document.getElementById('btn-sync-current');
    btnCopy?.addEventListener('click', async () => {
        if (!currentClipboardText?.trim()) return;
        try {
            await navigator.clipboard.writeText(currentClipboardText);
            showClipboardBanner('Copied to clipboard', 'success');
        } catch (err) {
            showClipboardBanner('Copy failed', 'error');
        }
    });

    btnSync?.addEventListener('click', async () => {
        await performSync(currentClipboardText, btnSync);
    });
}

// ========== UNIFIED HISTORY ==========

function renderHistory(items) {
    if (!els.historyList) return;

    els.historyList.innerHTML = '';

    if (items.length === 0) {
        els.historyList.innerHTML = '<div class="empty-state">No history yet.</div>';
        return;
    }

    // Sort by timestamp descending
    items.sort((a, b) => b.timestamp - a.timestamp);

    items.forEach(item => {
        addHistoryItemToDOM(item);
    });
}

function addHistoryItemToDOM(item) {
    const div = document.createElement('div');
    div.className = `history-item ${item.source === 'synced' ? 'synced' : 'local'}`;
    div.dataset.id = item.id;

    const date = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const titleText = item.text.length > 40 ? item.text.substring(0, 40) + '...' : item.text;

    div.innerHTML = `
        <div class="item-menu-wrapper">
            <button class="btn-menu" title="More options">
                ${ICONS.more}
            </button>
            <div class="dropdown-menu">
                <button class="dropdown-item action-copy">
                    ${ICONS.copy}
                    <span>Copy</span>
                </button>
                <button class="dropdown-item action-sync">
                    ${ICONS.sync}
                    <span>Sync</span>
                </button>
                <button class="dropdown-item action-delete delete">
                    ${ICONS.delete}
                    <span>Delete</span>
                </button>
            </div>
        </div>
        <div class="history-content" title="${escapeHtml(item.text)}">${escapeHtml(titleText)}</div>
        <div class="history-meta">
            <span class="timestamp">${date}</span>
        </div>
    `;

    // Menu toggle
    const btnMenu = div.querySelector('.btn-menu');
    const dropdown = div.querySelector('.dropdown-menu');

    btnMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeDropdown && activeDropdown !== dropdown) {
            activeDropdown.classList.remove('open');
        }
        dropdown.classList.toggle('open');
        activeDropdown = dropdown.classList.contains('open') ? dropdown : null;
    });

    // Copy action
    div.querySelector('.action-copy').addEventListener('click', async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(item.text);
        dropdown.classList.remove('open');
        activeDropdown = null;

        // Update current clipboard; previous current is moved to history in background state logic
        currentClipboardText = item.text;
        displayCurrentClipboard(item.text);
        await setCurrentClipboardState(item.text, 'local', item.id);
        await syncFromStorage();
    });

    // Sync action
    div.querySelector('.action-sync').addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        activeDropdown = null;
        await performSync(item.text, e.target.closest('.dropdown-item'));
    });

    // Delete action
    div.querySelector('.action-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        activeDropdown = null;
        await deleteHistoryItem(item.id);
    });

    els.historyList.appendChild(div);
}

async function deleteHistoryItem(itemId) {
    const data = await chrome.storage.local.get(['history']);
    let history = data.history || [];
    history = history.filter(h => h.id !== itemId);
    await chrome.storage.local.set({ history });

    // Remove from DOM with animation
    const itemEl = els.historyList.querySelector(`[data-id="${itemId}"]`);
    if (itemEl) {
        itemEl.style.animation = 'slideOut 0.2s ease forwards';
        setTimeout(() => {
            itemEl.remove();
            if (els.historyList.children.length === 0) {
                els.historyList.innerHTML = '<div class="empty-state">No history yet.</div>';
            }
        }, 200);
    }
}

// ========== SYNC FUNCTIONALITY ==========

async function performSync(text, btnElement) {
    if (!text || !text.trim()) {
        showClipboardBanner('Nothing to send', 'info');
        return;
    }

    btnElement.disabled = true;

    try {
        const res = await chrome.runtime.sendMessage({ cmd: 'sync_text', text });
        if (res.success) {
            showClipboardBanner('Sent', 'success');
        } else {
            showError("Failed: " + (res.error || "Unknown"));
            showClipboardBanner('Sync failed', 'error');
        }
    } catch (err) {
        showError("Error: " + err.message);
        showClipboardBanner('Sync failed', 'error');
    } finally {
        setTimeout(() => {
            btnElement.disabled = false;
        }, 450);
    }
}

// Functions
async function connect(code) {
    els.btnCreate.disabled = true;
    els.btnJoin.disabled = true;
    els.btnJoin.textContent = "Connecting...";

    try {
        const res = await chrome.runtime.sendMessage({ cmd: 'connect', code });
        if (res.success) {
            await chrome.storage.local.set({ syncCode: code });
            showDashboard(code);
            await refreshClipboard();
            await syncFromStorage();
        } else {
            showError(res.error || "Connection failed");
        }
    } catch (err) {
        showError("Connection timeout or error");
    } finally {
        els.btnCreate.disabled = false;
        els.btnJoin.disabled = false;
        els.btnJoin.textContent = "Connect";
    }
}

function showSetup() {
    views.setup.classList.remove('hidden');
    views.dashboard.classList.add('hidden');
}

function showDashboard(code) {
    syncCode = code;
    views.setup.classList.add('hidden');
    views.dashboard.classList.remove('hidden');
    els.codeText.textContent = code;

    checkStatus();
    setInterval(checkStatus, 5000);
}

function showError(msg) {
    els.errorMsg.textContent = msg;
    els.errorMsg.classList.remove('hidden');
    setTimeout(() => els.errorMsg.textContent = '', 4000);
}

async function checkStatus() {
    const res = await chrome.runtime.sendMessage({ cmd: 'get_status' });
    updateStatus(res.connected);
}

function updateStatus(connected) {
    const badge = els.statusBadge;
    if (connected) {
        badge.className = 'connection-status connected';
        els.statusLabel.textContent = 'Connected';
    } else {
        badge.className = 'connection-status';
        els.statusLabel.textContent = 'Connecting...';
    }
}

// Receive Messages from background
chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.cmd === 'incoming_text') {
        if (msg.msg?.text) {
            currentClipboardText = msg.msg.text;
            displayCurrentClipboard(msg.msg.text);
            showClipboardBanner('New broadcast received', 'info');
        }
        await syncFromStorage();
    }

    if (msg.cmd === 'clipboard_state_updated') {
        await syncFromStorage();
    }
});

async function setCurrentClipboardState(text, source = 'local', id = null) {
    if (!text || !text.trim()) return;
    await chrome.runtime.sendMessage({ cmd: 'set_current_clipboard', text, source, id });
}

async function syncFromStorage() {
    const data = await chrome.storage.local.get(['history', 'currentClipboard']);
    renderHistory(data.history || []);
    if (data.currentClipboard?.text) {
        currentClipboardText = data.currentClipboard.text;
        displayCurrentClipboard(data.currentClipboard.text);
    }
}

function showClipboardBanner(message, type = 'info') {
    if (!els.clipboardBanner) return;
    els.clipboardBanner.textContent = message;
    els.clipboardBanner.className = `clipboard-banner show ${type}`;

    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => {
        if (!els.clipboardBanner) return;
        els.clipboardBanner.className = 'clipboard-banner';
        els.clipboardBanner.textContent = '';
    }, 2200);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.substring(0, 200).replace(/[&<>"']/g, function (m) { return map[m]; }) + (text.length > 200 ? '...' : '');
}

function escapeHtmlFull(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
}

// ========== THEME ==========

async function initTheme() {
    const data = await chrome.storage.local.get(['theme']);
    const theme = data.theme || 'light'; // Default to light
    applyTheme(theme);
    setupThemeListeners();
}

function applyTheme(theme) {
    const isDark = theme === 'dark';
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    // Update Setup Theme Icon
    if (els.btnThemeSetup) {
        els.btnThemeSetup.innerHTML = isDark ? ICONS.sun : ICONS.moon;
    }

    // Toggle Menu Buttons
    if (els.btnThemeLight && els.btnThemeDark) {
        els.btnThemeLight.classList.toggle('hidden', !isDark);
        els.btnThemeDark.classList.toggle('hidden', isDark);
    }
}

async function toggleTheme() {
    const isDark = document.documentElement.hasAttribute('data-theme');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    await chrome.storage.local.set({ theme: newTheme });
}

function setupThemeListeners() {
    els.btnThemeSetup?.addEventListener('click', toggleTheme);
    els.btnThemeLight?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTheme();
    });
    els.btnThemeDark?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTheme();
    });
}
