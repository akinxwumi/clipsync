import { generateSyncCode } from './utils.js';

// Managing the Offscreen Document
const OFFSCREEN_PATH = 'offscreen.html';
const REASON_WEBRTC = 'WEB_RTC'; // Chrome 116+
const MAX_HISTORY = 20;

async function ensureOffscreen() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        return false;
    }

    await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: [REASON_WEBRTC],
        justification: 'Maintaining P2P WebRTC connections for clipboard sync'
    });
    return true;
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("ClipSync Installed");
    // Only init state if missing to avoid wiping it on updates
    chrome.storage.local.get(['history', 'currentClipboard'], (res) => {
        const update = {};
        if (!res.history) update.history = [];
        if (typeof res.currentClipboard === 'undefined') update.currentClipboard = null;
        if (Object.keys(update).length > 0) chrome.storage.local.set(update);
    });
    // Init offscreen
    setupOffscreen();
});

chrome.runtime.onStartup.addListener(() => {
    setupOffscreen();
});

async function setupOffscreen() {
    await ensureOffscreen();

    // Always re-issue connect on startup/install if we have a saved code.
    // Offscreen docs can survive or be recreated independently of worker lifecycle.
    const res = await chrome.storage.local.get(['syncCode']);
    if (res.syncCode) {
        setTimeout(() => {
            chrome.runtime.sendMessage({
                target: 'offscreen',
                cmd: 'connect',
                data: { code: res.syncCode }
            });
        }, 500);
    }
}

// Proxy messages to Offscreen
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle local logic
    if (request.cmd === 'generate_code') {
        const code = generateSyncCode();
        sendResponse({ code });
        return false;
    }

    if (request.cmd === 'incoming_text') {
        handleIncomingText(request.msg).catch((err) => console.error('Incoming text handling failed:', err));
        return false;
    }

    if (request.cmd === 'set_current_clipboard') {
        updateClipboardState({
            text: request.text,
            source: request.source || 'local',
            id: request.id || crypto.randomUUID(),
            timestamp: Date.now()
        }).then((state) => {
            chrome.runtime.sendMessage({ cmd: 'clipboard_state_updated', state });
            sendResponse({ success: true, state });
        }).catch((err) => {
            sendResponse({ success: false, error: err.toString() });
        });
        return true;
    }

    // Forward P2P commands to Offscreen
    if (['connect', 'sync_text', 'get_status'].includes(request.cmd)) {
        ensureOffscreen().then(() => {
            chrome.runtime.sendMessage({
                target: 'offscreen',
                cmd: request.cmd,
                data: request // pass full request object or properties
            }, (response) => {
                // Forward response back to sender (Popup)
                // Note: runtime.sendMessage error handling
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse(response);
                }
            });
        });
        return true; // Async wait for offscreen response
    }
});

async function handleIncomingText(msg) {
    await ensureOffscreen();
    await writeClipboardViaOffscreen(msg.text || '');

    const state = await updateClipboardState({
        text: msg.text,
        source: 'synced',
        id: msg.id || crypto.randomUUID(),
        timestamp: msg.timestamp || Date.now()
    });

    chrome.action.setBadgeText({ text: 'NEW' });
    chrome.action.setBadgeBackgroundColor({ color: '#00C853' });

    // Notify all views (Popup)
    chrome.runtime.sendMessage({ cmd: 'incoming_text', msg: state.currentClipboard });
    chrome.runtime.sendMessage({ cmd: 'clipboard_state_updated', state });
}

async function writeClipboardViaOffscreen(text) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            target: 'offscreen',
            cmd: 'write_clipboard',
            data: { text }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('Offscreen clipboard write failed:', chrome.runtime.lastError.message);
                resolve(false);
                return;
            }
            resolve(!!response?.success);
        });
    });
}

async function updateClipboardState(nextItem) {
    if (!nextItem?.text || !nextItem.text.trim()) {
        return chrome.storage.local.get(['history', 'currentClipboard']);
    }

    const result = await chrome.storage.local.get(['history', 'currentClipboard']);
    let history = result.history || [];
    const current = result.currentClipboard || null;

    let currentClipboard = current;

    if (!current || current.text !== nextItem.text) {
        if (current?.text) {
            history = history.filter(h => h.id !== current.id && h.text !== current.text);
            history.unshift(current);
        }

        history = history.filter(h => h.id !== nextItem.id && h.text !== nextItem.text);
        currentClipboard = {
            id: nextItem.id || crypto.randomUUID(),
            text: nextItem.text,
            source: nextItem.source || 'local',
            timestamp: nextItem.timestamp || Date.now()
        };
    } else {
        currentClipboard = {
            ...current,
            source: nextItem.source || current.source || 'local',
            timestamp: nextItem.timestamp || Date.now()
        };
        history = history.filter(h => h.id !== currentClipboard.id && h.text !== currentClipboard.text);
    }

    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }

    await chrome.storage.local.set({ history, currentClipboard });
    return { history, currentClipboard };
}
