import { z } from 'zod';

const CHANNEL_NAMES = ['doctors', 'accounting', 'general'];

export const sendMessageSchema = z
  .object({
    recipient: z.string().length(24, 'Invalid recipient id').optional(),
    channel: z.enum(CHANNEL_NAMES).optional(),
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

export const listMessagesSchema = z
  .object({
    recipient: z.string().length(24).optional(),
    channel: z.enum(CHANNEL_NAMES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
    before: z.string().datetime().optional(),
    after: z.string().datetime().optional(),
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

export const markReadSchema = z.object({
  messageIds: z.array(z.string().length(24)).min(1).max(100),
});

export const markChannelReadSchema = z.object({
  channel: z.string().max(50).min(1),
});
