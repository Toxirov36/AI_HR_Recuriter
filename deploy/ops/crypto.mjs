import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const magic = Buffer.from('HRBK1');
export function encrypt(data, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(magic);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), body]);
}
export function decrypt(data, key) {
  if (data.length < 33 || !data.subarray(0, 5).equals(magic)) throw new Error('Invalid backup format');
  const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(5, 17));
  cipher.setAAD(magic);
  cipher.setAuthTag(data.subarray(17, 33));
  return Buffer.concat([cipher.update(data.subarray(33)), cipher.final()]);
}
