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
`MatrixRain`); `/film-remix` — пайплайн «чужой фильм → свой ролик» (индексация
реплик и действий, нарезка, смешной перевод; эталон `JuniorKumite`);
`/voice-over` — многоголосая озвучка (ElevenLabs → Gemini → edge-tts, тайминги
слов для караоке); `/qa-filmstrip` — проверка плавности ролика (контактный лист +
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
  index-quotes.ts          фильм → все реплики с таймкодами (Groq whisper-large-v3-turbo)
  subs-to-quotes.ts        тот же индекс из встроенных субтитров (бесплатно, мимо лимитов Groq)
  index-shots.ts           зона фильма → индекс действий с таймкодами (Gemini video)
  contact-sheet.ts         кадры фильма в один лист с выжженным таймкодом (агент читает глазами)
  voice-over.ts            озвучка реплик сценария (ElevenLabs → Gemini → edge-tts)
  cut-clips.ts             нарезка фрагментов по script.ts → public/clips/<Композиция>/
  lib/films.ts             реестр локальных исходников (пути к файлам на диске)
  lib/media.ts             обёртки ffmpeg/ffprobe
  lib/edge_tts_words.py    edge-tts с пословными таймингами (для караоке)
  bake-physics.ts          CLI запекания cannon-es-симуляций → sim.json (сцены poc, shells)
  lib/stock.ts             провайдеры Unsplash/Pexels/Pixabay
data/index/<фильм>/        индексы фильма: quotes.json/txt (реплики), shots.json/txt (действия)
public/
  captions.json            пример субтитров (формат Caption[])
  assets/                  скачанный сток (в .gitignore)
  clips/<Композиция>/      нарезанные фрагменты + clips.json (в .gitignore)
  sfx/                     синтезированные ffmpeg эффекты: бип цензуры, бас-дроп, сверчки
  vo/<Композиция>/         озвучка + vo.json со словами и таймингами (в .gitignore)
  models/                  GLTF-модели (пистолет Quaternius CC0) + CREDITS.md
out/<Проект>/              рендеры и служебное: у каждого ролика/фильма своя папка
.claude/skills/            shorts-director (оркестратор), film-remix, voice-over, qa-filmstrip, remotion-3d
```

**Раскладка `out/`.** Ничего не кладём в корень `out/`: рендеры идут в
`out/<Композиция>/<имя>.mp4`, контрольные кадры — в `out/<Композиция>/frames/`,
контактные листы фильма — в `out/<фильм>/sheets/<зона>/`. Каталог целиком в
`.gitignore`.

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
| `PhysicsScene` | Физика + 3D-облёт: симуляция cannon-es запекается скриптом в `sim.json`, рендер читает позы по кадру (PoC-пайплайн под гильзу/осколки) |
| `ShellEject` | Герой-сцена «выстрел + вылет гильз»: латунные гильзы cannon-es (fireFrame + импульс), **реальная GLTF-модель пистолета** (Quaternius 9mm, CC0) + IBL (RoomEnvironment) + ACES + тени + облёт камеры (вспышка/дым — Тир 2) |
| `BeekeeperKong` | **Смешной перевод на двух фильмах сразу**: «Пчеловод 3: Опекунство» — Стетхем воспитывает Конга, Суко и Годзиллу. Титан и Стетхем никогда не в одном кадре: их связывает монтажный стык «реплика → реакция» (ему подобраны планы со взглядом вниз, титанам — вверх). Сверх базового монтажа: **бип-цензура** (мат остаётся в озвучке ради интонации, но голос глушится по пословным таймингам, поверх бип, в субтитре звёздочки), **ч/б кадр с бас-дропом** (`bwBeats`), **сверчки в повисшей паузе** (`cricketBeats`), титульная плашка посреди таймлайна и кадр-стингер после неё | `bwBeats`, `cricketBeats`, `titleCardAfter`, `stingerText`, `musicFinaleVolume` |
| `JuniorKumite` | **Смешной перевод**: чужой фильм нарезается в новую историю, герои говорят нашими голосами («собеседование джуна в 2026» на кадрах «Кровавого спорта»). Пайплайн: `quotes` (Groq ASR) и `shots` (Gemini video) строят индексы → сценарий в `script.ts` → `vo` (многоголосый TTS) → `cut` (длина клипа подчиняется длине реплики) → монтаж. Кадрирование под вертикаль per-бит (`zoom`/`panX`/`panY`), замедление кульминаций (`slow`), приглушённый оригинал (`originalVolume`) |
| `TunnelRush` | Полёт по неоновой трубе на **настоящей полётной физике**: 45 c / 60fps. Трасса не задана кривой, а проинтегрирована из команд пилота (крен + перегрузка), поэтому радиус виража = `v²/(n·g)`: на 1600 км/ч поворот пологий, а тугую петлю приходится проходить, сбросив скорость торможением в 5 g. Разгон → бочка → штопор → петля 360° → большой вираж → гипер → врата. Камера — голова пилота на пружине (перегрузки, лаг, микровибрация) + приборы кокпита (G-метр, авиагоризонт). Ограничения по светочувствительности зашиты в рецепт |

## Команды

```bash
npm run dev                                   # Remotion Studio (превью/скраб)
npm run compositions                          # список композиций (быстрый smoke-test сборки)
npx remotion still <CompId> out/p.png --frame=30   # один кадр для проверки
npx remotion render <CompId> out/video.mp4    # рендер MP4
npm run assets -- --query "ocean" --kind video --count 2   # скачать сток
npm run quotes -- <фильм>                     # индекс всех реплик фильма (Groq ASR) → data/index/
npm run subs -- <фильм>                       # то же из встроенных субтитров: бесплатно, точнее, мимо лимитов Groq
npm run shots -- <фильм> --from 26:00 --to 28:00   # индекс действий в зоне (Gemini video)
npm run sheet -- <фильм> --from 40:00 --to 42:00 --every 4   # контактный лист с таймкодами
npm run vo -- <Композиция>                    # озвучка: ElevenLabs → Gemini → edge-tts (фолбэк автоматом)
npm run vo -- <Композиция> --engine edge      # принудительно один движок
npm run cut -- <Композиция>                   # нарезать клипы по script.ts → public/clips/
npm run bake                                  # запечь физику всех сцен → sim.json (перед рендером)
npm run bake -- shells                        # запечь одну сцену (poc | shells)
npm run flight                                # телеметрия полётного плана TunnelRush без рендера
npx remotion still <Id> out/f.png --frame=N --bundle-cache=false   # см. готчу ниже
npm run lint                                  # eslint + tsc
```

**Готча webpack-кэша.** После правки исходников пересборка часто падает с
`WasmHash ... Cannot read properties of undefined (reading 'length')`. Лечится
флагом `--bundle-cache=false` (работает для `still`/`render`) — им и итерируй;
альтернатива-молоток: удалить `node_modules/.cache`. Параллельные рендеры не
запускай (кэш + RAM Chrome).

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

**Озвучка подключена** — скилл `/voice-over`, скрипт `npm run vo -- <Композиция>`.
Реплики берутся из `script.ts` (поля `speaker` + `line`), голоса персонажей — из
`<Композиция>/voices.ts`. Движки пробуются по приоритету **ElevenLabs → Gemini TTS
→ edge-tts**: если верхний недоступен (нет ключа, кончилась квота), скрипт сам
спускается на следующий. ElevenLabs даёт посимвольные тайминги — по ним рисуется
караоке; ключи в `.env` (`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`).

Транскрипция чужого аудио (для индекса реплик фильма) — `npm run quotes` через
Groq; локальный `@remotion/install-whisper-cpp` не используем, он в 60 раз медленнее.

## Лицензия
Remotion бесплатен для команд до 3 человек; от 4 — платная Company License
(remotion.pro/license).
