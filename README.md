# Milly

Минималистичный приватный мессенджер для небольшого круга друзей. Клиент — React, TypeScript и Vite; аккаунты, база, realtime, файлы и функции — Supabase; голос — WebRTC с временными TURN-учётными данными.

## Возможности

- Регистрация по email и паролю, профиль, неизменяемый числовой ID (`#1`) и настраиваемый юзернейм (`@username`).
- Поиск друзей по началу юзернейма или числовому ID, запросы и подтверждение дружбы.
- Личные диалоги, история с подгрузкой по 50 сообщений, новые сообщения через Supabase Realtime.
- Закрытые пространства для друзей, текстовые каналы и реакции на сообщения.
- Фотографии JPEG, PNG, WebP, GIF и AVIF до 8 МБ в приватном Storage; превью и подписанные ссылки.
- Индикаторы присутствия друзей через отдельные приватные Realtime-каналы.
- Настоящие аудиозвонки WebRTC, входящий вызов, принятие, отклонение, отключение микрофона и завершение вызова.
- PWA manifest и адаптивный интерфейс для широких экранов и телефонов.
- SQL-миграция включает RLS, приватные бакеты, запросы друзей, чаты и сигналинг.

В приложении нет сквозного шифрования сообщений или звонков. WebRTC передаёт звук напрямую, если позволяет сеть; при использовании TURN звуковой поток проходит через ваш TURN-сервер. Не публикуйте Supabase `service_role` или секрет coturn в клиентском `.env`.

## Требования

- Node.js 20.19+ и npm.
- Проект Supabase.
- Для надёжных звонков в разных сетях — TURN-сервис. Можно использовать coturn на своём сервере или облачный TURN-провайдер; без TURN прямое соединение STUN может не пройти через NAT и firewall.

## Локальный запуск

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

До настройки Supabase появится экран с подсказкой. Задайте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` в `.env.local` и перезапустите Vite. Значения доступны в Supabase **Project Settings → API**. Используйте только публичный publishable/anon key; `service_role` сюда не подходит.

Проверки:

```powershell
npm test
npm run build
```

Vitest проверяет правила регистрации, формат юзернейма и размеры/типы изображений. E2E-тестов нет: realtime и звонки нужно проверить между двумя реальными аккаунтами и разными сетями.

## Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com) и выберите регион рядом с участниками.
2. Для нового проекта выполните миграции по порядку: `202610260001_milly_mvp.sql`, `202610270001_public_ids_and_usernames.sql`, `202610270002_fix_realtime_and_initial_ids.sql`, `202610270003_swap_known_user_ids.sql`, `202610270004_private_channels_and_reactions.sql`, `202610270005_admin_profile_controls.sql` и `202610270006_admin_space_management.sql`.
   Для уже работающего проекта не запускайте применённые миграции повторно: примените только ещё не применённые миграции `004`, `005` и `006`. Миграция `004` создаёт закрытые пространства, каналы, сообщения каналов, реакции и RLS-политики. Миграция `005` добавляет подтверждённые профили, дополнительные username и защищённую админ-панель для аккаунта Sharkez. Миграция `006` добавляет описания и управление пространствами/текстовыми каналами из админки. Изменение числа участников меняет только отображаемую цифру, а системная дата регистрации и фактический состав пространств остаются неизменными.
3. В **Authentication → URL Configuration** задайте правильный **Site URL** и добавьте `http://localhost:5173/**` и production URL с `/**` в **Redirect URLs**. Ссылка подтверждения возвращает пользователя на адрес текущего приложения; в production укажите его HTTPS-домен.
4. Запишите Project URL и публичный publishable/anon key в `.env.local`.
5. Создайте два аккаунта, обменяйтесь `#ID` или `@username`, примите запрос, проверьте личные сообщения, реакции и попытку доступа постороннего аккаунта. Затем примените миграцию каналов и создайте закрытое пространство с другом.

Вместо SQL Editor можно подключить Supabase CLI: `npx supabase login`, `npx supabase link --project-ref YOUR_PROJECT_REF`, `npx supabase db push`. Миграции добавления столбцов не запускайте повторно.

Профиль создаётся auth trigger-ом и получает постоянный числовой ID и юзернейм формата `@member1`; юзернейм можно поменять в профиле. Email не хранится в профилях и не возвращается поиском. Изображения лежат в приватных бакетах и читаются по короткоживущим подписанным URL. RLS — основная граница доступа, а не проверки в браузере.

Чтобы настроить письмо подтверждения, откройте **Authentication → Email Templates → Confirm signup** в Supabase, укажите тему `Подтвердите почту для Milly` и вставьте содержимое `supabase/templates/confirmation.html` в поле шаблона. Шаблон использует стандартную ссылку `{{ .ConfirmationURL }}`. Новые регистрации получают redirect URL текущего сайта с отметкой об успешном подтверждении; пользователь увидит сообщение об этом после перехода.

## TURN и звонки

STUN fallback включён, но не проходит через все NAT и корпоративные файрволы. Для звонков без собственного VPS можно использовать [Metered Open Relay](https://www.metered.ca/tools/openrelay/); проверьте актуальные квоты и условия бесплатного тарифа у провайдера. Создайте аккаунт и возьмите TURN credentials endpoint вида `https://ВАШ_ПРОЕКТ.metered.live/api/v1/turn/credentials` и API key в панели Metered.

Сохраните URL и API key только в Supabase Edge Function secrets, затем задеплойте функцию:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set TURN_CREDENTIALS_URL="https://ВАШ_ПРОЕКТ.metered.live/api/v1/turn/credentials" TURN_CREDENTIALS_API_KEY="ВАШ_API_KEY"
npx supabase functions deploy turn-credentials
```

Функция запрашивает короткоживущие TURN credentials у провайдера на серверной стороне; API key не передаётся браузеру. Не помещайте его в `.env.local`, Cloudflare Pages или GitHub.

Альтернативно настройте coturn с REST-аутентификацией общим секретом. Пример основы конфигурации сервера:

```text
realm=turn.example.com
fingerprint
use-auth-secret
static-auth-secret=GENERATE_A_LONG_RANDOM_SECRET
listening-port=3478
tls-listening-port=5349
```

Настройте firewall для `3478/udp`, `3478/tcp`, `5349/tcp` с TLS-сертификатом и диапазона UDP relay-портов coturn. Требуются DNS-имя, публичная маршрутизация и корректные правила firewall/NAT.

Передайте секреты **только** в Supabase Edge Function secrets:

```powershell
npx supabase secrets set TURN_URLS="turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp" TURN_SHARED_SECRET="ВАШ_СЕКРЕТ_COTURN" TURN_TTL_SECONDS="900"
npx supabase functions deploy turn-credentials
```

Функция `supabase/functions/turn-credentials/index.ts` проверяет Supabase session, создаёт coturn REST username с временем истечения и HMAC-SHA1 password и отдаёт credentials на 5–60 минут. `TURN_SHARED_SECRET` не попадает в клиентский bundle. Без настроенного TURN интерфейс сообщает об этом и пробует STUN; успешный вызов не гарантирован. Проверяйте два устройства в разных сетях.

Для доступа к микрофону опубликованный сайт должен работать по HTTPS; `localhost` разрешён браузерами для разработки. На задержку влияют сети и регион, одинаковый низкий ping гарантировать нельзя.

## Публикация

1. Выполните `npm test` и `npm run build`.
2. Разместите каталог `dist/` на статическом хостинге, включите HTTPS и настройте SPA fallback на `/index.html`.
3. Добавьте production URL в Supabase Auth redirect URLs. В настройках сборки задайте `VITE_SUPABASE_URL` и публичный `VITE_SUPABASE_ANON_KEY`.
4. Деплойте функцию `turn-credentials`; держите TURN-секрет только в Edge Function secrets.
5. Проверьте регистрацию, приглашение, RLS и Storage, realtime, звонки через разные сети и установку PWA.

Ограничения: нет E2EE, видеозвонков, групповых чатов, offline-кэша и автоматических E2E-тестов. Сборка и тесты в этой рабочей среде не запускались: Node.js/npm не установлены.