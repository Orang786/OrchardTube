# OrchardTube 🍊

Видеоплатформа с оранжевым характером: фронтенд на чистом HTML/CSS/JS (без сборки), бэкенд на Express + MongoDB.
Демо-данных нет — всё создают пользователи: входят через Google (Gmail), заводят свой канал, загружают видео,
ставят лайки, подписываются и комментируют.

## Запуск локально

1. `npm install`
2. Скопируйте `.env.example` в `.env` и заполните `MONGODB_URI` и `GOOGLE_CLIENT_ID` (см. ниже).
3. `npm start` и откройте http://localhost:8777

## Вход через Google: как получить GOOGLE_CLIENT_ID

1. Откройте [Google Cloud Console](https://console.cloud.google.com/) и создайте проект.
2. **APIs & Services → OAuth consent screen**: тип External, укажите название приложения и свою почту.
   Пока приложение в режиме Testing, входить смогут только добавленные тестовые пользователи — для открытого
   доступа нажмите **Publish app** (для входа по имени и почте проверка Google не требуется).
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. В **Authorised JavaScript origins** добавьте адреса сайта: `http://localhost:8777` для разработки и
   `https://<ваш-сервис>.onrender.com` для продакшена. Redirect URI не нужен.
5. Скопируйте **Client ID** (вида `123…apps.googleusercontent.com`) в переменную `GOOGLE_CLIENT_ID`.

## Деплой на Render

В репозитории есть `render.yaml` (Blueprint). Создайте Blueprint из репозитория и задайте `MONGODB_URI` и
`GOOGLE_CLIENT_ID`; `SESSION_SECRET` сгенерируется сам. Не забудьте добавить адрес
`https://<сервис>.onrender.com` в «Authorised JavaScript origins» в Google Cloud Console.
Бесплатный сервис Render засыпает после 15 минут простоя — первая загрузка занимает до минуты.

## Как это устроено

- Вход: Google ID-токен проверяется на сервере (`auth.js`), дальше — подписанная httpOnly-cookie на 30 дней.
  Пароли не хранятся. Запросы с изменением данных принимаются только со своего сайта (SameSite=Lax + проверка Origin).
- У каждого пользователя один канал (адрес `@handle` выбирается при создании и не меняется).
- Видео и превью хранятся в MongoDB GridFS и отдаются с поддержкой перемотки (Range).
- Лайки и подписки — по одному на пользователя; просмотры — один на IP за 30 минут.
- Лимиты в памяти: 10 загрузок в час, 30 комментариев за 10 минут и т. п. (на один экземпляр сервера).
- Локально в браузере хранятся только тема, «Смотреть позже», история и дизлайки.

## API

| Метод и путь | Доступ | Назначение |
|---|---|---|
| `GET /api/config`, `/api/health` | все | клиентский ID Google, статус |
| `GET /api/bootstrap` | все | видео и каналы |
| `GET /api/me` | все | текущий пользователь, канал, лайки, подписки |
| `POST /api/auth/google`, `/api/auth/logout` | все | вход и выход |
| `POST/PATCH /api/channel` | вошедший | создать / изменить свой канал |
| `POST /api/videos` | владелец канала | загрузка (multipart: `title`, `desc`, `category`, `duration`, `thumb`, `video`) |
| `DELETE /api/videos/:id` | автор | удалить видео |
| `GET /api/media/:id` | все | видеофайл или превью (Range) |
| `POST /api/videos/:id/view` | все | просмотр |
| `POST /api/videos/:id/like` | вошедший | `{ on: true/false }` |
| `GET/POST /api/videos/:id/comments` | чтение — все, запись — вошедший | комментарии |
| `DELETE /api/comments/:id` | автор комментария или видео | удалить комментарий |
| `POST /api/channels/:id/subscribe` | вошедший | `{ on: true/false }` |

## Структура

```
index.html        разметка
css/styles.css    стили
js/app.js         клиентское приложение (роутер, страницы, плеер, вход)
js/icons.js       SVG-спрайт
server.js         Express: API и раздача фронтенда (только index.html, css/, js/)
auth.js           сессии и проверка токена Google
db.js             слой данных: MongoDB + GridFS
render.yaml       Blueprint для Render
```

## Что дальше

Модерация и жалобы, ответы на комментарии, плейлисты, поиск на стороне сервера, транскодирование видео.
