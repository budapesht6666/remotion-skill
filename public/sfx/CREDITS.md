# Звуковые эффекты

| Файл | Источник | Лицензия |
|---|---|---|
| `beep.mp3`, `bass-drop.mp3`, `crickets.mp3`, `alert.mp3`, `tick.mp3`, `bell.mp3` | синтезированы `ffmpeg -f lavfi -i aevalsrc=...` в этом проекте | — |
| `subscribe-bell.mp3` | [File:Bell-ring.flac](https://commons.wikimedia.org/wiki/File:Bell-ring.flac), автор qubodup, Wikimedia Commons | CC0 (public domain) |

`subscribe-bell.mp3` — настоящая запись металлического колокольчика (транзиент
удара + парциалы ~2.6 и ~6.1 кГц), а не синтезированный тон: `bell.mp3` рядом
звучит как «пиип» и годится только для мультяшного клика в `MoonStrike`.
Обработка оригинала: обрезка до 1.7 с, `highpass=200` (убран гул помещения),
fade-out 0.35 с, пик −2.4 dBFS, mp3 192 kbps / 48 кГц.

Лицензия CC0 не требует атрибуции при публикации ролика — строка здесь нужна,
чтобы через полгода было видно, откуда файл и что его можно использовать.
