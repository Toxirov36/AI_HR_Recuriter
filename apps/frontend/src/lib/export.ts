import type { Application, Candidate } from '../types';
import { label } from '../components/ui';
import { getEvidenceSummary } from './match-score';

/**
 * Escapes a cell value for standard CSV formatting (RFC 4180).
 * Handles commas, double quotes, and newlines.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Downloads data as a CSV file with UTF-8 BOM so Microsoft Excel
 * and other spreadsheet tools render non-ASCII characters (e.g. Uzbek Latin/Cyrillic) perfectly.
 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\r\n');

  // \uFEFF is UTF-8 Byte Order Mark (BOM) - critical for Excel Windows
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports applications to an Excel-compatible CSV file.
 */
export function exportApplicationsToCsv(
  applications: Application[],
  customFilename?: string,
) {
  const headers = [
    'ID',
    'Nomzod F.I.Sh',
    'Vakansiya',
    'Bosqich (Status)',
    'AI Tahlili',
    'Telefon',
    'Email',
    'Telegram',
    'Manba',
    'CV Fayli',
    'Ariza topshirilgan sana',
  ];

  const rows = applications.map((app) => {
    const evidence = getEvidenceSummary(app.analysis);
    const aiSummary = evidence
      ? `${evidence.supported} tasdiqlangan, ${evidence.partial} qisman, ${evidence.notFound} topilmadi`
      : 'Tahlil qilinmagan';

    const dateStr = app.createdAt
      ? new Date(app.createdAt).toLocaleDateString('uz-UZ', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    return [
      app.id,
      app.candidate.fullName,
      app.vacancy.title,
      label(app.status),
      aiSummary,
      app.candidate.phone || 'Kiritilmagan',
      app.candidate.email || 'Kiritilmagan',
      app.candidate.telegramUsername ? `@${app.candidate.telegramUsername}` : 'Mavjud emas',
      app.candidate.source || 'WEBSITE',
      app.candidate.resumeName || 'Yuklanmagan',
      dateStr,
    ];
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `arizalar_${timestamp}.csv`;
  downloadCsv(filename, headers, rows);
}

/**
 * Exports candidates list to an Excel-compatible CSV file.
 */
export function exportCandidatesToCsv(
  candidates: Candidate[],
  customFilename?: string,
) {
  const headers = [
    'ID',
    'F.I.Sh',
    'Telefon',
    'Email',
    'Telegram',
    'Manba',
    'Rezyume fayli',
    'Arizalar soni',
    'Asosiy ko‘nikmalar',
    'Qo‘shilgan sana',
  ];

  const rows = candidates.map((cand) => {
    const skills = cand.parsedResume?.skills?.join(', ') || '';
    const dateStr = cand.createdAt
      ? new Date(cand.createdAt).toLocaleDateString('uz-UZ', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
      : '';

    return [
      cand.id,
      cand.fullName,
      cand.phone || 'Kiritilmagan',
      cand.email || 'Kiritilmagan',
      cand.telegramUsername ? `@${cand.telegramUsername}` : 'Mavjud emas',
      cand.source || 'WEBSITE',
      cand.resumeName || 'Yuklanmagan',
      cand._count?.applications ?? 0,
      skills,
      dateStr,
    ];
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `nomzodlar_${timestamp}.csv`;
  downloadCsv(filename, headers, rows);
}
