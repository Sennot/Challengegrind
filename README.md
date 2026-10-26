# ChallengeGrind

Список челленджей Geometry Dash. Стек: Vite + React + TypeScript + Tailwind v4 + Framer Motion + Supabase, хостинг на Cloudflare Pages.

## Локальный запуск

```bash
npm install
cp .env.example .env   # заполнить VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
npm run dev
```

## Настройка Supabase (один раз)

1. Создайте проект на https://supabase.com.
2. Примените миграции `supabase/migrations/0001…` по порядку — в **SQL Editor** или скриптом:
   ```bash
   node scripts/db.mjs supabase/migrations/0006_security_hardening.sql   # нужен SUPABASE_DB_PASSWORD в .env
   ```
3. **Authentication → Sign In / Providers → Email**:
   - выключите **Confirm email** (входим по нику, почты нет);
   - **Minimum password length** → 8.
4. **Project Settings → API** → URL проекта и publishable-ключ в `.env`.
5. Зарегистрируйтесь на сайте под своим ником, затем выдайте себе роль владельца:
   ```sql
   update public.profiles set role = 'owner' where lower(username) = lower('ВАШ_НИК');
   ```
6. Edge Function для сброса паролей (нужен [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase secrets set SB_SECRET_KEY=sb_secret_... ALLOWED_ORIGIN=https://<ваш-сайт>.pages.dev
   supabase functions deploy admin-reset-password --no-verify-jwt   # токен проверяется внутри функции
   ```

## Безопасность

- Все права проверяются **в базе** (RLS, права на колонки, `security definer` функции). Интерфейс можно подменить
  в DevTools — это ничего не даёт: данные и действия всё равно проверяет сервер.
- `node scripts/security-test.mjs` — атакующие тесты прав (аноним, игрок, бан, каждая роль). Всё в одной транзакции
  с откатом, данные не меняются. Запускайте после каждой миграции.
- Забаненный стафф теряет все права; бан разлогинивает игрока на всех устройствах.
- Почта аккаунта всегда `<ник>@users.challengegrind.local` и не может быть изменена — ник нельзя «занять» или угнать.
- Видео рекордов — только YouTube / Telegram.
- `public/_headers` — CSP и прочие заголовки для Cloudflare Pages.
- Секреты (`SUPABASE_DB_PASSWORD`, `sb_secret_…`) — **никогда** с префиксом `VITE_`: такие переменные попадают в сайт.
- Перед запуском включите **Captcha (Turnstile)**: Supabase → Authentication → Attack Protection, и `VITE_TURNSTILE_SITE_KEY`.

## Деплой на Cloudflare Pages

- Framework preset: **Vite**, build command `npm run build`, output `dist`.
- Переменные окружения: те же `VITE_*`, что в `.env`.
- SPA-роутинг работает автоматически (Pages отдаёт `index.html` для неизвестных путей).

## Роли

| Роль | Права |
|---|---|
| List Helper | проверка рекордов |
| List Moderator | + добавление / перемещение / удаление / редактирование уровней |
| List Admin | + выдача ролей ниже своей, баны, сброс паролей, правила |
| Owner | всё; выдаётся только через SQL |

## Очки

`100 × 0.965^(позиция − 1)` — функция `public.level_points` в SQL и `src/lib/points.ts` на фронте (держать одинаковыми).

Верификация считается прохождением уровня (в профиле, в галочках списка и в паках).

## Паки

Паки создают List Moderator+ в админке (вкладка Packs): название, цвет, уровни и бонусные очки; паки можно менять и удалять в любой момент.
Все паки с прогрессом игрока — на странице `/packs`.
Игрок получает бонус, пока у него пройдены все уровни пака (принятый рекорд или верификация): лидерборд считает
это на лету (`public.leaderboard.pack_bonus`), так что новый уровень в паке забирает бонус до его прохождения.

## Telegram-бот (@challengegrind_bot)

Edge Function `supabase/functions/telegram-bot` (миграция `0017_telegram_bot.sql`), разворачивается без CLI:
`node scripts/deploy-function.mjs telegram-bot` — нужен `SUPABASE_ACCESS_TOKEN` и переменные бота в `.env` (см. `.env.example`).
Скрипт ставит секреты функции, webhook и меню команд; адрес функции и внутренний секрет пишет в `public.telegram_config`.

- Личка: `/login` (ник → пароль, сообщение с паролем бот удаляет, 5 попыток в час), уведомления с сайта, `/me`, `/notify on|off`, `/logout`.
- Группа: `/top`, `/level`, `/search`, `/players`, `/player`, `/packs`, `/pack`, `/random`; changelog и новые паки — в тему из `telegram_config`.
- Чат стаффа (`staff_chat_id` в `telegram_config`): новые рекорды с кнопками Accept/Reject (List Helper+, вошедшие в бота), заявки уровней — Reject (List Moderator+).
- База шлёт события в функцию через `pg_net` (`public.tg_emit`); пароль проверяется по хешу в `public.tg_check_password`.
