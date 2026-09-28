import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface ComboboxContextValue<T = any> {
  items: T[];
  value: T | null;
  onValueChange?: (val: T | null) => void;
  search: string;
  setSearch: (s: string) => void;
  isOpen: boolean;
  setIsOpen: (o: boolean) => void;
  displayValue: string;
  setDisplayValue: (s: string) => void;
  filterFn: (item: T, query: string) => boolean;
  anchorWidth?: number;
  anchorRef?: React.RefObject<HTMLDivElement | null>;
}

const ComboboxContext = React.createContext<ComboboxContextValue | null>(null);

function useComboboxContext() {
  const ctx = React.useContext(ComboboxContext);
  if (!ctx) {
    throw new Error('Combobox components must be used within a <Combobox>');
  }
  return ctx;
}

// Group Context
interface ComboboxGroupContextValue<T = any> {
  items: T[];
}
const ComboboxGroupContext = React.createContext<ComboboxGroupContextValue | null>(null);

function defaultFilter(item: any, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase().trim();
  if (typeof item === 'string') return item.toLowerCase().includes(q);
  if (typeof item === 'object' && item !== null) {
    const candidateName = item.fullName || item.title || item.name || item.value || '';
    const email = item.email || '';
    return (
      String(candidateName).toLowerCase().includes(q) ||
      String(email).toLowerCase().includes(q)
    );
  }
  return true;
}

function getItemText(item: any): string {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    return item.fullName || item.title || item.name || item.label || item.value || JSON.stringify(item);
  }
  return String(item);
}

export interface ComboboxProps<T = any> {
  items?: readonly T[] | T[];
  value?: any | null;
  onValueChange?: (value: any | null) => void;
  children: React.ReactNode;
  className?: string;
  filter?: (item: any, query: string) => boolean;
}

export function Combobox<T = any>({
  items = [],
  value = null,
  onValueChange,
  children,
  className,
  filter = defaultFilter,
}: ComboboxProps<T>) {
  const [search, setSearch] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedValue, setSelectedValue] = React.useState<any | null>(value ?? null);
  const [displayValue, setDisplayValue] = React.useState<string>(
    value ? getItemText(value) : '',
  );
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (value !== undefined) {
      setSelectedValue(value);
      setDisplayValue(value ? getItemText(value) : '');
    }
  }, [value]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen]);

  const handleValueChange = (val: any | null) => {
    setSelectedValue(val);
    setDisplayValue(val ? getItemText(val) : '');
    onValueChange?.(val);
  };

  return (
    <ComboboxContext.Provider
      value={{
        items: items as any[],
        value: selectedValue,
        onValueChange: handleValueChange,
        search,
        setSearch,
        isOpen,
        setIsOpen,
        displayValue,
        setDisplayValue,
        filterFn: filter,
        anchorRef: containerRef,
      }}
    >
      <div ref={containerRef} className={cn('relative w-full', className)}>
        {children}
      </div>
    </ComboboxContext.Provider>
  );
}

export interface ComboboxInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string;
}

export const ComboboxInput = React.forwardRef<HTMLInputElement, ComboboxInputProps>(
  ({ className, placeholder = 'Search or select…', ...props }, ref) => {
    const {
      search,
      setSearch,
      isOpen,
      setIsOpen,
      displayValue,
      value,
      onValueChange,
    } = useComboboxContext();

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSearch('');
      onValueChange?.(null);
    };

    const inputValue = isOpen ? search : (value ? displayValue : search);

    return (
      <div
        className={cn(
          'relative flex items-center h-11 w-full rounded-xl border bg-white px-3.5 transition-all cursor-pointer shadow-xs',
          isOpen
            ? 'border-[#1a5d4c] ring-2 ring-[#1a5d4c]/15 shadow-sm'
            : 'border-slate-200 hover:border-slate-300',
          className,
        )}
        onClick={() => setIsOpen(true)}
      >
        <Search size={16} className="text-slate-400 shrink-0 mr-3 pointer-events-none" />

        <input
          ref={ref}
          type="text"
          className="combobox-input-field flex-1 bg-transparent border-none outline-none shadow-none text-sm text-slate-900 placeholder:text-slate-400 p-0 m-0 h-full font-normal focus:outline-none focus:ring-0 focus:border-none focus:shadow-none"
          style={{
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            background: 'transparent',
            padding: 0,
            margin: 0,
          }}
          placeholder={value ? displayValue : placeholder}
          value={inputValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          autoComplete="off"
          {...props}
        />

        {(value || search) && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear selection"
            className="h-5 w-5 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors ml-1.5 shrink-0"
          >
            <X size={13} />
          </button>
        )}

        <ChevronDown
          size={16}
          className={cn(
            'text-slate-400 shrink-0 ml-2 transition-transform duration-200 pointer-events-none',
            isOpen && 'rotate-180 text-[#1a5d4c]',
          )}
        />
      </div>
    );
  },
);
ComboboxInput.displayName = 'ComboboxInput';

export interface ComboboxContentProps {
  children: React.ReactNode;
  className?: string;
}

export function ComboboxContent({ children, className }: ComboboxContentProps) {
  const { isOpen } = useComboboxContext();
  if (!isOpen) return null;

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className={cn(
        'absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl combobox-popover-content animate-in fade-in-0 zoom-in-95',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ComboboxEmptyProps {
  children: React.ReactNode;
  className?: string;
}

export function ComboboxEmpty({ children, className }: ComboboxEmptyProps) {
  const { items, search, filterFn } = useComboboxContext();
  // Check if items have any matches
  const hasMatches = items.some((item) => {
    // If grouped
    if (typeof item === 'object' && item !== null && 'items' in item && Array.isArray(item.items)) {
      return item.items.some((sub: any) => filterFn(sub, search));
    }
    return filterFn(item, search);
  });

  if (hasMatches) return null;

  return (
    <div className={cn('py-4 px-3 text-center text-xs text-slate-400', className)}>
      {children}
    </div>
  );
}

export interface ComboboxListProps<T = any> {
  children?: React.ReactNode | ((item: T, index: number) => React.ReactNode);
  className?: string;
}

export function ComboboxList<T = any>({ children, className }: ComboboxListProps<T>) {
  const { items, search, filterFn } = useComboboxContext();

  if (typeof children === 'function') {
    const filtered = items.filter((item) => {
      // If group with sub-items
      if (typeof item === 'object' && item !== null && 'items' in item && Array.isArray(item.items)) {
        return item.items.some((sub: any) => filterFn(sub, search));
      }
      return filterFn(item, search);
    });

    return (
      <div className={cn('space-y-0.5', className)}>
        {filtered.map((item, index) => (children as (item: T, index: number) => React.ReactNode)(item, index))}
      </div>
    );
  }

  return <div className={cn('space-y-0.5', className)}>{children}</div>;
}

export interface ComboboxGroupProps<T = any> {
  items?: readonly T[] | T[];
  children: React.ReactNode;
  className?: string;
}

export function ComboboxGroup<T = any>({ items = [], children, className }: ComboboxGroupProps<T>) {
  const { search, filterFn } = useComboboxContext();
  const visibleItems = (items as T[]).filter((item) => filterFn(item, search));

  if (items.length > 0 && visibleItems.length === 0) {
    return null;
  }

  return (
    <ComboboxGroupContext.Provider value={{ items: visibleItems }}>
      <div className={cn('py-1', className)}>{children}</div>
    </ComboboxGroupContext.Provider>
  );
}

export interface ComboboxLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function ComboboxLabel({ children, className }: ComboboxLabelProps) {
  return (
    <div
      className={cn(
        'px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ComboboxCollectionProps<T = any> {
  children: (item: T, index: number) => React.ReactNode;
}

export function ComboboxCollection<T = any>({ children }: ComboboxCollectionProps<T>) {
  const groupCtx = React.useContext(ComboboxGroupContext);
  const rootCtx = useComboboxContext();
  const items = (groupCtx?.items ?? rootCtx.items ?? []) as T[];

  return <>{items.map((item, index) => children(item, index))}</>;
}

export interface ComboboxItemProps<T = any> {
  value: T;
  children?: React.ReactNode;
  className?: string;
}

export function ComboboxItem<T = any>({ value: itemValue, children, className }: ComboboxItemProps<T>) {
  const { value, onValueChange, setIsOpen, setSearch } = useComboboxContext();

  const isSelected =
    value === itemValue ||
    (typeof value === 'object' &&
      value !== null &&
      typeof itemValue === 'object' &&
      itemValue !== null &&
      'id' in value &&
      'id' in itemValue &&
      (value as any).id === (itemValue as any).id);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange?.(itemValue);
    setSearch('');
    setIsOpen(false);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors',
        isSelected
          ? 'bg-[#eaf5ef] text-[#165b4c] font-medium'
          : 'text-slate-700 hover:bg-slate-50',
        className,
      )}
    >
      <div className="flex-1 min-w-0">{children ?? getItemText(itemValue)}</div>
      {isSelected && <Check size={16} className="text-[#1a5d4c] shrink-0 ml-2" />}
    </div>
  );
}

export function ComboboxSeparator({ className }: { className?: string }) {
  return <div className={cn('border-t border-slate-100 my-1', className)} />;
}
