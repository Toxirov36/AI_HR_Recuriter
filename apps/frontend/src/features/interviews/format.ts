const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

/**
 * A time in the interview's own time zone, written in the interface language. Intl has no usable Uzbek
 * month names, and none at all for Tajik, so those two are built by hand ("23-oktabr 2026, 16:15").
 */
export function formatInterviewTime(iso: string, timezone: string, language: string): string {
  const lang = (language || 'en').slice(0, 2);
  try {
    const date = new Date(iso);
    if (lang === 'uz') {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(date)
        .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
      return `${Number(parts.day)}-${UZ_MONTHS[Number(parts.month) - 1]} ${parts.year}, ${parts.hour}:${parts.minute}`;
    }
    return new Intl.DateTimeFormat(lang === 'tg' ? 'ru' : lang, { dateStyle: 'long', timeStyle: 'short', timeZone: timezone }).format(date);
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Value for <input type="datetime-local"> (the browser's local time) a number of hours from now, rounded to the hour. */
export function defaultSlotValue(hoursAhead = 24, now = new Date()): string {
  const date = new Date(now.getTime() + hoursAhead * 3_600_000);
  date.setMinutes(0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`;
}
