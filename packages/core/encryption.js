import sodium from 'libsodium-wrappers';

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await sodium.ready;
    initialized = true;
  }
}

/**
 * Encrypt a string using libsodium sealed box
 * @param {string} plaintext 
 * @param {string} hexKey - 32-byte hex key
 * @returns {Promise<string>} Base64 encrypted string
 */
export async function encrypt(plaintext, hexKey) {
  await ensureInitialized();
  
  if (!hexKey) {
    throw new Error('Encryption key is required');
  }

  const key = sodium.from_hex(hexKey);
  const encrypted = sodium.crypto_secretbox_easy(
    plaintext,
    sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES),
    key
  );
  
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

/**
 * Decrypt a base64 encrypted string
 * @param {string} ciphertext - Base64 encrypted string
 * @param {string} hexKey - 32-byte hex key
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decrypt(ciphertext, hexKey) {
  await ensureInitialized();
  
  if (!hexKey) {
    throw new Error('Encryption key is required');
  }

  try {
    const key = sodium.from_hex(hexKey);
    const encrypted = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
    
    // For sealed box encryption, we need to use a different approach
    // Using simple secret box with random nonce stored with data
    const nonce = encrypted.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const message = encrypted.slice(sodium.crypto_secretbox_NONCEBYTES);
    
    const decrypted = sodium.crypto_secretbox_open_easy(message, nonce, key);
    return sodium.to_string(decrypted);
  } catch (error) {
    throw new Error('Decryption failed: ' + error.message);
  }
}

/**
 * Better encryption using sealed box (public key crypto)
 */
export async function encryptToken(plaintext, hexKey) {
  await ensureInitialized();
  
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('Encryption key must be 32 bytes (64 hex chars)');
  }

  const key = sodium.from_hex(hexKey);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = sodium.crypto_secretbox_easy(plaintext, nonce, key);
  
  // Combine nonce + encrypted for storage
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);
  
  return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
}

export async function decryptToken(ciphertext, hexKey) {
  await ensureInitialized();
  
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('Encryption key must be 32 bytes (64 hex chars)');
  }

  const key = sodium.from_hex(hexKey);
  const combined = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
  
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
  
  const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, key);
  return sodium.to_string(decrypted);
}

/**
 * Generate a random encryption key
 * @returns {Promise<string>} 32-byte hex key
 */
export async function generateKey() {
  await ensureInitialized();
  const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  return sodium.to_hex(key);
}
