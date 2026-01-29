const ADJECTIVES = [
  'happy', 'sunny', 'brave', 'calm', 'cool', 'kind', 'wise', 'fast', 'neat', 
  'blue', 'red', 'gold', 'swift', 'bold', 'safe', 'glad', 'epic', 'free'
];

const NOUNS = [
  'cat', 'dog', 'bird', 'lion', 'wolf', 'moon', 'star', 'tree', 'wave', 
  'leaf', 'wind', 'fire', 'snow', 'rain', 'ship', 'code', 'data', 'byte'
];

export function generateSyncCode() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}

function buf2hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

function hex2buf(hexString) {
  return new Uint8Array(hexString.match(/../g).map(h => parseInt(h, 16))).buffer;
}

async function sha256(text) {
  const msgBuffer = new TextEncoder().encode(text);
  return await crypto.subtle.digest('SHA-256', msgBuffer);
}

export async function generateCryptoKeys(syncCode) {
  // groupId = SHA256(syncCode) -> hex string for PeerJS ID
  const groupHash = await sha256(syncCode);
  const groupId = buf2hex(groupHash);

  // encryptionKey = SHA256(syncCode + "clipsync") -> CryptoKey for AES-GCM
  const keyMaterial = await sha256(syncCode + "clipsync");
  const encryptionKey = await crypto.subtle.importKey(
    "raw",
    keyMaterial, // SHA-256 produces 32 bytes, perfect for AES-256
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  return { groupId, encryptionKey };
}

export async function encrypt(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    encoded
  );

  return JSON.stringify({
    iv: buf2hex(iv.buffer),
    data: buf2hex(ciphertext)
  });
}

export async function decrypt(encryptedJson, key) {
  try {
    const { iv, data } = JSON.parse(encryptedJson);
    
    const ivBuffer = hex2buf(iv);
    const dataBuffer = hex2buf(data);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer
      },
      key,
      dataBuffer
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('Decryption failed:', err);
    return null; // Return null if decryption fails
  }
}
