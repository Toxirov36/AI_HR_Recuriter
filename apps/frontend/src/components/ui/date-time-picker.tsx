import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { enUS, ru, uz } from 'react-day-picker/locale';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from './calendar';
import { FormSelect } from './form-select';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const pad = (value: number) => String(value).padStart(2, '0');

/** Quarter-hour choices from 07:00 to 21:45. */
const TIMES = Array.from({ length: 15 * 4 }, (_, i) => {
  const minutes = 7 * 60 + i * 15;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
});

// react-day-picker ships no Tajik calendar; Russian (also Cyrillic) is the closest.
const locales = { uz, ru, tg: ru } as const;

type Props = {
  /** "YYYY-MM-DDTHH:mm" in the browser's local time, or '' for nothing chosen. */
  value: string;
  onChange: (value: string) => void;
  language?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

/** A calendar popover for the day plus a quarter-hour time list, in one row. */
export function DateTimePicker({ value, onChange, language = 'en', placeholder = 'Pick a date', ariaLabel, className }: Props) {
  const [open, setOpen] = useState(false);
  const [datePart, timePart] = value.split('T');
  const date = useMemo(() => (datePart ? new Date(`${datePart}T00:00:00`) : undefined), [datePart]);
  const time = timePart?.slice(0, 5) || '10:00';
  const timeOptions = (TIMES.includes(time) ? TIMES : [...TIMES, time].sort()).map((option) => ({ value: option, label: option }));
  const label = date ? format(date, 'EEE, d MMMM yyyy', { locale: locales[language as keyof typeof locales] ?? enUS }) : placeholder;
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));

  function pick(next?: Date) {
    if (!next) return;
    onChange(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${time}`);
    setOpen(false);
  }

  return (
    <div className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className="flex h-10 min-w-0 flex-1 basis-48 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-left text-sm text-slate-900 transition-all hover:border-slate-300 focus-visible:border-[#1a5d4c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5d4c]/15"
          >
            <CalendarDays size={16} className="shrink-0 text-slate-500" />
            <span className={cn('truncate', !date && 'text-slate-400')}>{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date ?? startOfToday}
            onSelect={pick}
            disabled={{ before: startOfToday }}
            locale={locales[language as keyof typeof locales] ?? undefined}
            weekStartsOn={1}
          />
        </PopoverContent>
      </Popover>
      <div className="w-28 shrink-0">
        <FormSelect ariaLabel={ariaLabel ? `${ariaLabel} – time` : 'Time'} value={time} onChange={(next) => onChange(`${datePart || ''}T${next}`)} options={timeOptions} />
      </div>
    </div>
  );
}
