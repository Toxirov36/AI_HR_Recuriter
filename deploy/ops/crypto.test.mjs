import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from './crypto.mjs';
test('backup roundtrip and authenticated corruption detection', () => {
  const key = randomBytes(32), data = randomBytes(4096);
  const encrypted = encrypt(data, key);
  assert.deepEqual(decrypt(encrypted, key), data);
  assert.throws(() => decrypt(encrypted, randomBytes(32)));
  encrypted[40] ^= 1;
  assert.throws(() => decrypt(encrypted, key));
  assert.throws(() => decrypt(Buffer.from('truncated'), key));
});
