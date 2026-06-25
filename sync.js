import { generateCryptoKeys, encrypt, decrypt } from './utils.js';

let ablyClient = null;
let ablyChannel = null;
let receiveCallback = null;
let currentKey = null;

const ABLY_API_KEY = '9Obfug.vRYZWA:uEjDe_eq-tUeNGAixYLX1rK3VhgnWmBXL4qskVcroNo';

export function onReceive(cb) {
    receiveCallback = cb;
}

export function isConnected() {
    return ablyChannel && ablyChannel.state === 'attached';
}

export async function connect(syncCode) {
    if (ablyChannel) {
        ablyChannel.unsubscribe();
        ablyChannel.detach();
    }

    if (!ablyClient) {
        // We use window.Ably since it's loaded globally via the script tag in offscreen.html
        ablyClient = new window.Ably.Realtime({
            key: ABLY_API_KEY,
            echoMessages: false // Automatically ignore messages broadcasted by ourselves
        });
    }

    const { groupId, encryptionKey } = await generateCryptoKeys(syncCode);
    currentKey = encryptionKey;

    // We join a specific channel based on the syncCode's derived groupId
    ablyChannel = ablyClient.channels.get(`room_${groupId}`);

    return new Promise((resolve, reject) => {
        // Subscribe to incoming 'clip_sync' events on this channel
        ablyChannel.subscribe('clip_sync', async (message) => {
            if (message.data && message.data.data) {
                try {
                    const decryptedText = await decrypt(message.data.data, currentKey);
                    if (decryptedText && receiveCallback) {
                        receiveCallback({
                            text: decryptedText,
                            timestamp: message.data.timestamp,
                            id: message.data.id
                        });
                    }
                } catch (e) {
                    console.error('Decryption error', e);
                }
            }
        });

        // Attach to the channel to finalize connection
        ablyChannel.attach((err) => {
            if (err) {
                console.error("Ably connect error:", err);
                reject(new Error(`Failed to join Ably Channel: ${err.message}`));
            } else {
                console.log(`Joined Ably Channel: room_${groupId}`);
                resolve();
            }
        });
    });
}

export async function broadcast(text) {
    if (!currentKey || !isConnected()) {
        throw new Error("Not connected to Ably channel.");
    }

    const encrypted = await encrypt(text, currentKey);
    const messageData = {
        data: encrypted,
        timestamp: Date.now(),
        id: crypto.randomUUID()
    };

    return new Promise((resolve, reject) => {
        ablyChannel.publish('clip_sync', messageData, (err) => {
            if (err) {
                console.error("Ably Broadcast failed", err);
                reject(new Error("Ably Broadcast failed"));
            } else {
                resolve(messageData); // Return message meta for local storage
            }
        });
    });
}
