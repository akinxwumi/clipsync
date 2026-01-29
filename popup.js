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

const MAX_HISTORY = 20;

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
    btnRefreshClip: document.getElementById('btn-refresh-clip'),

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
    const data = await chrome.storage.local.get(['syncCode', 'history']);

    if (data.syncCode) {
        showDashboard(data.syncCode);
        renderHistory(data.history || []);
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
            await chrome.storage.local.remove(['syncCode', 'history']);
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

// Clipboard Events
els.btnRefreshClip?.addEventListener('click', async () => {
    await refreshClipboard();
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
            // Add to history if it's new (source: local)
            await addToHistory(text, 'local');
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
        const data = await chrome.storage.local.get(['history']);
        const history = data.history || [];

        if (history.length > 0) {
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
            <div class="clipboard-actions">
                <button class="btn-sync-now" id="btn-sync-current">
                    ${ICONS.sync}
                    <span>Sync</span>
                </button>
            </div>
        </div>
    `;

    const btnSync = document.getElementById('btn-sync-current');
    btnSync?.addEventListener('click', async () => {
        await performSync(currentClipboardText, btnSync);
    });
}

// ========== UNIFIED HISTORY ==========

/**
 * Add item to history
 * @param {string} text - The text content
 * @param {string} source - 'local' (copied) or 'synced' (received from another device)
 * @returns {boolean} - Whether item was added (false if duplicate)
 */
async function addToHistory(text, source = 'local') {
    const data = await chrome.storage.local.get(['history']);
    let history = data.history || [];

    // Check for duplicates (same text content)
    const existingIndex = history.findIndex(h => h.text === text);
    if (existingIndex !== -1) {
        // If it exists, just move it to the top and update timestamp
        const existing = history.splice(existingIndex, 1)[0];
        existing.timestamp = Date.now();
        // Keep original source - don't change synced to local
        history.unshift(existing);
        await chrome.storage.local.set({ history });
        renderHistory(history);
        return false;
    }

    const newItem = {
        text: text,
        timestamp: Date.now(),
        id: crypto.randomUUID(),
        source: source // 'local' or 'synced'
    };

    history.unshift(newItem);

    // Auto-purge: keep only MAX_HISTORY items
    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }

    await chrome.storage.local.set({ history });
    renderHistory(history);
    return true;
}

function renderHistory(items) {
    if (!els.historyList) return;

    els.historyList.innerHTML = '';

    if (items.length === 0) {
        els.historyList.innerHTML = '<div class="empty-state">No history yet.</div>';
        return;
    }

    // Sort by timestamp descending
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Filter out current clipboard to avoid showing it twice
    const filteredItems = items.filter(item => item.text !== currentClipboardText);

    if (filteredItems.length === 0) {
        els.historyList.innerHTML = '<div class="empty-state">No history yet.</div>';
        return;
    }

    filteredItems.forEach(item => {
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
        // Don't add to history again - it's already there, just refresh display
        await refreshClipboard();
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
    const originalLabel = btnElement.innerHTML;
    btnElement.innerHTML = '<span>Sending...</span>';
    btnElement.disabled = true;

    try {
        const res = await chrome.runtime.sendMessage({ cmd: 'sync_text', text });
        if (res.success) {
            btnElement.innerHTML = '<span>✓ Sent!</span>';
        } else {
            showError("Failed: " + (res.error || "Unknown"));
            btnElement.innerHTML = originalLabel;
        }
    } catch (err) {
        showError("Error: " + err.message);
        btnElement.innerHTML = originalLabel;
    } finally {
        setTimeout(() => {
            btnElement.innerHTML = originalLabel;
            btnElement.disabled = false;
        }, 2000);
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
        // Add to history with source: synced
        await addToHistory(msg.msg.text, 'synced');
    }
});

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
