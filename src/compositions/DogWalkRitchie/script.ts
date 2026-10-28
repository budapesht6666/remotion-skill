/**
 * Сценарий DogWalkRitchie поверх монтажного листа edit.json: стоп-кадры с
 * представлением героев, титры и звуки. Голос — narration.json (см.
 * scripts/dogwalk-vo.py), его фразы идут и субтитрами.
 *
 * Время — пара «план + секунда от начала плана», координаты — пиксели кадра
 * 1080×1920. Оформление одно на весь ролик: белый Oswald заглавными между двумя
 * тонкими линиями, текст всегда слева сверху, держится весь стоп-кадр.
 */
export type ShotId =
  | "hook" | "hookFreeze" | "rewind" | "street1" | "street2" | "street3" | "selfie" | "touristCard"
  | "nietzsche" | "nietzscheCard" | "bankCard" | "chaos" | "slam" | "hug" | "beg" | "hop" | "jump"
  | "woodpecker" | "woodpeckerCard" | "bag" | "leaves" | "ending" | "finalCard";

export type At = { shot: ShotId; at: number };

/**
 * Представление героя (Character Intro Freeze Frame): стоп-кадр плана `shot`,
 * герой вырезан (<shot>_cut.png, scripts/dogwalk-cutout.py) и обведён белым,
 * фон уходит в тёмный размытый дуотон. Камера за 3 кадра наезжает так, что
 * точка `focus` встаёт в `anchor` с увеличением `zoom`, и за 3 кадра до конца
 * откатывается обратно.
 *
 * Субтитр рассказчика не должен лежать на герое: героя ставим так, чтобы низ
 * кадра (зона субтитров) был свободен, а где не выходит — `sub` уводит субтитр
 * в пустое место (сбоку от героя или под табличку с именем).
 */
export type SubPlace = { top?: number; left: number; width: number; align: "left" | "center" };

export type Card = {
  shot: ShotId;
  name: string;
  nick?: string;
  tag: string;
  focus: [number, number];
  anchor: [number, number];
  zoom: number;
  sub?: SubPlace;
};

/** Титр в том же стиле, но без стоп-кадра: место, счёт. */
export type Title = At & { dur: number; name: string; tag?: string };

export type Sfx = At & { name: string; volume?: number; dur?: number };

export const cards: Card[] = [
  {
    // Лицо занимает весь низ — субтитр под табличкой.
    shot: "touristCard", name: "ТУРИСТ", tag: "снимает всё.\nне контролирует ничего.",
    focus: [430, 1480], anchor: [470, 1420], zoom: 1.12,
    sub: { top: 640, left: 70, width: 860, align: "left" },
  },
  {
    // Пёс справа от таблички, низом не ниже 1360 — зона субтитров свободна.
    shot: "nietzscheCard", name: "НИЦШЕ", nick: "«ФИЛОСОФ»", tag: "держит район.\nработает за вкусняшки.",
    focus: [382, 950], anchor: [830, 925], zoom: 1.8,
  },
  {
    // Ноги уходят за низ кадра — субтитр слева от неё.
    shot: "bankCard", name: "БАНК", tag: "при ней сумка.\nв сумке — товар.",
    focus: [735, 1000], anchor: [740, 1200], zoom: 1.2,
    sub: { left: 70, width: 420, align: "left" },
  },
  {
    // Идёт на камеру; лапы не ниже 1370.
    shot: "woodpeckerCard", name: "ДЯТЕЛ", nick: "«ТАМОЖНЯ»", tag: "досматривает всё,\nчто шуршит.",
    focus: [512, 867], anchor: [700, 900], zoom: 1.35,
  },
];

export const titles: Title[] = [
  { shot: "street1", at: 0.15, dur: 3.2, name: "ДАНАНГ", tag: "сезон дождей" },
  { shot: "finalCard", at: 0.25, dur: 4.5, name: "1 : 0", tag: "в пользу ницше" },
];

/** Входы в стоп-кадры и склейки «на ударе»: вжух и глухой удар. */
export const sfx: Sfx[] = [
  { shot: "hookFreeze", at: 0, name: "smack", volume: 0.5 },
  { shot: "rewind", at: 0, name: "rewind", volume: 0.9 },
  { shot: "street1", at: 0, name: "whoosh", volume: 0.6 },
  ...(["touristCard", "nietzscheCard", "bankCard", "woodpeckerCard", "finalCard"] as ShotId[]).flatMap((shot) => [
    { shot, at: 0, name: "whoosh", volume: 0.75 },
    { shot, at: 0.03, name: "smack", volume: 0.45 },
  ]),
  { shot: "chaos", at: 0, name: "whoosh", volume: 0.5 },
  { shot: "slam", at: 1.4, name: "smack", volume: 0.6 },
];

/** Музыка: подложка, провал под голос, затухание в конце. */
export const MUSIC = { base: 0.24, duck: 0.1, fadeOut: 3 };
