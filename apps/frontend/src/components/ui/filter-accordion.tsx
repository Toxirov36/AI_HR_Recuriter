import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';

export type FilterOption = { value: string; label: string };

type Props = {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Shown when `value` is not among `options` (for example a vacancy the search list no longer holds). */
  fallbackLabel?: string;
  /** A search box above the options, for long lists. */
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  emptyText?: ReactNode;
  className?: string;
};

/**
 * A filter that opens like an accordion under its button (the same look as the status filter on the
 * vacancies page): one option is chosen, the list closes, and a click elsewhere or Escape closes it too.
 */
export function FilterAccordion({ value, options, onChange, ariaLabel, fallbackLabel, search, emptyText, className }: Props) {
  const [open, setOpen] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = open === 'filter';

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen('');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen('');
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const label = options.find((option) => option.value === value)?.label ?? fallbackLabel ?? '';

  return (
    <div className={cn('relative h-10 w-full min-w-0', className)} ref={ref}>
      <Accordion type="single" collapsible value={open} onValueChange={setOpen} className="w-full">
        <AccordionItem value="filter" className="border-none">
          <AccordionTrigger
            aria-label={ariaLabel}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3.5 py-0 text-sm font-normal text-slate-900 shadow-none transition-all hover:border-slate-300 hover:no-underline data-[state=open]:border-[#1a5d4c] data-[state=open]:ring-2 data-[state=open]:ring-[#1a5d4c]/15"
          >
            <span className="truncate pr-2 text-left">{label}</span>
          </AccordionTrigger>
          <AccordionContent
            containerClassName="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[220px] rounded-xl border border-slate-200 bg-white shadow-2xl"
            className="p-1.5"
          >
            {search && (
              <div className="p-1.5 pb-2">
                <input
                  aria-label={search.placeholder}
                  placeholder={search.placeholder}
                  value={search.value}
                  onChange={(event) => search.onChange(event.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-[#1a5d4c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5d4c]/15"
                />
              </div>
            )}
            <div className="max-h-64 space-y-0.5 overflow-y-auto" role="listbox" aria-label={ariaLabel}>
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setOpen('');
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      selected ? 'bg-[#eaf5ef] font-medium text-[#165b4c]' : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <Check size={14} className="ml-2 shrink-0 text-[#1a5d4c]" />}
                  </button>
                );
              })}
              {!options.length && emptyText && <p className="px-3 py-2 text-sm text-slate-500">{emptyText}</p>}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
