import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const registerAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(1, 'Name is required'),
  tenantSlug: z.string().optional(),
  tenantId: z.string().optional(),
});

export const createAdminUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(1, 'Name is required'),
  role: z.string().optional().default('admin'),
});

/**
 * PATCH /api/auth/me — all fields optional; at least one must be provided.
 * When changing the password the caller must also supply `currentPassword`
 * for verification.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
    email: z.string().email('Must be a valid email').optional(),
    logo: z.string().url('Logo must be a valid URL').nullable().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z
      .string()
      .min(6, 'New password must be at least 6 characters')
      .optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    { message: 'At least one field must be provided.' },
  )
  .refine(
    (d) => {
      // If newPassword is supplied, currentPassword is required.
      if (d.newPassword && !d.currentPassword) return false;
      return true;
    },
    {
      message: 'currentPassword is required when setting a new password.',
      path: ['currentPassword'],
    },
  );

