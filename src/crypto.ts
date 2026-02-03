import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from './config';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = config.encryptionKey;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  // Use first 32 bytes as AES-256 key
  return Buffer.from(key.slice(0, 32), 'utf-8');
}

export function encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

export function decrypt(encrypted: string, ivHex: string, authTagHex: string): string {
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

export function generateApiKey(): string {
  return `moltarb_${randomBytes(32).toString('hex')}`;
}
