import { z } from 'zod'

export const signInSchema = z.object({
  email: z.email('Введите корректный адрес электронной почты.'),
  password: z.string().min(8, 'Пароль должен содержать не менее 8 символов.'),
})

export const registrationSchema = signInSchema.extend({
  displayName: z.string().trim().min(1, 'Введите имя.').max(40, 'Имя не должно превышать 40 символов.'),
})

export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Юзернейм должен содержать 3–24 символа: латинские буквы, цифры и _.')

const allowedImages = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

export function isAllowedImage(type: string, size: number, maxBytes = 8 * 1024 * 1024) {
  return allowedImages.has(type) && size > 0 && size <= maxBytes
}