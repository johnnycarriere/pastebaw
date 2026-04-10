import { z } from 'zod';
import { LANGUAGES, MAX_PASTE_SIZE } from './constants';

// Schema for paste creation validation
export const createPasteSchema = z
  .object({
    content: z
      .string()
      .max(MAX_PASTE_SIZE, `Content must be less than ${MAX_PASTE_SIZE} bytes`)
      .optional(),
    language: z
      .string()
      .refine(lang => LANGUAGES.some(l => l.value === lang), 'Invalid language')
      .default('plaintext'),
    expiration: z.enum(['never', '1h', '1d', '7d', '30d', 'burn']).default('never'),
    password: z.string().optional().nullable(),
    image: z.string().optional(), // Base64 encoded image data
    originalFormat: z.string().optional().nullable(),
    pasteType: z.enum(['text', 'image', 'file']).default('text'),
    // File upload fields (populated by API route, not sent by client directly)
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    fileMimeType: z.string().optional(),
    fileBuffer: z.any().optional(), // Buffer, handled at runtime
  })
  .refine(
    data => {
      if (data.pasteType === 'text') {
        return !!data.content;
      } else if (data.pasteType === 'image') {
        return !!data.image;
      } else if (data.pasteType === 'file') {
        return !!data.fileBuffer;
      }
      return true;
    },
    {
      message: 'Content is required for text pastes, image for image pastes, file for file pastes',
      path: ['content'],
    }
  )
  .refine(
    data => {
      if (data.pasteType === 'text') {
        return !data.image && !data.fileBuffer;
      } else if (data.pasteType === 'image') {
        return !data.content || data.content.trim() === '';
      }
      return true;
    },
    {
      message: 'Cannot mix content types in the same paste',
      path: ['content'],
    }
  );

// Schema for paste retrieval validation
export const getPasteSchema = z.object({
  id: z.string().min(1, 'Paste ID is required'),
  password: z.string().optional(),
});

// TypeScript types derived from Zod schemas
export type CreatePasteInput = z.infer<typeof createPasteSchema>;
export type GetPasteInput = z.infer<typeof getPasteSchema>;
