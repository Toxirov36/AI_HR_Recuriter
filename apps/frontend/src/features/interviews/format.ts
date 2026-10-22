/** A time in the interview's own time zone, in the interface language. */
export function formatInterviewTime(iso: string, timezone: string, language: string): string {
  try {
    return new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(iso));
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
