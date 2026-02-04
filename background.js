import { generateSyncCode } from './utils.js';

// Managing the Offscreen Document
const OFFSCREEN_PATH = 'offscreen.html';
const REASON_WEBRTC = 'WEB_RTC'; // Chrome 116+

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
    // Only init history if missing to avoid wiping it on updates
    chrome.storage.local.get(['history'], (res) => {
        if (!res.history) chrome.storage.local.set({ history: [] });
    });
    // Init offscreen
    setupOffscreen();
});

chrome.runtime.onStartup.addListener(() => {
    setupOffscreen();
});

async function setupOffscreen() {
    const created = await ensureOffscreen();
    if (created) {
        // If we just created it, we need to reconnect if we have a code
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
        handleIncomingText(request.msg);
        return false;
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

function handleIncomingText(msg) {
    chrome.storage.local.get(['history'], (result) => {
        let history = result.history || [];

        // Avoid duplicates by ID or text content
        const existingIndex = history.findIndex(h => h.id === msg.id || h.text === msg.text);

        if (existingIndex !== -1) {
            // Update existing item and move to top
            const existing = history.splice(existingIndex, 1)[0];
            existing.timestamp = msg.timestamp || Date.now();
            history.unshift(existing);
        } else {
            // Add new item
            history.unshift(msg);
        }

        // Keep only last 20 items
        if (history.length > 20) {
            history = history.slice(0, 20);
        }

        chrome.storage.local.set({ history }, () => {
            chrome.action.setBadgeText({ text: 'NEW' });
            chrome.action.setBadgeBackgroundColor({ color: '#00C853' });

            // Notify all views (Popup)
            chrome.runtime.sendMessage({ cmd: 'incoming_text', msg });
        });
    });
}


