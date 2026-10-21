import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// Radix does not allow an empty item value, so "no selection" travels as a sentinel.
const NONE = '__none__';

export type FormSelectOption = { value: string; label: string };

type FormSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  /** Label of the "nothing chosen" entry (value ''). Omit when an empty value is not allowed. */
  emptyLabel?: string;
  ariaLabel?: string;
  className?: string;
};

/**
 * A rounded, themed replacement for a native <select> (whose open list is drawn by the browser
 * with square corners). Same controlled API: the value is a plain string, '' meaning "not set".
 */
export function FormSelect({ id, value, onChange, options, emptyLabel, ariaLabel, className }: FormSelectProps) {
  const items = emptyLabel === undefined ? options : [{ value: NONE, label: emptyLabel }, ...options];
  return (
    <Select value={value === '' && emptyLabel !== undefined ? NONE : value} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('form-control-select', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-2xl">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
