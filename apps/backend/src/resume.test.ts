import { describe, expect, it } from 'vitest';
import { extractResume } from './resume';
function pdfFixture(text: string) {
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
describe('document extraction', () => {
  it('extracts readable text from a real PDF document', async () => {
    const buffer = pdfFixture('Experienced engineer building APIs with NestJS and PostgreSQL.');
    const result = await extractResume({
      buffer,
      size: buffer.length,
      originalname: 'cv.pdf',
    } as Express.Multer.File);
    expect(result.text).toContain('NestJS');
    expect(result.mime).toBe('application/pdf');
  });
  it('rejects a file whose extension disguises its content', async () => {
    const buffer = Buffer.from('This is not a document');
    await expect(
      extractResume({
        buffer,
        size: buffer.length,
        originalname: 'cv.docx',
      } as Express.Multer.File),
    ).rejects.toThrow('Unable to read CV');
  });
  it('rejects a textless PDF rather than inventing a profile', async () => {
    const buffer = pdfFixture('');
    await expect(
      extractResume({ buffer, size: buffer.length, originalname: 'cv.pdf' } as Express.Multer.File),
    ).rejects.toThrow('No readable CV text');
  });
});
