import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { Prisma } from '../../generated/prisma/client';
import { Database } from '../../database/prisma.service';
import { R2Storage } from '../../common/storage/r2-storage.service';

export function extractContactDetails(text: string) {
  const email =
    text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i)?.[0].toLowerCase() ?? null;
  const phoneLabels = /phone|mobile|tel(?:ephone)?|telefon|aloqa|contact|телефон|контакт/i;
  const phoneCandidates: Array<{ value: string; score: number }> = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const matches = line.matchAll(/\+?\d[\d\s().-]{7,}\d/g);
    for (const match of matches) {
      const raw = match[0].trim();
      const digits = raw.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) continue;
      const normalized = raw.startsWith('+')
        ? `+${digits}`
        : digits.startsWith('00')
          ? `+${digits.slice(2)}`
          : digits;
      const score = (phoneLabels.test(line) ? 2 : 0) + (normalized.startsWith('+') ? 1 : 0);
      phoneCandidates.push({ value: normalized, score });
    }
  }

  phoneCandidates.sort((a, b) => b.score - a.score);
  return { email, phone: phoneCandidates[0]?.value ?? null };
}

export async function extractResume(file: Express.Multer.File, maxSize = 5 * 1024 * 1024) {
  if (!file || !file.buffer?.length) throw new BadRequestException('Choose a PDF or DOCX file');
  if (file.size > maxSize)
    throw new BadRequestException(`Maximum file size is ${Math.floor(maxSize / 1024 / 1024)} MB`);
  let text = '';
  let mime = '';
  try {
    if (/\.pdf$/i.test(file.originalname) && file.buffer.subarray(0, 5).toString() === '%PDF-') {
      mime = 'application/pdf';
      const parser = new PDFParse({ data: file.buffer });
      try {
        const info = await parser.getInfo();
        if (info.total > 50) throw new Error('Too many pages');
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else if (
      /\.docx$/i.test(file.originalname) &&
      file.buffer.subarray(0, 2).toString() === 'PK'
    ) {
      mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      // Inspect central directory sizes before inflating a potentially hostile ZIP.
      let expanded = 0;
      let entries = 0;
      for (let i = 0; i + 46 <= file.buffer.length; i++) {
        if (file.buffer.readUInt32LE(i) === 0x02014b50) {
          expanded += file.buffer.readUInt32LE(i + 24);
          entries++;
        }
      }
      if (expanded > 20 * 1024 * 1024 || entries > 2000) throw new Error('Archive too large');
      const zip = await JSZip.loadAsync(file.buffer);
      if (!zip.file('word/document.xml')) throw new Error('Not a Word document');
      text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    } else throw new Error('Invalid signature');
  } catch {
    throw new BadRequestException(
      'Unable to read CV. Use an unencrypted PDF (up to 50 pages) or valid DOCX.',
    );
  }
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 30)
    throw new BadRequestException(
      'No readable CV text found. Scanned PDFs require OCR before upload.',
    );
  if (text.length > 80000) throw new BadRequestException('CV text exceeds 80,000 characters');
  return { text, mime, contacts: extractContactDetails(text) };
}

@Injectable()
export class ResumesService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(R2Storage) private storage: R2Storage,
  ) {}

  async upload(companyId: number, candidateId: number, file: Express.Multer.File) {
    const result = await extractResume(file);
    const previous = await this.db.candidate.findUniqueOrThrow({
      where: { id_companyId: { id: candidateId, companyId } },
      select: { resumeObjectKey: true, email: true, phone: true },
    });
    const objectKey = this.storage.enabled
      ? await this.storage.putResume(
          companyId,
          candidateId,
          file.originalname,
          result.mime,
          new Uint8Array(file.buffer),
        )
      : null;
    try {
      await this.db.$transaction(async (tx) => {
        await tx.candidate.update({
          where: { id_companyId: { id: candidateId, companyId } },
          data: {
            resumeData: objectKey ? null : new Uint8Array(file.buffer),
            resumeObjectKey: objectKey,
            resumeSize: file.size,
            resumeText: result.text,
            resumeMime: result.mime,
            resumeName: file.originalname.replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0, 180),
            email: previous.email ? undefined : (result.contacts.email ?? undefined),
            phone: previous.phone ? undefined : (result.contacts.phone ?? undefined),
            resumeRevision: { increment: 1 },
            parsedResume: Prisma.DbNull,
            skills: Prisma.DbNull,
            experience: Prisma.DbNull,
            education: Prisma.DbNull,
            languages: Prisma.DbNull,
          },
        });
        await tx.application.updateMany({
          where: { companyId, candidateId },
          data: {
            analysis: Prisma.DbNull,
            interviewQuestions: Prisma.DbNull,
            analyzedResumeRevision: null,
            analyzedVacancyRevision: null,
          },
        });
      });
    } catch (error) {
      if (objectKey) await this.storage.delete(objectKey).catch(() => undefined);
      throw error;
    }
    if (previous.resumeObjectKey && previous.resumeObjectKey !== objectKey) {
      const retained = await this.db.resume.count({
        where: { objectKey: previous.resumeObjectKey },
      });
      if (!retained) await this.storage.delete(previous.resumeObjectKey).catch(() => undefined);
    }
  }

  async download(companyId: number, candidateId: number) {
    const record = await this.db.candidate.findUniqueOrThrow({
      where: { id_companyId: { id: candidateId, companyId } },
      select: {
        resumeData: true,
        resumeObjectKey: true,
        resumeMime: true,
        resumeName: true,
      },
    });
    if (!record.resumeObjectKey && !record.resumeData)
      throw new BadRequestException('No CV uploaded');
    const resumeData = record.resumeObjectKey
      ? await this.storage.get(record.resumeObjectKey)
      : record.resumeData!;
    return { ...record, resumeData };
  }
}
