# Квартал — backend

Единое приложение на Node.js, Express и PostgreSQL. Backend отдаёт файлы frontend и REST API с одного адреса. Авторизация построена на JWT, данные и правила доступа — на PostgreSQL.

## Структура

```text
backend/
├── src/
│   ├── config/        подключение к БД и переменные окружения
│   ├── controllers/   обработка HTTP-запросов
│   ├── db/            SQL для создания БД и схемы
│   ├── middleware/    JWT, роли, валидация, ошибки
│   ├── routes/        маршруты REST API
│   ├── schemas/       схемы проверки входных данных
│   ├── services/      бизнес-логика и SQL-запросы
│   ├── app.js         настройка Express
│   └── server.js      запуск сервера
├── package.json
├── package-lock.json
├── postman/            коллекция запросов
└── .env.example
```

## Подготовка через DBeaver

1. Запустите локальный PostgreSQL.
2. Подключитесь в DBeaver к базе `postgres` от пользователя-администратора.
3. Откройте `src/db/create-database.sql`, самостоятельно задайте пароль и выполните две команды.
   В DBeaver включите Auto-commit или выполняйте `CREATE ROLE` и `CREATE DATABASE` по отдельности.
4. Создайте новое подключение:
   - Host: `localhost`
   - Port: `5432`
   - Database: `kvartal`
   - Username: `kvartal_app`
   - Password: тот же, что указан в SQL.
5. В этом подключении откройте и выполните `src/db/schema.sql`.
6. Обновите Database Navigator. Должны появиться таблицы `users`, `listings`, `listing_photos`, `favorites`, `conversations`, `messages`, `moderation_records` и остальные.
7. В таблице `users` появятся записи только после регистрации через API или frontend.

Если база была создана до 17.11.2026, вместо повторного выполнения всей схемы
откройте и выполните `src/db/upgrade-2026-11-17.sql`. Скрипт добавляет статус
закрытого объявления и таблицу оценок продавцов, не удаляя существующие данные.

Схему связей можно посмотреть в DBeaver через контекстное меню базы → **View Diagram**.

## Запуск API

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

Откройте `http://localhost:3000`. Этой же командой запускается frontend и API.

При первом `npm install` автоматически создаются:

- `backend/node_modules/` — файлы библиотек, вручную редактировать их не нужно;
- `backend/package-lock.json` — точные версии зависимостей;
- служебные файлы npm в пользовательском кэше за пределами проекта.

Файл `.env` библиотеками не создаётся: его нужно скопировать из `.env.example` один раз и заполнить самостоятельно.

## Основные маршруты

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
PATCH  /api/users/me
GET    /api/users/me/preferences
PUT    /api/users/me/preferences

GET    /api/listings
GET    /api/listings/mine
GET    /api/listings/:id
POST   /api/listings
PATCH  /api/listings/:id
PATCH  /api/listings/:id/close
DELETE /api/listings/:id

GET    /api/favorites
POST   /api/favorites/:listingId
DELETE /api/favorites/:listingId

GET    /api/chats
POST   /api/chats
GET    /api/chats/:id/messages
POST   /api/chats/:id/messages
POST   /api/chats/:id/rating

GET    /api/moderation/listings
GET    /api/moderation/listings/:id
POST   /api/moderation/listings/:id/decision
```

Приватные маршруты принимают заголовок:

```text
Authorization: Bearer <JWT>
```

При регистрации пароль должен содержать не менее 8 символов, заглавную и
строчную буквы, цифру и специальный символ. В PostgreSQL сохраняется только
хеш bcrypt; исходный пароль не записывается.

Оценка продавца доступна покупателю после обмена сообщениями в конкретном
диалоге. Она выставляется по шкале от 1 до 5. Итоговый рейтинг объединяет
среднюю оценку покупателей и долю ответов продавца в чате в течение 24 часов.

Модератор создаётся SQL-командой:

```sql
UPDATE users SET role = 'moderator' WHERE email = 'EMAIL_ПОЛЬЗОВАТЕЛЯ';
```

Предпочтения из опросника сохраняются через `PUT /api/users/me/preferences`. Направления можно передавать кодами `N/E/S/W` или строками `Север/Восток/Юг/Запад`.

Поле `photos` принимает массив URL или путей к загруженным файлам. Для учебной версии также допускаются data URL, поэтому текущая загрузка фотографии профиля и объявления сможет работать без отдельного файлового сервера.

## Postman

1. Запустите backend.
2. В Postman выберите **Import**.
3. Импортируйте `backend/postman/Kvartal.postman_collection.json`.
4. В Variables задайте `userEmail` и `userPassword`.
5. Выполните `Регистрация`. Токен сохранится автоматически.
6. Выполните `Создать объявление`. Идентификатор сохранится в `listingId`.
7. Дальше проверяйте `Мои объявления`, `Избранное` и остальные запросы.

Для проверки модерации назначьте роль и войдите заново:

```sql
UPDATE users SET role = 'moderator' WHERE email = 'EMAIL_ПОЛЬЗОВАТЕЛЯ';
```

## Карта и адреса

При создании или изменении объявления backend отправляет адрес в OpenStreetMap Nominatim и сохраняет `latitude` и `longitude` в PostgreSQL. Frontend показывает найденные координаты на карте Leaflet.

Для карты нужен интернет. Публичный Nominatim не следует вызывать массовыми запросами: в текущей версии геокодирование выполняется только при создании и изменении объявления.
