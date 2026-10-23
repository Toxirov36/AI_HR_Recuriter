import { z } from 'zod';

export const MIN_LEAD_MS = 10 * 60 * 1000;
export const MAX_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

const slotTime = z.iso.datetime({ offset: true });

const scheduleFields = {
  slots: z.array(slotTime).min(1).max(5),
  durationMinutes: z.number().int().min(15).max(180).default(30),
  location: z.string().trim().min(3).max(300).optional(),
  mapUrl: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
};

export const createInterviewSchema = z
  .object({ mode: z.enum(['ONLINE', 'OFFLINE']), ...scheduleFields })
  .strict()
  .refine((value) => value.mode === 'ONLINE' || Boolean(value.location), { path: ['location'], message: 'Address is required for an offline interview' });

export const rescheduleInterviewSchema = z
  .object({ mode: z.enum(['ONLINE', 'OFFLINE']).optional(), ...scheduleFields })
  .strict();

export const confirmSchema = z.object({ slotId: z.number().int().positive() }).strict();
export const declineSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type RescheduleInterviewInput = z.infer<typeof rescheduleInterviewSchema>;

/**
 * Turns the proposed start times into slots: all in the future (not too far), distinct, and long enough
 * apart that two slots never overlap.
 */
export function buildSlots(starts: string[], durationMinutes: number, now = Date.now()): Array<{ startsAt: Date; endsAt: Date }> {
  const times = starts.map((value) => new Date(value).getTime()).sort((a, b) => a - b);
  const durationMs = durationMinutes * 60_000;
  times.forEach((time, index) => {
    if (time < now + MIN_LEAD_MS) throw new RangeError('Each time must be at least 10 minutes in the future');
    if (time > now + MAX_HORIZON_MS) throw new RangeError('Times can be at most 90 days ahead');
    if (index > 0 && time - times[index - 1] < durationMs) throw new RangeError('Proposed times must not overlap');
  });
  return times.map((time) => ({ startsAt: new Date(time), endsAt: new Date(time + durationMs) }));
}
