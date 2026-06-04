## Что делаем

В Bloom-теме (`data-theme="bloom"`) добавляем по углам карточек разнообразные декоративные стикеры — сердечки, цветочки, бантики, звёздочки, бабочки. Каждый тип карточки получает свой стикер, чтобы не было однообразия.

В Classic-теме ничего не меняется.

## Стикеры (SVG inline в CSS)

Готовим набор из 6 стикеров, все ~26-30px, мягкие тени, лёгкая анимация:

- `sticker-heart` — розовое сердечко, пульсация (heart-beat)
- `sticker-flower` — пятилепестковый цветок, медленное вращение
- `sticker-bow` — розовый бантик, лёгкое покачивание
- `sticker-star` — золотая звёздочка, твинкл
- `sticker-butterfly` — бабочка, машет крыльями (scale Y)
- `sticker-cherry` — две вишенки, лёгкий свинг

Каждый — отдельная CSS-утилита: `.sticker-heart::after { content: ""; ... background-image: url("data:image/svg+xml,...") }`, активная только при `:root[data-theme="bloom"]`. Позиция — `top: 8px; right: 10px;` поверх карточки, `pointer-events: none`, `z-index: 3`.

## Где какие стикеры

Разносим стикеры по экранам, чтобы соседние карточки не повторялись:

**Главная (`/`):**
- Overview карточка → `sticker-flower`
- Continue карточка (продолжить ученика) → `sticker-heart`
- Метрики (4 карточки в ряд): `sticker-star`, `sticker-bow`, `sticker-butterfly`, `sticker-cherry`
- Следующий урок (если есть) → `sticker-heart`

**Ученики (`/students`):**
- Карточка студента → чередуем по индексу: heart → flower → bow → star → butterfly → cherry → (повтор)

**Расписание / Календарь:**
- Карточка дня → `sticker-flower`
- Карточка урока → `sticker-heart`

**Финансы / Посещаемость / Домашка / Аналитика:**
- Заголовочная карточка раздела → `sticker-flower`
- Карточка-итог → `sticker-star`
- Карточка-предупреждение (долги, пропуски) → оставляем без стикера (визуальный приоритет)

**Настройки:**
- ThemePicker (где выбор Classic/Bloom) → `sticker-bow`
- Уведомления, Курсы и т.д. → без стикеров (служебные блоки)

## Что не декорируем

- Кнопки, переключатели, инпуты
- Модалки и шиты (там и так много контента)
- Пустые состояния и алерты-ошибки
- Карточки с предупреждениями (долги, пропуски)
- В тёмном варианте Bloom стикеры остаются, но яркость слегка приглушается (`opacity: 0.75`)

## Файлы

Изменения:
- `src/styles.css` — 6 новых utility-классов `.sticker-*` с SVG-фонами и keyframes анимаций, активные только под `:root[data-theme="bloom"]`. Существующий `.bloom-corner` остаётся для обратной совместимости.
- `src/routes/_authenticated/index.tsx` — добавить классы стикеров к Overview, Continue, метрикам.
- `src/routes/_authenticated/students.tsx` — циклически назначать класс стикера карточкам учеников.
- `src/routes/_authenticated/schedule.tsx` + `src/components/calendar/Calendar.tsx` — стикеры на карточках уроков и днях.
- `src/routes/_authenticated/finance.tsx`, `attendance.tsx`, `homework.tsx`, `analytics.tsx` — стикер на главной карточке раздела.
- `src/components/settings/ThemePicker.tsx` — `sticker-bow` на блоке.

## Performance / доступность

- Все SVG — inline data-URI, ноль сетевых запросов.
- Анимации отключаются под `prefers-reduced-motion: reduce`.
- `aria-hidden` (псевдоэлементы по умолчанию недоступны скринридерам — ок).
