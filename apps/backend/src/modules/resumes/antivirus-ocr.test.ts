import { describe, expect, it } from 'vitest';
import { AntivirusService } from './antivirus.service';
import { OcrService } from './ocr.service';
import { BadRequestException } from '@nestjs/common';

describe('Antivirus & File Signature Inspection', () => {
  const avService = new AntivirusService();

  it('accepts legitimate PDF header %PDF-', () => {
    const validPdfBuffer = Buffer.from('%PDF-1.7\nSample Resume Content');
    const result = avService.verifyFileSignature(validPdfBuffer, 'resume.pdf');
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('application/pdf');
  });

  it('accepts legitimate DOCX PK zip header', () => {
    const validDocxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const result = avService.verifyFileSignature(validDocxBuffer, 'resume.docx');
    expect(result.valid).toBe(true);
    expect(result.mime).toContain('wordprocessingml');
  });

  it('accepts legitimate PNG and JPEG image signatures', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(avService.verifyFileSignature(pngBuffer, 'scan.png').mime).toBe('image/png');

    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(avService.verifyFileSignature(jpegBuffer, 'scan.jpg').mime).toBe('image/jpeg');
  });

  it('rejects executable Windows PE (.exe) disguised with pdf extension', () => {
    const peBinaryBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]); // MZ header
    expect(() =>
      avService.verifyFileSignature(peBinaryBuffer, 'trojan_cv.pdf'),
    ).toThrow(BadRequestException);
  });

  it('rejects Linux ELF and shell scripts disguised as documents', () => {
    const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
    expect(() => avService.verifyFileSignature(elfBuffer, 'fake.docx')).toThrow(
      BadRequestException,
    );

    const scriptBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
    expect(() => avService.verifyFileSignature(scriptBuffer, 'payload.pdf')).toThrow(
      BadRequestException,
    );
  });

  it('scans and detects EICAR standard antivirus test signature', async () => {
    const eicarPayload = Buffer.from(
      '%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n%%EOF',
    );
    const scan = await avService.scanBuffer(eicarPayload, 'eicar.pdf');
    expect(scan.isClean).toBe(false);
    expect(scan.threatName).toBe('Eicar-Test-Signature');
  });

  it('detects embedded malicious VBA macros in office archives', async () => {
    const macroPayload = Buffer.from('PK\x03\x04...vbaProject.bin...word/vbaData.xml');
    const scan = await avService.scanBuffer(macroPayload, 'macro_cv.docx');
    expect(scan.isClean).toBe(false);
    expect(scan.threatName).toBe('Macro.VBA.Embedded');
  });

  it('detects suspicious PDF executable action triggers (/Launch)', async () => {
    const launchPdf = Buffer.from('%PDF-1.4\n/Launch << /F (cmd.exe) >>\n%%EOF');
    const scan = await avService.scanBuffer(launchPdf, 'launch.pdf');
    expect(scan.isClean).toBe(false);
    expect(scan.threatName).toBe('Exploit.PDF.LaunchScript');
  });
});

describe('OCR (Optical Character Recognition) Service', () => {
  const mockSecurity: any = { config: {} };
  const ocrService = new OcrService(mockSecurity);

  it('correctly flags scanned PDFs and images for OCR', () => {
    // Normal text PDF (length 500) -> No OCR needed
    expect(ocrService.shouldOcr('application/pdf', 500)).toBe(false);

    // Scanned image PDF with no selectable text (length 10) -> Needs OCR
    expect(ocrService.shouldOcr('application/pdf', 10)).toBe(true);

    // PNG / JPEG CV -> Needs OCR
    expect(ocrService.shouldOcr('image/png', 0)).toBe(true);
    expect(ocrService.shouldOcr('image/jpeg', 0)).toBe(true);
  });

  it('extracts OCR text from media buffer with fallback', async () => {
    const scanBuffer = Buffer.from('scanned image binary content');
    const result = await ocrService.extractTextFromMedia(scanBuffer, 'image/png');

    expect(result.isOcr).toBe(true);
    expect(result.text.length).toBeGreaterThan(15);
  });
});
