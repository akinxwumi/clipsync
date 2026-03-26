import * as sync from './sync.js';

// Bridge logic: Background <-> Offscreen <-> Sync/PeerJS

console.log("Offscreen document loaded");

// Forward incoming PeerJS messages to Background
sync.onReceive((msg) => {
    chrome.runtime.sendMessage({
        cmd: 'incoming_text',
        msg
    });
});

// Handle commands from Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target !== 'offscreen') return;

    const { cmd, data } = request;

    if (cmd === 'connect') {
        sync.connect(data.code)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.toString() }));
        return true; // Async
    }

    if (cmd === 'sync_text') {
        sync.broadcast(data.text)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.toString() }));
        return true;
    }

    if (cmd === 'get_status') {
        sendResponse({ connected: sync.isConnected() });
        return false;
    }
});

// Periodic keep-alive (optional, but helps if browser tries to kill offscreen)
setInterval(() => {
    // Just a heartbeat if needed
}, 30000);
