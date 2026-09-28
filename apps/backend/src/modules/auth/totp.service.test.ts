import { describe, expect, it } from 'vitest';
import { TotpService, base32Encode, base32Decode } from './totp.service';

describe('TotpService', () => {
  const service = new TotpService();

  it('correctly encodes and decodes Base32', () => {
    const original = Buffer.from('Hello, Recruiter Security!');
    const encoded = base32Encode(original);
    const decoded = base32Decode(encoded);
    expect(decoded.toString()).toBe(original.toString());
  });

  it('generates a 6-digit TOTP code and validates it within time window', () => {
    const secret = service.generateSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);

    const now = Date.now();
    const code = service.generateCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);

    // Current time validation
    expect(service.verifyCode(code, secret, now)).toBe(true);

    // Within +15s drift window (same or adjacent step)
    expect(service.verifyCode(code, secret, now + 15000)).toBe(true);

    // Invalid code rejection
    expect(service.verifyCode('000000', secret, now)).toBe(false);
    expect(service.verifyCode('invalid', secret, now)).toBe(false);
  });

  it('generates and verifies single-use recovery codes', () => {
    const { plainCodes, hashedCodes } = service.generateRecoveryCodes(8);
    expect(plainCodes.length).toBe(8);
    expect(hashedCodes.length).toBe(8);

    const testCode = plainCodes[2];
    const matchIndex = service.findRecoveryCodeIndex(testCode, hashedCodes);
    expect(matchIndex).toBe(2);

    // Case-insensitive / hyphen-insensitive matching
    const lowercaseWithoutHyphen = testCode.toLowerCase().replace('-', '');
    expect(service.findRecoveryCodeIndex(lowercaseWithoutHyphen, hashedCodes)).toBe(2);

    // Invalid code returns -1
    expect(service.findRecoveryCodeIndex('FAKE-CODE', hashedCodes)).toBe(-1);
  });

  it('produces valid otpauth URI for authenticator apps', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = service.getOtpAuthUri('recruiter@company.com', secret, 'Shortlist');
    expect(uri).toContain('otpauth://totp/Shortlist:recruiter%40company.com');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Shortlist');
  });
});
