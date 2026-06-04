## Что делаем

Добавим в приложение две темы оформления:

- **Classic** — текущий дизайн (тёмно-синий, золотые акценты, liquid glass). Дефолт для мужчин и для всех, кто ещё не выбрал.
- **Bloom** — «девичья» тема: пастельно-розовая палитра, цветочные SVG-декорации на карточках, плавающие лепестки на фоне, рукописный/serif-заголовок, более скруглённые формы и мягкие тени. Дефолт для женщин.

После первой регистрации через Google спрашиваем пол → автоматически применяется соответствующая тема. Тема и пол сохраняются и доступны для смены в настройках профиля.

## База данных

Расширяем существующую таблицу `user_settings`:

- `gender` — `text`, nullable, допустимые значения: `'male' | 'female'` (валидация триггером).
- `theme` — `text`, NOT NULL, default `'classic'`, допустимые: `'classic' | 'bloom'`.
- `onboarding_completed` — `boolean`, NOT NULL, default `false`.

Запись в `user_settings` уже создаётся для каждого пользователя; если у текущего пользователя её нет — создаём при первом входе.

## Поток онбординга

1. Пользователь логинится через Google (поток `lovable.auth.signInWithOAuth` уже есть).
2. После редиректа в `_authenticated/route.tsx` (или в `index.tsx`) подгружаем `user_settings` через server fn.
3. Если `onboarding_completed = false` → редирект на новый роут `/_authenticated/onboarding`.
4. Экран онбординга: две большие карточки «Мужской / Женский» с превью соответствующей темы (мини-мокап).
5. По выбору: server fn записывает `gender`, `theme` (`male→classic`, `female→bloom`), `onboarding_completed = true` → редирект на `/`.

Существующие пользователи: при первом входе после релиза `onboarding_completed` будет `false` → пройдут онбординг один раз.

## Применение темы

Создаём `ThemeProvider` в `src/components/ThemeProvider.tsx`:

- Читает `theme` из `user_settings` (через TanStack Query, тот же ключ что и настройки).
- Ставит атрибут `data-theme="classic" | "bloom"` на `<html>`.
- Пока тема грузится — используем `classic` чтобы не было FOUC.

В `src/styles.css`:

- Текущие токены `:root` остаются как `classic` (или дублируются в `:root[data-theme="classic"]`).
- Добавляется блок `:root[data-theme="bloom"]` с переопределением semantic-токенов: `--background`, `--foreground`, `--primary`, `--accent`, `--card`, `--ring`, `--glass-bg`, `--radius` (увеличенный), плюс новые `--bloom-petal`, `--bloom-rose`, градиенты и тени.
- Палитра Bloom: пыльно-розовый фон (`oklch(~0.97 0.02 10)`), розово-лиловый primary (`~0.65 0.18 350`), мягкий персиковый accent, кремово-белые карточки. Все цвета в `oklch`.

## Декоративные элементы Bloom

Только когда `data-theme="bloom"`:

- Компонент `<BloomBackdrop />` в `__root.tsx` — fixed-слой с медленно плавающими SVG-лепестками (CSS keyframes, `prefers-reduced-motion` отключает анимацию).
- В `src/styles.css` добавить utility `.bloom-decor` — псевдоэлемент с цветочным SVG в углу карточек (через `@utility`, активный только под `[data-theme="bloom"]`).
- Заголовок-шрифт: подгрузить `Caveat` или `Cormorant Garamond` через `<link>` в `__root.tsx` head; токен `--font-display` переопределяется в bloom-теме.

Classic-тема остаётся визуально без изменений.

## Настройки

В `src/routes/_authenticated/settings.tsx` добавляем секцию «Оформление»:

- Сегментированный переключатель «Classic / Bloom» с мини-превью.
- Опционально — поле «Пол» (male/female/не указывать) для будущей сегментации.
- Сохранение через тот же server fn `updateUserSettings`.

## Серверные функции

В `src/lib/user-settings.functions.ts` (создать или дополнить существующий):

- `getUserSettings()` — `requireSupabaseAuth`, читает строку текущего пользователя, создаёт дефолтную если нет.
- `updateUserSettings({ gender?, theme?, onboarding_completed? })` — с zod-валидацией enum-значений.

Существующие чтения настроек переводим на эти fn (если ещё не).

## Файлы

Новые:
- `src/routes/_authenticated/onboarding.tsx`
- `src/components/ThemeProvider.tsx`
- `src/components/BloomBackdrop.tsx`
- `src/lib/user-settings.functions.ts` (если ещё нет)

Изменения:
- `supabase/migrations/*` — миграция на 3 поля в `user_settings` + check-триггер.
- `src/styles.css` — блок `[data-theme="bloom"]`, утилиты декора, шрифт.
- `src/routes/__root.tsx` — подключение `ThemeProvider` и `BloomBackdrop`, link на шрифт.
- `src/routes/_authenticated/route.tsx` — редирект на `/onboarding` если не пройден.
- `src/routes/_authenticated/settings.tsx` — секция выбора темы.

## Что НЕ меняем

- Логику auth, бизнес-логику страниц, структуру таблиц данных (students, lessons и т.д.).
- Текущий Classic-вид — он остаётся пиксель-в-пиксель.
