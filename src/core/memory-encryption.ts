import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { MemoryEntry } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * MemoryEncryption — AES-256-GCM encryption for memories at rest.
 *
 * Uses scrypt for key derivation from passphrase.
 * Each encrypted payload includes salt, IV, and auth tag.
 */
export class MemoryEncryption {
  private key: Buffer | null = null;

  /** Initialize with a passphrase (derives key via scrypt) */
  initWithPassphrase(passphrase: string, salt?: Buffer): Buffer {
    const actualSalt = salt ?? randomBytes(SALT_LENGTH);
    this.key = scryptSync(passphrase, actualSalt, KEY_LENGTH);
    return actualSalt;
  }

  /** Initialize with a raw key (32 bytes) */
  initWithKey(key: Buffer): void {
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Key must be ${KEY_LENGTH} bytes`);
    }
    this.key = key;
  }

  /** Encrypt a string (returns base64-encoded: salt + iv + tag + ciphertext) */
  encrypt(plaintext: string): string {
    if (!this.key) throw new Error("Encryption not initialized");

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Pack: iv (16) + tag (16) + ciphertext
    const packed = Buffer.concat([iv, tag, encrypted]);
    return packed.toString("base64");
  }

  /** Decrypt a base64-encoded encrypted string */
  decrypt(encryptedBase64: string): string {
    if (!this.key) throw new Error("Encryption not initialized");

    const packed = Buffer.from(encryptedBase64, "base64");

    const iv = packed.subarray(0, IV_LENGTH);
    const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = packed.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  /** Encrypt a memory entry's content */
  encryptMemory(entry: MemoryEntry): MemoryEntry {
    return {
      ...entry,
      content: this.encrypt(entry.content),
      metadata: {
        ...entry.metadata,
        encrypted: true,
      },
    };
  }

  /** Decrypt a memory entry's content */
  decryptMemory(entry: MemoryEntry): MemoryEntry {
    if (!entry.metadata.encrypted) return entry;

    return {
      ...entry,
      content: this.decrypt(entry.content),
      metadata: {
        ...entry.metadata,
        encrypted: false,
      },
    };
  }

  /** Encrypt multiple memories */
  encryptMemories(entries: MemoryEntry[]): MemoryEntry[] {
    return entries.map((e) => this.encryptMemory(e));
  }

  /** Decrypt multiple memories */
  decryptMemories(entries: MemoryEntry[]): MemoryEntry[] {
    return entries.map((e) => this.decryptMemory(e));
  }

  /** Check if encryption is initialized */
  get isReady(): boolean {
    return this.key !== null;
  }
}
