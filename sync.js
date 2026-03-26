import { generateCryptoKeys, encrypt, decrypt } from './utils.js';

let peer = null;
let myPeerId = null;
let connections = []; // Array of active DataConnections
let pendingPeers = new Set();
let redialIntervalId = null;
let receiveCallback = null;
let currentKey = null; // CryptoKey
let currentGroupId = null;

const MAX_SLOTS = 10; // Try up to 10 device slots
const REDIAL_INTERVAL_MS = 12000;

export function onReceive(cb) {
    receiveCallback = cb;
}

export function isConnected() {
    return (
        !!peer &&
        !peer.disconnected &&
        !peer.destroyed &&
        connections.some(c => c.open)
    );
}

export async function connect(syncCode) {
    teardownPeer();

    const { groupId, encryptionKey } = await generateCryptoKeys(syncCode);
    currentGroupId = groupId;
    currentKey = encryptionKey;

    // Connection Strategy: "Slot Hopping"
    // Try to acquire an ID in the sequence: params-1, params-2, ... params-10
    let slot = 1;
    let acquired = false;

    console.log(`Attempting to connect with Group ID: ${groupId}`);

    if (typeof Peer === 'undefined') {
        throw new Error(`PeerJS library not loaded. Check connection. Global peer type: ${typeof Peer}`);
    }

    while (slot <= MAX_SLOTS && !acquired) {
        const potentialId = `${groupId}-${slot}`;
        console.log(`Trying slot: ${potentialId}`);

        try {
            await new Promise((resolve, reject) => {
                // Initialize Peer. 
                const p = new Peer(potentialId, {
                    debug: 1,
                    secure: true
                });

                const onOpen = (id) => {
                    console.log(`Acquired Peer ID: ${id}`);
                    peer = p;
                    myPeerId = id;
                    acquired = true;
                    cleanup();
                    resolve();
                };

                const onError = (err) => {
                    console.log(`Error on slot ${potentialId}: ${err.type}`);
                    if (err.type === 'unavailable-id') {
                        // ID taken, try next
                        p.destroy(); // Important to cleanup
                        cleanup();
                        resolve(); // Resolve without setting 'acquired'
                    } else {
                        // Other error
                        cleanup();
                        reject(err);
                    }
                };

                const cleanup = () => {
                    p.off('open', onOpen);
                    p.off('error', onError);
                };

                p.on('open', onOpen);
                p.on('error', onError);
            });
        } catch (e) {
            console.error("Peer init error:", e);
            // Determine if we should continue or stop
            if (e.type !== 'unavailable-id') break;
        }

        if (acquired) break;
        slot++;
    }

    if (!acquired || !peer) {
        throw new Error("Could not acquire a sync slot. Network full or error.");
    }

    setupPeerEvents(peer);

    // Connect to all other possible slots
    connectToPeers(groupId);
    startRedialLoop();
}

function connectToPeers(groupId) {
    for (let i = 1; i <= MAX_SLOTS; i++) {
        const targetId = `${groupId}-${i}`;
        if (targetId === myPeerId || !shouldDialPeer(targetId)) continue;

        console.log(`Connecting to peer: ${targetId}`);
        pendingPeers.add(targetId);
        const conn = peer.connect(targetId, { reliable: true });
        setupConnection(conn);
    }
}

function setupPeerEvents(p) {
    p.on('connection', (conn) => {
        console.log("Incoming connection from:", conn.peer);
        setupConnection(conn);
    });

    p.on('disconnected', () => {
        console.log("Peer disconnected from server. Attempting to reconnect...");
        // Attempt to reconnect with exponential backoff
        attemptReconnect(p, 0);
    });

    p.on('close', () => {
        console.log("Peer destroyed.");
        stopRedialLoop();
        connections = [];
        pendingPeers.clear();
    });

    p.on('error', (err) => {
        console.error("Peer error:", err);
    });
}

function attemptReconnect(p, attemptCount) {
    const maxAttempts = 5;
    const baseDelay = 1000; // 1 second

    if (attemptCount >= maxAttempts) {
        console.error("Max reconnection attempts reached. Please refresh the extension.");
        return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = baseDelay * Math.pow(2, attemptCount);

    console.log(`Reconnection attempt ${attemptCount + 1}/${maxAttempts} in ${delay}ms...`);

    setTimeout(() => {
        if (!p.destroyed) {
            p.reconnect();

            // Check if reconnection was successful after a short delay
            setTimeout(() => {
                if (p.disconnected && !p.destroyed) {
                    attemptReconnect(p, attemptCount + 1);
                } else {
                    console.log("Reconnection successful!");
                    // Re-establish connections to peers
                    if (currentGroupId) {
                        connectToPeers(currentGroupId);
                        startRedialLoop();
                    }
                }
            }, 2000);
        }
    }, delay);
}

function setupConnection(conn) {
    conn.on('open', () => {
        console.log(`Connection opened: ${conn.peer}`);
        pendingPeers.delete(conn.peer);
        // Add to list if not present
        const existingIndex = connections.findIndex(c => c.peer === conn.peer);
        if (existingIndex !== -1) {
            const existing = connections[existingIndex];
            if (existing !== conn) {
                try { existing.close(); } catch (_) { }
            }
            connections[existingIndex] = conn;
        } else {
            connections.push(conn);
        }
    });

    conn.on('data', async (data) => {
        console.log("Received data:", data);
        if (data && data.type === 'text') {
            const decryptedText = await decrypt(data.data, currentKey);
            if (decryptedText && receiveCallback) {
                receiveCallback({
                    text: decryptedText,
                    timestamp: data.timestamp,
                    id: data.id
                });
            }
        }
    });

    conn.on('close', () => {
        console.log(`Connection closed: ${conn.peer}`);
        connections = connections.filter(c => c.peer !== conn.peer);
        pendingPeers.delete(conn.peer);
        if (currentGroupId) connectToPeers(currentGroupId);
    });

    conn.on('error', (err) => {
        console.error(`Connection error with ${conn.peer}:`, err);
        connections = connections.filter(c => c.peer !== conn.peer);
        pendingPeers.delete(conn.peer);
        if (currentGroupId) connectToPeers(currentGroupId);
    });
}

export async function broadcast(text) {
    if (!currentKey || !peer) {
        throw new Error("Not connected");
    }

    const encrypted = await encrypt(text, currentKey);
    const message = {
        type: 'text',
        data: encrypted,
        timestamp: Date.now(),
        id: crypto.randomUUID()
    };

    console.log(`Broadcasting to ${connections.length} peers`);
    connections.forEach(conn => {
        if (conn.open) {
            conn.send(message);
        }
    });

    return message; // Return message meta for local storage
}

function shouldDialPeer(peerId) {
    const hasOpenConn = connections.some(c => c.peer === peerId && c.open);
    return !hasOpenConn && !pendingPeers.has(peerId);
}

function startRedialLoop() {
    stopRedialLoop();
    redialIntervalId = setInterval(() => {
        if (!peer || peer.destroyed || peer.disconnected || !currentGroupId) return;
        connectToPeers(currentGroupId);
    }, REDIAL_INTERVAL_MS);
}

function stopRedialLoop() {
    if (redialIntervalId) {
        clearInterval(redialIntervalId);
        redialIntervalId = null;
    }
}

function teardownPeer() {
    stopRedialLoop();
    pendingPeers.clear();
    connections.forEach(conn => {
        try { conn.close(); } catch (_) { }
    });
    connections = [];

    if (peer) {
        try { peer.destroy(); } catch (_) { }
        peer = null;
    }
    myPeerId = null;
}
