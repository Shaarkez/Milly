const persistentMessage = /realtime|подключ|соедин|авторизац|auth|несохран|не удалось сохран|network|connection/i

export function shouldPersistToast(message: string) {
  return persistentMessage.test(message)
}
