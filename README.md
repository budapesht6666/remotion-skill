# Remotion Shorts Starter

Стартовый шаблон для создания **коротких вертикальных видео** (YouTube Shorts /
Reels / TikTok) на [Remotion 4](https://remotion.dev) с помощью **Claude Code**.

Идея: клонируешь шаблон → пишешь промпт («сделай ролик про …», можно с
референс-картинками) → Claude предлагает, на каких технологиях это собрать → ты
выбираешь → на выходе получаешь готовый `MP4` (1080×1920), при желании — с
фоновой музыкой. Это не набор жёстких шаблонов, а гибкая песочница: под мультик
берётся PixiJS, под кодинг-ролик — окно редактора, под факты — кинетический
текст, и т.д.

## Что внутри

- **Рецепты** (`src/compositions/`): `KineticText`, `CaptionedVideo`, `PixiScene`,
  `CodeReveal`, `DataChart` — примеры под разные типы роликов.
- **Скилл-оркестратор** `shorts-director` (`.claude/skills/`) — ведёт Claude от
  промпта до рендера и предлагает стек.
- **Библиотека ассетов** (`scripts/`) — скачивание бесплатного стока (Unsplash,
  Pexels, Pixabay) одной командой.
- **Правила и документация** для Claude в [CLAUDE.md](CLAUDE.md).

## Требования

- **Node.js ≥ 20** (проверено на 24), npm.
- Chrome ставится Remotion автоматически при первом рендере.
- ОС: Windows / macOS / Linux. Для WebGL/Pixi-рендера включён ANGLE.

## Установка

```bash
npm install                          # зависимости
npx skills add remotion-dev/skills   # официальные Remotion Skills (для Claude)
cp .env.example .env                 # ключи для стока (на Windows: copy .env.example .env)
```

Ключи стока (все бесплатные, необязательные) — в `.env`:
[Unsplash](https://unsplash.com/developers), [Pexels](https://www.pexels.com/api/),
[Pixabay](https://pixabay.com/api/docs/). Без ключей всё работает, кроме
автоскачивания стока.

## Быстрый старт

```bash
npm run dev            # Remotion Studio: превью и скраб таймлайна
```

Открой любую композицию (KineticText, PixiScene, …), покрути таймлайн. Рендер:

```bash
npx remotion render KineticText out/hello.mp4
```

## Работа через Claude Code

Просто опиши задачу в чате Claude Code, например:

> «Сделай 10-секундный ролик: 5 фактов про космос, крупный текст на тёмном фоне,
> акцент фиолетовый.»

или

> «Хочу мультик на Pixi: летающие частицы складываются в логотип, 8 секунд.»

Claude (через скилл `shorts-director`) уточнит недостающее, **предложит 1–2 стека
с обоснованием**, соберёт композицию, при необходимости скачает сток и срендерит
MP4. Ты только выбираешь технологию и правишь по ходу.

## Скачивание ассетов вручную

```bash
npm run assets -- --query "ocean waves" --kind video --count 2
npm run assets -- -q "coffee cup" -k photo -n 3
```

Файлы → `public/assets/`, атрибуция авторов → `public/assets/manifest.json`.
В композиции: `staticFile("assets/<файл>")`.

## Структура проекта

```
src/
  Root.tsx              реестр композиций
  lib/format.ts         формат 1080×1920/30fps
  components/           SafeArea, GradientBackground
  compositions/         рецепты роликов
scripts/                CLI и провайдеры стока
public/                 локальные ассеты, captions.json
.claude/skills/         скилл shorts-director
CLAUDE.md               правила и гайд для Claude
```

## Полезные команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Remotion Studio (превью) |
| `npm run compositions` | список композиций (smoke-test сборки) |
| `npx remotion render <Id> out/v.mp4` | рендер MP4 |
| `npx remotion still <Id> out/p.png --frame=30` | один кадр |
| `npm run assets -- -q "..." -k photo` | скачать сток |
| `npm run lint` | eslint + tsc |

## Производительность (локально)

2D-ролики (текст, сток, данные) рендерятся быстро. Тяжёлый WebGL/3D на встроенной
графике — медленно, держи сцены простыми. `concurrency` по умолчанию 6
(`remotion.config.ts`) — подстрой под своё железо. Для Shorts достаточно
1080p/30fps, 4K/60 не нужны.

## Лицензия

Remotion бесплатен для команд до 3 человек. Компаниям от 4 сотрудников нужна
[Company License](https://remotion.pro/license). Код шаблона — используй свободно.
Скачанный сток — по лицензиям Unsplash/Pexels/Pixabay (коммерческое использование
разрешено; атрибуция желательна, для Unsplash — обязательна).
