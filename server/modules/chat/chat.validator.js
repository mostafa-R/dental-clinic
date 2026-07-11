import { z } from 'zod';

export const sendMessageSchema = z
  .object({
    recipient: z.string().length(24, 'Invalid recipient id').optional(),
    channel: z.string().max(50, 'Channel name too long').optional(),
    content: z.string().min(1, 'Message content is required').max(2000, 'Message too long'),
  })
  .superRefine((data, ctx) => {
    if (!data.recipient && !data.channel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipient'],
        message: 'Either recipient or channel is required',
      });
    }
    if (data.recipient && data.channel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipient'],
        message: 'Cannot specify both recipient and channel',
      });
    }
  });

export const listMessagesSchema = z.object({
  recipient: z.string().length(24).optional(),
  channel: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  before: z.string().datetime().optional(),
  after: z.string().datetime().optional(),
});

export const markReadSchema = z.object({
  messageIds: z.array(z.string().length(24)).min(1).max(100),
});
