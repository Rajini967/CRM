const crypto = require('crypto');

/**
 * Safely decrypt email password
 * Handles both encrypted and unencrypted passwords for backward compatibility
 * @param {string} password - Password (may be encrypted or plain text)
 * @returns {string} Decrypted password (or original if decryption fails/not encrypted)
 */
function decryptEmailPassword(password) {
  // If password is null, undefined, or empty, return as-is
  if (!password || typeof password !== 'string') {
    return password;
  }

  // Check if password appears to be encrypted (format: "iv:encrypted" where both are hex)
  // Encrypted passwords have format: "hex:hex" (e.g., "a1b2c3d4...:e5f6g7h8...")
  const encryptedPattern = /^[0-9a-fA-F]+:[0-9a-fA-F]+$/;
  
  if (!encryptedPattern.test(password)) {
    // Not in encrypted format, return as-is (backward compatibility)
    return password;
  }

  try {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const [ivHex, encrypted] = password.split(':');
    
    if (!ivHex || !encrypted) {
      // Invalid format, return original
      console.warn('Password decryption: Invalid encrypted format, using as-is');
      return password;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipher(algorithm, key);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // Decryption failed - could be wrong key, corrupted data, or not actually encrypted
    // Return original password for backward compatibility
    console.warn('Password decryption failed, using password as-is:', error.message);
    return password;
  }
}

module.exports = {
  decryptEmailPassword
};

