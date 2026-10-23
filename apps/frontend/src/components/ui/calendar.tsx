import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** shadcn calendar, with the class names of react-day-picker v9. */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'space-y-4',
        month_caption: 'flex h-9 items-center justify-center',
        caption_label: 'text-sm font-semibold',
        nav: 'absolute inset-x-0 top-0 !flex !flex-row !gap-0 h-9 items-center justify-between',
        button_previous: cn(buttonVariants({ variant: 'outline' }), '!h-8 !w-8 bg-transparent p-0 opacity-70 hover:opacity-100'),
        button_next: cn(buttonVariants({ variant: 'outline' }), '!h-8 !w-8 bg-transparent p-0 opacity-70 hover:opacity-100'),
        month_grid: 'w-full border-collapse',
        weekdays: '[&>th]:!border-0',
        weekday: '!border-0 !bg-transparent !p-0 !text-[0.8rem] !font-normal !normal-case !tracking-normal !text-muted-foreground h-8 w-10',
        week: 'hover:!bg-transparent [&>td]:!border-0',
        day: '!relative !h-10 !w-10 !border-0 !p-0 text-center !text-sm !text-foreground',
        day_button: cn(buttonVariants({ variant: 'ghost' }), 'h-10 w-10 p-0 font-normal'),
        selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
        today: '[&>button]:bg-accent [&>button]:text-accent-foreground',
        outside: '!text-muted-foreground opacity-60',
        disabled: '!text-muted-foreground opacity-40 [&>button]:pointer-events-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClass, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('h-4 w-4', iconClass)} {...rest} />
          ) : (
            <ChevronRight className={cn('h-4 w-4', iconClass)} {...rest} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
