import { describe, expect, it } from 'vitest'
import { shouldPersistToast } from './toastBehavior'

describe('toast lifetime', () => {
  it('keeps connection and authentication errors visible until dismissed', () => {
    expect(shouldPersistToast('Realtime сообщений недоступен')).toBe(true)
    expect(shouldPersistToast('Ошибка авторизации')).toBe(true)
  })

  it('allows ordinary operation errors and success notices to auto-dismiss', () => {
    expect(shouldPersistToast('Не удалось сохранить имя')).toBe(true)
    expect(shouldPersistToast('Не удалось отправить запрос')).toBe(false)
    expect(shouldPersistToast('Запрос отправлен')).toBe(false)
  })
})
