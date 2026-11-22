/* OrchardTube — демо-данные */

const CHANNELS = {
  orchardtech: {
    name: "OrchardTech", handle: "@orchardtech", avatar: "ОТ", color: "#ff6b00",
    subs: "1,24 млн", subsNum: 1240000, verified: true,
    banner: ["#ff9a3c", "#f25c00"], joined: "12 мар. 2020 г.",
    views: "84 512 346 просмотров", videoCount: 128,
    description: "Строим цифровой сад: код, техника, продуктивность и немного оранжевого настроения. Новые видео каждую пятницу."
  },
  naturevibes: {
    name: "Nature Vibes", handle: "@naturevibes", avatar: "NV", color: "#2e9e6b",
    subs: "780 тыс.", subsNum: 780000, verified: true,
    banner: ["#5fd0a0", "#1c7a55"], joined: "3 июн. 2019 г.",
    views: "42 118 902 просмотра", videoCount: 94,
    description: "Спокойные пейзажи, звуки природы и 4K-релаксация для работы и сна."
  },
  codegarden: {
    name: "Code Garden", handle: "@codegarden", avatar: "CG", color: "#3b82f6",
    subs: "512 тыс.", subsNum: 512000, verified: true,
    banner: ["#6cb2ff", "#2563eb"], joined: "18 сент. 2018 г.",
    views: "31 776 210 просмотров", videoCount: 176,
    description: "Учимся программировать без воды: JavaScript, React, архитектура и разборы реальных проектов."
  },
  gameplay: {
    name: "GamePort", handle: "@gameport", avatar: "GP", color: "#8b5cf6",
    subs: "2,4 млн", subsNum: 2400000, verified: true,
    banner: ["#b794ff", "#6d28d9"], joined: "7 февр. 2017 г.",
    views: "312 908 441 просмотр", videoCount: 640,
    description: "Обзоры, топы и разборы игр. Без спойлеров, но с эмоциями."
  },
  designnest: {
    name: "Design Nest", handle: "@designnest", avatar: "DN", color: "#ec4899",
    subs: "210 тыс.", subsNum: 210000, verified: false,
    banner: ["#ff9ecb", "#db2777"], joined: "21 нояб. 2021 г.",
    views: "9 402 118 просмотров", videoCount: 58,
    description: "Дизайн интерфейсов, цвет, типографика и вдохновение на каждый день."
  },
  chillorchard: {
    name: "Chill Orchard", handle: "@chillorchard", avatar: "CO", color: "#6366f1",
    subs: "3,1 млн", subsNum: 3100000, verified: true,
    banner: ["#a5b4fc", "#4338ca"], joined: "2 апр. 2016 г.",
    views: "204 331 900 просмотров", videoCount: 212,
    description: "Lofi, ambient и спокойные миксы для учёбы, работы и крепкого сна."
  },
  databites: {
    name: "Data Bites", handle: "@databites", avatar: "DB", color: "#0d9488",
    subs: "430 тыс.", subsNum: 430000, verified: true,
    banner: ["#5eead4", "#0f766e"], joined: "15 янв. 2020 г.",
    views: "27 008 733 просмотра", videoCount: 81,
    description: "Объясняем данные, аналитику и алгоритмы простым языком."
  },
  tastylab: {
    name: "Tasty Lab", handle: "@tastylab", avatar: "TL", color: "#f59e0b",
    subs: "1,8 млн", subsNum: 1800000, verified: true,
    banner: ["#fcd34d", "#d97706"], joined: "9 июл. 2018 г.",
    views: "158 902 004 просмотра", videoCount: 340,
    description: "Проверенные рецепты, которые получаются с первого раза."
  },
  techweekly: {
    name: "Tech Weekly", handle: "@techweekly", avatar: "TW", color: "#64748b",
    subs: "320 тыс.", subsNum: 320000, verified: true,
    banner: ["#94a3b8", "#334155"], joined: "5 мая 2019 г.",
    views: "18 442 190 просмотров", videoCount: 210,
    description: "Главные новости технологий за неделю — коротко и по делу."
  },
  runclub: {
    name: "Run Club", handle: "@runclub", avatar: "RC", color: "#ef4444",
    subs: "690 тыс.", subsNum: 690000, verified: false,
    banner: ["#fca5a5", "#b91c1c"], joined: "12 авг. 2020 г.",
    views: "44 219 087 просмотров", videoCount: 119,
    description: "Бег без мифов: тренировки, экипировка и честные отчёты."
  },
  wander: {
    name: "Wander", handle: "@wander", avatar: "WA", color: "#0ea5e9",
    subs: "1,1 млн", subsNum: 1100000, verified: true,
    banner: ["#7dd3fc", "#0369a1"], joined: "27 окт. 2017 г.",
    views: "96 320 511 просмотров", videoCount: 143,
    description: "Медленные путешествия по красивым местам планеты."
  },
  humorhub: {
    name: "Humor Hub", handle: "@humorhub", avatar: "HH", color: "#eab308",
    subs: "2,9 млн", subsNum: 2900000, verified: true,
    banner: ["#fde047", "#a16207"], joined: "1 апр. 2015 г.",
    views: "418 220 067 просмотров", videoCount: 512,
    description: "Стендап, скетчи и всё, что помогает пережить рабочий день."
  },
  gadgetzone: {
    name: "Gadget Zone", handle: "@gadgetzone", avatar: "GZ", color: "#475569",
    subs: "940 тыс.", subsNum: 940000, verified: true,
    banner: ["#cbd5e1", "#1e293b"], joined: "14 февр. 2019 г.",
    views: "102 774 332 просмотра", videoCount: 288,
    description: "Честные обзоры техники без рекламных пауз."
  },
  zenspace: {
    name: "Zen Space", handle: "@zenspace", avatar: "ZS", color: "#a78bfa",
    subs: "1,5 млн", subsNum: 1500000, verified: true,
    banner: ["#ddd6fe", "#7c3aed"], joined: "8 дек. 2018 г.",
    views: "77 019 442 просмотра", videoCount: 96,
    description: "Йога, дыхание и практики осознанности для спокойной жизни."
  },
  cosmos: {
    name: "Cosmos", handle: "@cosmos", avatar: "CS", color: "#1e3a8a",
    subs: "4,2 млн", subsNum: 4200000, verified: true,
    banner: ["#818cf8", "#1e1b4b"], joined: "19 июн. 2016 г.",
    views: "389 442 118 просмотров", videoCount: 74,
    description: "Вселенная, физика и большие вопросы — визуально и понятно."
  }
};

const VIDEOS = [
  {
    id: "setup-2026",
    title: "Собрал идеальный сетап для программирования в 2026 году",
    channel: "orchardtech", views: 1240000, viewsText: "1,2 млн просмотров", ago: "3 дня назад",
    duration: "18:42", category: "Технологии", emoji: "💻", g1: "#ffb347", g2: "#f25c00",
    watched: 0.42, likes: 48200,
    desc: "Показываю рабочий стол, мониторы, клавиатуру и мелочи, которые реально влияют на продуктивность. Таймкоды и ссылки — ниже.\n\n00:00 — вступление\n01:12 — стол и освещение\n05:40 — мониторы\n09:18 — клавиатура и мышь\n13:05 — софт и настройки\n16:20 — итоги"
  },
  {
    id: "dawn-orchard",
    title: "Рассвет над фруктовыми садами — 4K релакс без музыки",
    channel: "naturevibes", views: 860000, viewsText: "860 тыс. просмотров", ago: "2 недели назад",
    duration: "1:02:15", category: "Путешествия", emoji: "🌅", g1: "#7bd8a8", g2: "#166b4c",
    watched: 0.18, likes: 21000,
    desc: "Час настоящего утра: туман в садах, птицы и первые лучи солнца. Идеально для работы, медитации или фона."
  },
  {
    id: "youtube-js",
    title: "Пишем свой YouTube на JavaScript за час — полный разбор",
    channel: "codegarden", views: 412000, viewsText: "412 тыс. просмотров", ago: "5 дней назад",
    duration: "1:04:22", category: "Обучение", emoji: "⚛️", g1: "#7cb8ff", g2: "#1d4ed8",
    watched: 0.07, likes: 18700,
    desc: "Собираем интерфейс видеоплатформы с нуля: сетка, карточки, поиск, фильтры и страница просмотра. Код в описании, без фреймворков."
  },
  {
    id: "games-2026",
    title: "Топ-10 игр 2026 года, которые взорвали индустрию",
    channel: "gameplay", views: 2100000, viewsText: "2,1 млн просмотров", ago: "1 день назад",
    duration: "24:18", category: "Игры", emoji: "🎮", g1: "#b794ff", g2: "#5b21b6",
    watched: 0.61, likes: 96400,
    desc: "Десять проектов, которые определили год: от инди-сенсаций до больших релизов. Спойлеров нет — только впечатления."
  },
  {
    id: "orange-guide",
    title: "Оранжевый — новый чёрный: полный гид по цвету",
    channel: "designnest", views: 128000, viewsText: "128 тыс. просмотров", ago: "4 дня назад",
    duration: "12:07", category: "Дизайн", emoji: "🎨", g1: "#ffb08a", g2: "#e11d48",
    likes: 8300,
    desc: "Как использовать оранжевый в интерфейсах, чтобы он не кричал, а работал: оттенки, контраст, акценты и типичные ошибки."
  },
  {
    id: "lofi-3h",
    title: "Lofi для работы и учёбы — 3 часа спокойной музыки",
    channel: "chillorchard", views: 5400000, viewsText: "5,4 млн просмотров", ago: "1 месяц назад",
    duration: "3:01:44", category: "Музыка", emoji: "🎧", g1: "#a5b4fc", g2: "#3730a3",
    watched: 0.33, likes: 132000,
    desc: "Три часа лоу-фая без резких переходов. Ставь на фон и занимайся своими делами."
  },
  {
    id: "algo",
    title: "Как на самом деле работает алгоритм рекомендаций",
    channel: "databites", views: 734000, viewsText: "734 тыс. просмотров", ago: "6 дней назад",
    duration: "16:35", category: "Технологии", emoji: "📊", g1: "#5eead4", g2: "#0f766e",
    likes: 31200,
    desc: "Разбираем, какие сигналы учитывает рекомендательная система, почему лента иногда странная и как ей пользоваться осознанно."
  },
  {
    id: "apple-pie",
    title: "Идеальный яблочный пирог: рецепт без ошибок",
    channel: "tastylab", views: 2800000, viewsText: "2,8 млн просмотров", ago: "3 недели назад",
    duration: "9:56", category: "Еда", emoji: "🥧", g1: "#fcd34d", g2: "#b45309",
    watched: 0.12, likes: 118000,
    desc: "Тесто, которое не рвётся, и начинка, которая не течёт. Пошаговый рецепт с граммовками и температурой."
  },
  {
    id: "tech-week",
    title: "Новости технологий за неделю: главное коротко",
    channel: "techweekly", views: 156000, viewsText: "156 тыс. просмотров", ago: "12 часов назад",
    duration: "8:12", category: "Новости", emoji: "📰", g1: "#94a3b8", g2: "#334155",
    likes: 4200,
    desc: "Пять главных событий недели в технологиях: анонсы, релизы и одна история, которую все обсуждают."
  },
  {
    id: "marathon",
    title: "Пробежал марафон без подготовки. Что пошло не так",
    channel: "runclub", views: 987000, viewsText: "987 тыс. просмотров", ago: "2 недели назад",
    duration: "21:40", category: "Спорт", emoji: "🏃", g1: "#fca5a5", g2: "#b91c1c",
    watched: 0.55, likes: 40200,
    desc: "Честный рассказ о 42 километрах, которые я не планировал. Ошибки, боли и выводы — с таймкодами."
  },
  {
    id: "react-20",
    title: "React за 20 минут: хуки, состояние и немного магии",
    channel: "codegarden", views: 623000, viewsText: "623 тыс. просмотров", ago: "1 месяц назад",
    duration: "20:03", category: "Обучение", emoji: "⚛️", g1: "#7dd3fc", g2: "#0e7490",
    likes: 35600,
    desc: "Быстрый, но честный обзор React: useState, useEffect, мемоизация и как не выстрелить себе в ногу."
  },
  {
    id: "iceland",
    title: "Исландия зимой: водопады, ледники и северное сияние",
    channel: "wander", views: 1500000, viewsText: "1,5 млн просмотров", ago: "1 месяц назад",
    duration: "28:14", category: "Путешествия", emoji: "🏔️", g1: "#a5d8f0", g2: "#075985",
    likes: 67400,
    desc: "Семь дней на острове: дорога по южному побережью, ледниковая лагуна и ночь, когда небо загорелось."
  },
  {
    id: "office-standup",
    title: "Стендап про офис: 15 минут боли и юмора",
    channel: "humorhub", views: 3200000, viewsText: "3,2 млн просмотров", ago: "2 месяца назад",
    duration: "15:22", category: "Юмор", emoji: "😂", g1: "#fde047", g2: "#a16207",
    watched: 0.8, likes: 204000,
    desc: "Про митинги, которые можно было заменить письмом, и про коллег, которые включают камеру без предупреждения."
  },
  {
    id: "phone-review",
    title: "Обзор нового смартфона: стоит ли менять свой?",
    channel: "gadgetzone", views: 445000, viewsText: "445 тыс. просмотров", ago: "2 дня назад",
    duration: "14:48", category: "Технологии", emoji: "📱", g1: "#cbd5e1", g2: "#1e293b",
    likes: 15900,
    desc: "Тесты камеры, экрана и автономности. Сравнение с прошлым поколением и честный вывод."
  },
  {
    id: "morning-yoga",
    title: "Утренняя йога за 20 минут — энергия на весь день",
    channel: "zenspace", views: 1900000, viewsText: "1,9 млн просмотров", ago: "3 месяца назад",
    duration: "20:00", category: "Спорт", emoji: "🧘", g1: "#ddd6fe", g2: "#6d28d9",
    likes: 88400,
    desc: "Мягкая последовательность для пробуждения тела. Без опыта — подойдёт. Понадобится коврик и 20 минут."
  },
  {
    id: "cosmos",
    title: "Масштабы вселенной: от атома до галактик",
    channel: "cosmos", views: 4100000, viewsText: "4,1 млн просмотров", ago: "5 месяцев назад",
    duration: "32:51", category: "Обучение", emoji: "🚀", g1: "#818cf8", g2: "#1e1b4b",
    watched: 0.23, likes: 231000,
    desc: "Путешествие по масштабам: планковская длина, атомы, люди, планеты, звёзды и границы наблюдаемого мира."
  },
  {
    id: "orchardtube-story",
    title: "Как мы построили OrchardTube за выходные",
    channel: "orchardtech", views: 342000, viewsText: "342 тыс. просмотров", ago: "1 неделя назад",
    duration: "22:10", category: "Технологии", emoji: "🍊", g1: "#ffc078", g2: "#e8590c",
    likes: 21400,
    desc: "История прототипа: дизайн-токены, сетка, карточки и оранжевый, который пришлось приручать."
  },
  {
    id: "desk-2026",
    title: "Мой рабочий стол 2026: минимализм и оранжевый",
    channel: "orchardtech", views: 187000, viewsText: "187 тыс. просмотров", ago: "3 недели назад",
    duration: "11:29", category: "Технологии", emoji: "🖥️", g1: "#ffd8a8", g2: "#c2410c",
    likes: 9800,
    desc: "Короткая экскурсия по столу: что осталось, что уехало в ящик и почему меньше — действительно лучше."
  },
  {
    id: "habits",
    title: "5 привычек, которые сделали меня продуктивнее",
    channel: "orchardtech", views: 521000, viewsText: "521 тыс. просмотров", ago: "1 месяц назад",
    duration: "13:37", category: "Обучение", emoji: "✅", g1: "#86efac", g2: "#15803d",
    likes: 28700,
    desc: "Пять простых привычек без магии: сон, планирование, прогулки, один важный task и цифровой детокс."
  },
  {
    id: "live-coding",
    title: "Пишем код в прямом эфире: рефакторим старый проект",
    channel: "orchardtech", views: 12000, watching: "1,2 тыс.", ago: "идёт сейчас",
    duration: "LIVE", category: "Прямые трансляции", live: true, emoji: "🔴", g1: "#ff8a65", g2: "#b71c1c",
    likes: 640,
    desc: "Стрим: разбираем легаси-компонент, чистим состояние и добавляем тесты. Заходи, задавай вопросы в чате."
  }
];

const SHORTS = [
  { id: "sh1", title: "CSS-трюк, который экономит 2 часа", views: "2,1 млн", emoji: "✨", g1: "#ffb347", g2: "#f25c00" },
  { id: "sh2", title: "Оранжевый сетап мечты", views: "890 тыс.", emoji: "🍊", g1: "#ffd8a8", g2: "#d9480f" },
  { id: "sh3", title: "Кот против клавиатуры", views: "12 млн", emoji: "🐱", g1: "#ffc9c9", g2: "#c92a2a" },
  { id: "sh4", title: "Рецепт за 30 секунд", views: "4,5 млн", emoji: "🥪", g1: "#ffe066", g2: "#e67700" },
  { id: "sh5", title: "Дыхание 4-7-8", views: "1,2 млн", emoji: "🌬️", g1: "#b2f2bb", g2: "#2b8a3e" },
  { id: "sh6", title: "Мини-тур по рабочему месту", views: "640 тыс.", emoji: "🖥️", g1: "#a5d8ff", g2: "#1864ab" }
];

const COMMENTS = [
  {
    author: "Алексей Морозов", avatar: "АМ", color: "#4285f4", ago: "2 дня назад", likes: 1240, pinned: true,
    text: "Сетап огонь, но больше всего зашла мысль про «одно важное дело в день». После этого видео попробовал — реально работает."
  },
  {
    author: "Марина К.", avatar: "МК", color: "#e91e63", ago: "1 день назад", likes: 486,
    text: "Таймкоды спасли. Пришла за клавиатурой, осталась за советами по свету 😄"
  },
  {
    author: "Dev Ivan", avatar: "ДИ", color: "#0d9488", ago: "3 дня назад", likes: 212,
    text: "Про мониторы хотелось бы отдельный ролик: как выбрать между 27\" 4K и 34\" ультрашироким для кода?"
  },
  {
    author: "Ольга Петрова", avatar: "ОП", color: "#8b5cf6", ago: "5 часов назад", likes: 97,
    text: "Смотрю на фоне и понимаю, что мой стол выглядит как филиал склада. Пора разбирать 🙈"
  },
  {
    author: "Nikita", avatar: "НК", color: "#f59e0b", ago: "20 минут назад", likes: 12,
    text: "Оранжевый на превью — топ. OrchardTube вообще приятно выглядит, поздравляю с запуском!"
  }
];

/* экспорт для Node (сид и API), в браузере переменные остаются глобальными */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHANNELS, VIDEOS, SHORTS, COMMENTS };
}
