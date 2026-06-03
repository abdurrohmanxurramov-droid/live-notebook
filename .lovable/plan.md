## Что меняю

Применяю выбранный вариант **Modernist Monogram** к splash-экрану и обновляю название приложения на английское "Live Notebook".

## Файлы

**`src/components/SplashScreen.tsx`** — заменить блок логотипа:
- Squircle 128×128, `rounded-[2.5rem]`, liquid glass (white/60 → white/20, backdrop-blur, мягкая тень).
- Монограмма `LN`: `L` жирная (font-bold), `N` тоньше (font-medium), navy `text-foreground`, тесный трекинг.
- Маленькая точка-акцент `bg-accent` (#B38B59) в правом нижнем углу монограммы.
- Сияние-sheen, плывущее по стеклу.
- Wordmark: **LIVE NOTEBOOK** (Inter, uppercase, трекинг 0.15em) + тонкая черта-акцент под ним.
- Bouncing dots оставляю.

**`public/manifest.webmanifest`** — обновить `name` и `short_name` на "Live Notebook".

## Что НЕ трогаю

- Цветовые токены, шрифт (Inter уже стоит).
- Логику splash (sessionStorage, haptics, тайминги).
- Остальные экраны/тексты в приложении — переименование UI с русского на английский в этот заход не входит, только брендовый логотип и манифест.
