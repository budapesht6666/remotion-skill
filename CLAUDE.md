# CLAUDE.md

Проект для генерации **коротких вертикальных видео** (YouTube Shorts / Reels /
TikTok) на **Remotion 4** с помощью Claude Code. Это песочница: не жёсткие
шаблоны, а набор рецептов + правил, из которых под каждый запрос собирается ролик.

## Как работать над роликом

Основной сценарий ведёт скилл **`shorts-director`** (`.claude/skills/shorts-director/SKILL.md`):
понять задачу → предложить 1–2 стека → согласовать с пользователем → собрать
композицию → достать ассеты → срендерить MP4. Следуй ему.

Перед написанием разметки/рендером подтягивай **официальные Remotion Skills**
(поставлены через `npx skills add remotion-dev/skills`):
`/remotion-best-practices`, `/remotion-markup`, `/remotion-captions`,
`/remotion-render`, `/remotion-docs` (поиск по актуальной документации Remotion).
Для смежных библиотек (Pixi, Three.js, Recharts, D3) — **Context7 MCP**, не память.

**Локальные скиллы проекта:** `/remotion-3d` — рецепт настоящего 3D на
`@remotion/three` (пролёт камеры, глубина, инстансинг, шейдеры; эталон
`MatrixRain`); `/qa-filmstrip` — проверка плавности ролика (контактный лист +
детектор статтера/фризов на ffmpeg) перед сдачей.

Общайся с пользователем на русском.

## Золотые правила (нарушение = мигание/падение рендера)

1. **Анимации только от `useCurrentFrame()`** — не `requestAnimationFrame`,
   `setInterval`, CSS-transition, R3F `useFrame`. Кадр = чистая функция номера кадра.
2. **Imperative canvas/WebGL (Pixi, p5)**: ticker off (`autoStart: false`),
   состояние по `frame`, `renderer.render()` вручную; async-init в
   `delayRender()` / `continueRender()`. Пример — `src/compositions/PixiScene`.
3. **Видео-фон — только `<OffthreadVideo>`**, не `<Video>`.
4. **Ассеты локально в `public/`**; внешние URL и любой async оборачивать в
   `delayRender()` / `continueRender()`.
5. **WebGL в рендере → ANGLE** (уже задано в `remotion.config.ts`).
6. **Формат вертикальный** 1080×1920 / 30fps (`src/lib/format.ts`), важный
   контент — внутри `SafeArea` (верх/низ перекрыты интерфейсом платформ).

## Структура

```
src/
  Root.tsx                 реестр <Composition/> (регистрируй новые ролики здесь)
  index.ts / index.css     точка входа + Tailwind
  lib/format.ts            FORMAT (1080×1920/30) и seconds()
  components/              SafeArea, GradientBackground (переиспользуемое)
  compositions/<Имя>/      рецепты (см. таблицу ниже)
scripts/
  fetch-assets.ts          CLI скачивания стока → public/assets
  lib/stock.ts             провайдеры Unsplash/Pexels/Pixabay
public/
  captions.json            пример субтитров (формат Caption[])
  assets/                  скачанный сток (в .gitignore)
.claude/skills/shorts-director/SKILL.md   скилл-оркестратор
```

### Рецепты

| Рецепт | Под что |
|---|---|
| `KineticText` | Цитаты/факты/хуки, крупный анимированный текст |
| `CaptionedVideo` | Видео-фон + караоке-субтитры по таймингам |
| `PixiScene` | Мультик/частицы/генеративка (PixiJS, canvas) |
| `CodeReveal` | Кодинг-ролики: печать кода в окне редактора |
| `ReactTodoLesson` | Обучающий кодинг-ролик «за 60 сек»: печать кода + живое превью работающего приложения + караоке-комментарии внизу |
| `DataChart` | Данные/топы: анимированные бары (SVG) |
| `MatrixRain` | Премиум 3D: цифровой дождь Матрицы, пролёт камеры сквозь глифы (`/remotion-3d`) |

## Команды

```bash
npm run dev                                   # Remotion Studio (превью/скраб)
npm run compositions                          # список композиций (быстрый smoke-test сборки)
npx remotion still <CompId> out/p.png --frame=30   # один кадр для проверки
npx remotion render <CompId> out/video.mp4    # рендер MP4
npm run assets -- --query "ocean" --kind video --count 2   # скачать сток
npm run lint                                  # eslint + tsc
```

## Добавить новый рецепт

1. `src/compositions/<Имя>/<Имя>.tsx` — компонент по золотым правилам.
2. Зарегистрируй `<Composition id="<Имя>" ... />` в `src/Root.tsx`
   (формат из `FORMAT`, длительность через `seconds()`), задай `defaultProps`.
3. Проверь: `npm run compositions`, превью в студии, плавность — `/qa-filmstrip`.
4. **Синхронизируй доки** (не забывай — иначе расходятся): добавь строку рецепта
   в таблицу **и здесь**, **и в** `.claude/skills/shorts-director/SKILL.md`. При
   добавлении/изменении локального скилла упомяни его в обоих файлах.

## Ассеты и атрибуция
Сток тянется скриптом (`npm run assets`), падает в `public/assets/`, авторы — в
`public/assets/manifest.json`. При публикации указывай атрибуцию (особенно Unsplash).
В композиции: `staticFile("assets/<файл>")`.

## Озвучка/музыка
**Музыку предлагай при каждой генерации** — это обязательный вопрос пайплайна
`shorts-director` (шаг 1): без музыки / свой трек / готовый `public/music.mp3` /
подобрать бесплатный (YouTube-safe). Если да — `<Audio src={staticFile(...)} volume={...} />`
с fade-in/out и громкостью ~0.3–0.4.

Озвучка (TTS) и авто-субтитры (Whisper) пока не подключены — по запросу. Порядок:
текст → TTS → файл в `public/` → `<Audio>`; для авто-таймингов субтитров —
`@remotion/install-whisper-cpp` (`transcribe` → `toCaptions` → `captions.json`) →
рецепт `CaptionedVideo`.

## Лицензия
Remotion бесплатен для команд до 3 человек; от 4 — платная Company License
(remotion.pro/license).
