import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, createHash } from 'node:crypto';

// Base32 character set (RFC 4648)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      continue; // Skip invalid characters
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

@Injectable()
export class TotpService {
  /**
   * Generates a new random Base32 secret for TOTP.
   */
  generateSecret(byteLength = 20): string {
    const buffer = randomBytes(byteLength);
    return base32Encode(buffer);
  }

  /**
   * Generates standard otpauth:// URL for QR code scanning.
   */
  getOtpAuthUri(email: string, secret: string, issuer = 'Shortlist HR'): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedAccount = encodeURIComponent(email);
    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Generates an RFC 6238 TOTP 6-digit code for a given timestamp.
   */
  generateCode(secret: string, timestamp = Date.now(), stepSeconds = 30): string {
    const key = base32Decode(secret);
    const counter = Math.floor(timestamp / 1000 / stepSeconds);

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

    const hmac = createHmac('sha1', key);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    // Dynamic truncation
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const otp = binary % 1_000_000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Verifies a 6-digit TOTP code with time drift window tolerance (default +/- 1 step = 30s).
   */
  verifyCode(
    code: string,
    secret: string,
    timestamp = Date.now(),
    driftWindows = 1,
    stepSeconds = 30,
  ): boolean {
    if (!code || code.trim().length !== 6 || !secret) {
      return false;
    }

    const cleanCode = code.trim();

    for (let i = -driftWindows; i <= driftWindows; i++) {
      const checkTimestamp = timestamp + i * stepSeconds * 1000;
      const expectedCode = this.generateCode(secret, checkTimestamp, stepSeconds);
      if (expectedCode === cleanCode) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generates formatted one-time emergency recovery codes (e.g. ['ABCD-1234', ...]).
   */
  generateRecoveryCodes(count = 8): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const part1 = randomBytes(2).toString('hex').toUpperCase();
      const part2 = randomBytes(2).toString('hex').toUpperCase();
      const code = `${part1}-${part2}`;
      plainCodes.push(code);

      const hash = this.hashRecoveryCode(code);
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Hashes a recovery code for secure database storage.
   */
  hashRecoveryCode(code: string): string {
    const normalized = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Validates and returns the index of the matching recovery code, or -1 if none match.
   */
  findRecoveryCodeIndex(inputCode: string, storedHashedCodes: string[]): number {
    const inputHash = this.hashRecoveryCode(inputCode);
    return storedHashedCodes.indexOf(inputHash);
  }
}
