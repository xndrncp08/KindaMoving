import { z } from 'zod';
/** New-password policy. Mirrors Supabase Auth `minimum_password_length = 12` and `password_requirements = "letters_digits"`. */
export const passwordRules = [
  { label: '12 or more characters', test: (p: string) => p.length >= 12 },
  { label: 'A letter', test: (p: string) => /\p{L}/u.test(p) },
  { label: 'A number', test: (p: string) => /\d/.test(p) },
];
export const meetsPolicy = (p: string) => passwordRules.every((r) => r.test(p));
export const newPassword = z
  .string()
  .max(128, { error: 'Use 128 characters or fewer.' })
  .refine(meetsPolicy, { error: 'Meet every requirement below.' });
