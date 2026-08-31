import { z } from 'zod';

export const saveIdentificationSectionRequestSchema = z.object({
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional(),
  birthDate: z.string().optional(),
});

export type SaveIdentificationSectionRequest = z.infer<typeof saveIdentificationSectionRequestSchema>;
