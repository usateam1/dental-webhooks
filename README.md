# 🦷 Dental Webhook Server v2 — PostgreSQL Edition

Сервер с **постоянным хранилищем данных** через бесплатный PostgreSQL на Neon.tech.
Деплоится на Railway.app (или Render) за ~10 минут.

---

## 🏗️ Архитектура

```
Сайт → POST /pending → PostgreSQL (Neon.tech, бесплатно)
                                ↓
             Telegram Bot → вы нажимаете ✅/❌
                                ↓
         GET /approved → сайт показывает отзывы
```

---

## Шаг 1 — Создать бесплатную базу данных на Neon.tech

1. Откройте **[neon.tech](https://neon.tech)** → Sign Up (бесплатно, через GitHub)
2. Нажмите **New Project** → назовите `dental-db`
3. Выберите регион ближайший к вам (например, EU Frankfurt)
4. После создания откройте вкладку **Connection Details**
5. Скопируйте строку подключения — она выглядит так:
   ```
   postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   Это ваш `DATABASE_URL` — сохраните его!

> Neon.tech бесплатно навсегда: 0.5 GB хранилища, 500 часов compute/месяц.

---

## Шаг 2 — Загрузить код на GitHub

1. Откройте [github.com](https://github.com) → **New repository**
2. Назовите: `dental-webhook` → Create
3. Нажмите **uploading an existing file**
4. Загрузите `server.js` и `package.json`
5. **Commit changes**

---

## Шаг 3 — Задеплоить на Railway

1. Откройте [railway.app](https://railway.app) → Sign Up через GitHub
2. **New Project → Deploy from GitHub repo**
3. Выберите `dental-webhook`
4. Railway автоматически определит Node.js и запустит `npm start`
5. После деплоя перейдите в **Settings → Networking → Generate Domain**
6. Скопируйте ваш URL (например `https://dental-webhook-production.up.railway.app`)

> ⚠️ Railway даёт $5 бесплатных кредитов при регистрации (≈ 30 дней).
> После этого — от $5/мес. Если хотите полностью бесплатно — используйте Render.com
> (инструкция в README предыдущей версии архива).

---

## Шаг 4 — Переменные окружения на Railway

В Railway → ваш сервис → **Variables** → добавьте:

| Переменная | Значение | Обязательна? |
|-----------|----------|-------------|
| `DATABASE_URL` | строка из Neon.tech | ✅ |
| `ADMIN_KEY` | придумайте пароль | ✅ |
| `TG_TOKEN` | токен Telegram бота | ❌ |
| `TG_CHATID` | ваш Telegram chat ID | ❌ |

После добавления Railway автоматически перезапустит сервис.

---

## Шаг 5 — Обновить URL в index.html

Найдите строку в вашем `index.html`:
```js
const WEBHOOK_URL = 'https://dental-webhook.onrender.com';
```
Замените на ваш Railway URL:
```js
const WEBHOOK_URL = 'https://dental-webhook-production.up.railway.app';
```

---

## Шаг 6 — Проверить что всё работает

Откройте в браузере:
```
https://ВАШ_URL/
```
Должны увидеть:
```json
{"status":"ok","pending":0,"approved":0}
```

---

## 🖥️ Панель модерации

```
https://ВАШ_URL/admin?key=ВАШ_ADMIN_KEY
```

Здесь можно одобрять и отклонять отзывы прямо в браузере.

---

## 🤖 Настройка Telegram-уведомлений (опционально)

1. Напишите [@BotFather](https://t.me/BotFather) → `/newbot` → получите токен (`TG_TOKEN`)
2. Узнайте ваш chat ID: напишите [@userinfobot](https://t.me/userinfobot)
3. Добавьте оба значения в переменные Railway
4. Зарегистрируйте webhook для кнопок (вставьте в браузер, заменив значения):
   ```
   https://api.telegram.org/botВАШ_ТОКЕН/setWebhook?url=https://ВАШ_URL/tg-webhook
   ```

После этого при каждом новом отзыве вам придёт сообщение с кнопками ✅/❌ прямо в Telegram.

---

## 📊 Разница с предыдущей версией (v1 на /tmp)

| | v1 (файлы /tmp) | v2 (PostgreSQL) |
|--|--|--|
| Хранение | Временное (сброс при рестарте) | Постоянное |
| База | Файлы JSON | PostgreSQL |
| Надёжность | ⚠️ | ✅ |
| Цена БД | Бесплатно | Бесплатно (Neon) |
