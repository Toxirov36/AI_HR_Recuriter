import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui';
import type { WrittenAnswer } from '../types';

/** The candidate's written answers to HR's own open questions, with the AI's short note on each. */
export function WrittenAnswersPanel({ items }: { items: WrittenAnswer[] }) {
  const { t } = useTranslation();
  return (
    <Accordion type="single" collapsible defaultValue="written" className="panel mb-4">
      <AccordionItem value="written" className="border-b-0">
        <AccordionTrigger className="px-5 py-4 hover:no-underline sm:px-6">
          <div className="min-w-0 flex-1 pr-3 text-left">
            <h2 className="text-base font-semibold">
              {t('applications.writtenTitle')} ({items.length})
            </h2>
            <p className="text-sm text-slate-500">{t('applications.writtenSubtitle')}</p>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-5 pb-5 sm:px-6">
          <ol className="space-y-3">
            {items.map((item, index) => (
              <li key={index} className="rounded-xl border border-slate-200 p-4 text-sm">
                <p className="font-semibold text-slate-900">
                  {index + 1}. {item.question}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-slate-800">{item.answer}</p>
                {item.aiNote && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    <Sparkles size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      <b>{t('applications.writtenAiNote')}:</b> {item.aiNote}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
