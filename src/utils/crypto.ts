import CryptoJS from 'crypto-js';

/**
 * Hash password using SHA-256
 * @param password - Plain text password
 * @returns Hashed password as hexadecimal string
 */
export const hashPassword = (password: string): string => {
  return CryptoJS.SHA256(password).toString(CryptoJS.enc.Hex);
};

