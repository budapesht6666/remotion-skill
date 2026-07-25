/**
 * Полётная модель TunnelRush: трасса рождается из физики, а не из синусов.
 *
 * Мир метрический: 1 юнит = 1 метр, время в секундах. Аппарат летит по трубе,
 * пилот управляет им как самолётом — креном и перегрузкой:
 *
 *   pitchRate = (n·g − g·upY) / v      радиус виража R = v² / (n·g)
 *
 * Отсюда честное следствие, ради которого всё и переписано: на 550 м/с вираж
 * физически огромный и плавный, а тугую петлю можно пройти только сбросив
 * скорость до ~55 м/с. «Идеального пролёта на любой скорости» больше нет.
 *
 * Всё запекается ОДИН раз детерминированным интегрированием (240 Гц) в
 * плоские Float32Array. Кадр остаётся чистой функцией номера кадра: рендер
 * просто читает запечённый сэмпл, никакого состояния между кадрами.
 *
 * Файл намеренно не зависит от remotion/three-рендера (только математика three),
 * чтобы полётный план можно было проверять из node: `npm run flight`.
 */

import * as THREE from "three";

// --- Мир и тайминг --------------------------------------------------------
export const FPS = 60;
export const DURATION_FRAMES = 2700; // 45 c
export const DURATION_SEC = DURATION_FRAMES / FPS;
export const SUB = 4; // подшагов физики на кадр → интегрируем на 240 Гц
export const DT = 1 / (FPS * SUB);
export const G = 9.81;

/** Окно прорисовки трубы: сколько метров видно позади и впереди камеры. */
export const WINDOW_NEAR = 80; // в тугой петле труба «сзади» ещё в кадре
export const WINDOW_FAR = 600;
/** Период рециклинга инстансов = длина окна: элемент уходит назад и возвращается вперёд. */
export const LOOP = WINDOW_NEAR + WINDOW_FAR;
/** Разрешение текстуры трассы, которую читает вершинный шейдер. */
export const TRACK_SAMPLES = 512;
export const TRACK_STEP = LOOP / (TRACK_SAMPLES - 1);

// --- Пределы аппарата и пилота -------------------------------------------
const THRUST_MAX = 38; // м/с² (≈3.9 g) — разгон
const BRAKE_MAX = 52; // м/с² (≈5.3 g) — торможение перед петлёй
const MAX_PITCH_RATE = 1.6; // рад/с — конструктивный предел рулей
const MAX_YAW_RATE = 0.9;
/** КОМФОРТ: крен ограничен ~135°/с — быстрее начинается вестибулярный дискомфорт. */
const MAX_ROLL_RATE = 2.36; // рад/с

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// --- Драматургия ----------------------------------------------------------
export type Act = {
  id: string;
  label: string; // подпись в HUD
  from: number; // секунды
  to: number;
};

/** Акты полёта. Порядок = порядок ключей ниже, времена совпадают. */
export const ACTS: readonly Act[] = [
  { id: "launch", label: "LAUNCH", from: 0, to: 3.5 },
  { id: "run", label: "RUN 01", from: 3.5, to: 9.8 },
  { id: "roll", label: "BARREL ROLL", from: 9.8, to: 15.6 },
  { id: "screw", label: "CORKSCREW", from: 15.6, to: 21.0 },
  { id: "brake", label: "BRAKE 5G", from: 21.0, to: 24.0 },
  { id: "loop", label: "FULL LOOP", from: 24.0, to: 30.8 },
  { id: "bank", label: "HIGH BANK", from: 30.8, to: 36.6 },
  { id: "hyper", label: "HYPER RUN", from: 36.6, to: 41.4 },
  { id: "gate", label: "FINAL GATE", from: 41.4, to: 43.4 },
  { id: "clear", label: "CLEARED", from: 43.4, to: 45.0 },
];

export function actAt(t: number): Act {
  for (const a of ACTS) if (t < a.to) return a;
  return ACTS[ACTS.length - 1];
}

type Key = readonly [number, number]; // (секунда, значение)

/** Гладкая (smoothstep) выборка ключей: без рывков ускорения → без дискомфорта. */
export function keySmooth(keys: readonly Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      if (t1 <= t0) return v1;
      const x = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (x * x * (3 - 2 * x));
    }
  }
  return keys[keys.length - 1][1];
}

/** Целевая скорость, м/с. Тяга ограничена, поэтому фактическая скорость отстаёт. */
const SPEED_KEYS: readonly Key[] = [
  [0, 0],
  [0.5, 0], // шортс не может стоять на месте — стартуем почти сразу
  [2.2, 70],
  [4.0, 120],
  [6.0, 160],
  [9.8, 195],
  [15.6, 205],
  [19.0, 215],
  [21.0, 215],
  [24.0, 58], // тормозим: тугую петлю на 200 м/с не пройти
  [28.0, 54],
  [30.8, 62],
  [32.5, 120],
  [36.6, 310],
  [40.5, 520],
  [41.4, 545],
  [43.0, 470],
  [43.8, 300],
  [45.0, 215],
];

/**
 * Вертикальная перегрузка n (в g) в осях аппарата — то, что пилот чувствует
 * спиной. n = 1 → прямолинейный горизонтальный полёт, n = 0 → невесомость.
 */
const PULL_KEYS: readonly Key[] = [
  [0, 1],
  [9.6, 1],
  [10.6, 0.05], // бочку крутят на нулевой перегрузке — иначе уводит с курса
  [15.0, 0.05],
  [15.8, 1],
  [16.6, 2.4], // штопор: крен + тяга = спираль
  [20.4, 2.4],
  [21.0, 1],
  [24.2, 1],
  [24.8, 6.3], // петля: R = v²/(n·g) — от 130 м на входе до 50 м наверху
  [30.4, 6.3],
  [30.8, 1],
  [31.8, 1],
  [32.8, 3.2], // большой вираж: на разгоне радиус растёт до километров
  [35.8, 3.2],
  [36.6, 1],
  [45, 1],
];

/** Боковая перегрузка (скольжение). Маленькая — чтобы петля ушла в спираль. */
const YAW_KEYS: readonly Key[] = [
  [0, 0],
  [24.9, 0],
  [25.6, 0.42], // петля становится пологой спиралью и не втыкается сама в себя
  [30.0, 0.42],
  [30.8, 0],
  [45, 0],
];

/** Целевой крен, градусы (накопительно: 360 = полный оборот вокруг оси полёта). */
const ROLL_KEYS: readonly Key[] = [
  [0, 0],
  [5.5, 0],
  [6.6, -13],
  [7.8, 11],
  [8.8, -7],
  [9.6, 0],
  [10.4, 0],
  [15.2, 360], // БОЧКА: один плавный оборот за 4.8 с (~75°/с)
  [16.4, 360],
  [20.6, 720], // ШТОПОР: ещё оборот, уже с перегрузкой
  [21.4, 720],
  [30.8, 720], // петлю проходим «крыльями ровно»
  [32.6, 786], // вираж с креном 66°
  [35.6, 786],
  [36.6, 720],
  [39.2, 712],
  [40.6, 727],
  [41.4, 720],
  [45, 720],
];

/**
 * Смещение аппарата ВНУТРИ трубы (метры, оси right/up) — «змейка» между
 * препятствиями. Следящее звено 2-го порядка не даёт дёрнуться мгновенно:
 * рывок на 3 м даёт ≈2.4 g, поэтому на гиперскорости манёвр физически вялый.
 */
const OFFSET_X_KEYS: readonly Key[] = [
  [0, 0],
  [6.4, 3.0],
  [8.2, -3.4],
  [11.0, 2.6],
  [13.2, -2.8],
  [14.8, 1.4],
  [17.4, -2.2],
  [19.2, 2.8],
  [20.6, -1.6],
  [23.0, 0],
  [26.0, 2.4],
  [28.4, -2.4],
  [30.8, 0],
  [33.0, 1.6],
  [34.8, -1.4],
  [36.6, 0],
  [38.2, 0.8],
  [39.6, -0.7],
  [41.0, 0],
  [45, 0],
];

const OFFSET_Y_KEYS: readonly Key[] = [
  [0, 0],
  [6.4, -2.2],
  [8.2, 2.4],
  [11.0, -2.0],
  [13.2, 2.2],
  [14.8, -1.2],
  [17.4, 1.8],
  [19.2, -2.2],
  [20.6, 1.4],
  [23.0, 0],
  [26.0, -1.8],
  [28.4, 2.0],
  [30.8, 0],
  [33.0, -1.2],
  [34.8, 1.0],
  [36.6, 0],
  [38.2, -0.6],
  [39.6, 0.5],
  [41.0, 0],
  [45, 0],
];

// --- Оформление тоннеля (функции времени = функции пути, путь монотонен) ----

/** Радиус трубы, м. Узко = быстро читается скорость, широко = масштаб. */
const RADIUS_KEYS: readonly Key[] = [
  [0, 14],
  [3.5, 13],
  [9.8, 12],
  [15.6, 12.5],
  [21.0, 13],
  [24.0, 15],
  [30.8, 15],
  [32.5, 13.5],
  [36.6, 11],
  [40.5, 9.6],
  [41.4, 10.5],
  [42.6, 17],
  [43.6, 30],
  [45, 34],
];

/** «Открытость»: 0 — глухая труба, 1 — ажурный каркас, сквозь который видно даль. */
const OPEN_KEYS: readonly Key[] = [
  [0, 0],
  [9.8, 0.05],
  [15.6, 0.2],
  [21.0, 0.4],
  [24.0, 0.55], // в петле труба должна оставаться читаемой: изгиб важнее «ажура»
  [30.8, 0.58],
  [32.5, 0.36],
  [36.6, 0.1],
  [41.0, 0.05],
  [42.4, 0.5],
  [43.6, 0.92],
  [45, 0.95],
];

/** Температура палитры: 0 — холодный неон, 1 — раскалённый янтарь. */
const TONE_KEYS: readonly Key[] = [
  [0, 0],
  [15.6, 0.1],
  [21.0, 0.26],
  [24.0, 0.16],
  [30.8, 0.32],
  [36.6, 0.55],
  [40.5, 0.78],
  [42.2, 0.82],
  [43.2, 0.2],
  [45, 0],
];

/** Вертикальный FOV камеры. Шире = сильнее эффект присутствия и ощущение скорости. */
const FOV_KEYS: readonly Key[] = [
  [0, 70],
  [3.5, 68],
  [9.8, 78],
  [21.0, 80],
  [24.0, 74],
  [30.8, 77],
  [36.6, 86],
  [41.0, 94],
  [42.6, 88],
  [43.6, 74],
  [45, 70],
];

export const fovAt = (t: number) => keySmooth(FOV_KEYS, t);

// --- Запечённая трасса ----------------------------------------------------
export type FlightBake = {
  count: number;
  s: Float32Array; // пройденный путь, м
  pos: Float32Array; // 3n — ось трубы в мире
  quat: Float32Array; // 4n — ориентация аппарата (локальные оси: X вправо, Y вверх, −Z вперёд)
  off: Float32Array; // 2n — смещение аппарата внутри трубы (right/up), м
  head: Float32Array; // 3n — смещение головы пилота от кресла, м
  headRot: Float32Array; // 3n — микроповорот головы (pitch, yaw, roll), рад
  speed: Float32Array; // м/с
  gLoad: Float32Array; // 3n — удельная сила в осях аппарата, в g
  radius: Float32Array;
  openness: Float32Array;
  tone: Float32Array;
  bank: Float32Array; // крен относительно мира, рад (для авиагоризонта)
  climb: Float32Array; // тангаж относительно мира, рад
};

const wr3 = (a: Float32Array, i: number, x: number, y: number, z: number) => {
  a[i * 3] = x;
  a[i * 3 + 1] = y;
  a[i * 3 + 2] = z;
};

/**
 * Один прогон интегрирования: трасса + динамика пилота.
 * Хвост считается дальше конца ролика, чтобы на последнем кадре было чем
 * заполнить окно прорисовки впереди камеры.
 */
export function bakeFlight(): FlightBake {
  const cap = (DURATION_FRAMES + 25 * FPS) * SUB;
  const s = new Float32Array(cap);
  const pos = new Float32Array(cap * 3);
  const quat = new Float32Array(cap * 4);
  const off = new Float32Array(cap * 2);
  const head = new Float32Array(cap * 3);
  const headRot = new Float32Array(cap * 3);
  const speed = new Float32Array(cap);
  const gLoad = new Float32Array(cap * 3);
  const radius = new Float32Array(cap);
  const openness = new Float32Array(cap);
  const tone = new Float32Array(cap);
  const bank = new Float32Array(cap);
  const climb = new Float32Array(cap);

  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const axX = new THREE.Vector3();
  const axY = new THREE.Vector3();
  const axZ = new THREE.Vector3();
  const dq = new THREE.Quaternion();

  let v = 0;
  let arc = 0;
  let roll = 0;
  let rollRate = 0;
  let ox = 0;
  let oxV = 0;
  let oy = 0;
  let oyV = 0;
  const hx = [0, 0, 0]; // смещение головы
  const hv = [0, 0, 0];
  const rx = [0, 0, 0]; // микроповорот головы
  const rv = [0, 0, 0];

  // Собственные частоты следящих звеньев (Гц → рад/с).
  const wRoll = 2 * Math.PI * 0.5;
  const wOff = 2 * Math.PI * 0.42;
  const wHead = 11; // ≈1.75 Гц — шея пилота
  const wHRot = 9;

  const endIndex = DURATION_FRAMES * SUB;
  let sEnd = Infinity;
  let count = cap;

  for (let i = 0; i < cap; i++) {
    // После конца ролика скрипт замирает — хвост трассы идёт по инерции.
    const t = Math.min(i * DT, DURATION_SEC);

    axX.set(1, 0, 0).applyQuaternion(q);
    axY.set(0, 1, 0).applyQuaternion(q);
    axZ.set(0, 0, 1).applyQuaternion(q); // «назад»

    // --- команды пилота
    const nCmd = keySmooth(PULL_KEYS, t);
    const latCmd = keySmooth(YAW_KEYS, t);
    const vCmd = keySmooth(SPEED_KEYS, t);
    const vSafe = Math.max(v, 14); // на старте с места рули не работают

    // --- продольная динамика: ограниченная тяга + гравитация на подъёме
    const thrust = clamp((vCmd - v) * 0.9, -BRAKE_MAX, THRUST_MAX);
    const sinClimb = -axZ.y; // синус тангажа (вперёд = −Z)
    const along = thrust - G * sinClimb;

    // --- угловые скорости из требуемых перегрузок
    const pitchRate = clamp(
      (nCmd * G - G * axY.y) / vSafe,
      -MAX_PITCH_RATE,
      MAX_PITCH_RATE,
    );
    const yawRate = clamp(
      (G * axX.y - latCmd * G) / vSafe,
      -MAX_YAW_RATE,
      MAX_YAW_RATE,
    );

    // --- крен: следящее звено с ограничением скорости (плавные перевороты)
    const rollCmd = keySmooth(ROLL_KEYS, t) * DEG;
    rollRate = clamp(
      rollRate + (wRoll * wRoll * (rollCmd - roll) - 2 * wRoll * rollRate) * DT,
      -MAX_ROLL_RATE,
      MAX_ROLL_RATE,
    );
    roll += rollRate * DT;

    // --- «змейка» внутри трубы (её ускорение честно идёт в перегрузку)
    const oxAcc =
      wOff * wOff * (keySmooth(OFFSET_X_KEYS, t) - ox) - 2 * 0.9 * wOff * oxV;
    const oyAcc =
      wOff * wOff * (keySmooth(OFFSET_Y_KEYS, t) - oy) - 2 * 0.9 * wOff * oyV;
    oxV += oxAcc * DT;
    oyV += oyAcc * DT;
    ox += oxV * DT;
    oy += oyV * DT;

    // --- удельная сила в осях аппарата (м/с²): манёвр + гравитация
    const fx = -v * yawRate + G * axX.y + oxAcc;
    const fy = v * pitchRate + G * axY.y + oyAcc;
    const fz = -along + G * axZ.y;

    // --- пилот: масса на пружине. Смещается ПРОТИВ удельной силы (перегрузка
    // вжимает в кресло, торможение бросает вперёд) — это и даёт «присутствие».
    const fRest = [0, G, 0];
    const fLocal = [fx, fy, fz];
    for (let k = 0; k < 3; k++) {
      const acc =
        -wHead * wHead * hx[k] - 2 * 0.7 * wHead * hv[k] - (fLocal[k] - fRest[k]);
      hv[k] += acc * DT;
      hx[k] = clamp(hx[k] + hv[k] * DT, -0.55, 0.55);
    }
    // Взгляд ведёт манёвр: по тангажу и рысканью пилот смотрит ВНУТРЬ поворота
    // (в петле радиусом 50 м труба иначе уходит из кадра и остаётся чернота),
    // по крену голова, наоборот, отстаёт по инерции.
    const omega = [pitchRate, yawRate, -rollRate];
    const gaze = [26, 8, -3.2];
    for (let k = 0; k < 3; k++) {
      const acc =
        -wHRot * wHRot * rx[k] - 2 * 0.75 * wHRot * rv[k] + gaze[k] * omega[k];
      rv[k] += acc * DT;
      rx[k] = clamp(rx[k] + rv[k] * DT, -0.34, 0.34);
    }

    // --- микровибрация корпуса: детерминированная сумма синусов (3.7 и 9.1 Гц),
    // амплитуда растёт со скоростью. Держим ≈0.25° — читается, но не мылит.
    const vib = 0.0016 + 0.0026 * Math.min(1, v / 420);
    const vibP = Math.sin(t * 57.3) * vib + Math.sin(t * 23.1) * vib * 0.55;
    const vibY = Math.cos(t * 49.7) * vib + Math.cos(t * 19.3) * vib * 0.55;

    // --- запись сэмпла
    s[i] = arc;
    wr3(pos, i, p.x, p.y, p.z);
    quat[i * 4] = q.x;
    quat[i * 4 + 1] = q.y;
    quat[i * 4 + 2] = q.z;
    quat[i * 4 + 3] = q.w;
    off[i * 2] = ox;
    off[i * 2 + 1] = oy;
    wr3(head, i, hx[0], hx[1], hx[2]);
    wr3(headRot, i, rx[0] + vibP, rx[1] + vibY, rx[2]);
    speed[i] = v;
    wr3(gLoad, i, fx / G, fy / G, fz / G);
    radius[i] = keySmooth(RADIUS_KEYS, t);
    openness[i] = keySmooth(OPEN_KEYS, t);
    tone[i] = keySmooth(TONE_KEYS, t);
    bank[i] = -Math.atan2(axX.y, axY.y);
    climb[i] = Math.asin(clamp(-axZ.y, -1, 1));

    if (i === endIndex) sEnd = arc;
    if (i > endIndex && arc > sEnd + WINDOW_FAR + 40) {
      count = i + 1;
      break;
    }

    // --- шаг интегрирования
    dq.set(
      pitchRate * 0.5 * DT,
      yawRate * 0.5 * DT,
      -rollRate * 0.5 * DT,
      1,
    ).normalize();
    q.multiply(dq);
    v = Math.max(0, v + along * DT);
    axZ.set(0, 0, 1).applyQuaternion(q);
    p.addScaledVector(axZ, -v * DT);
    arc += v * DT;
  }

  return {
    count,
    s,
    pos,
    quat,
    off,
    head,
    headRot,
    speed,
    gLoad,
    radius,
    openness,
    tone,
    bank,
    climb,
  };
}

// --- Чтение запечённого ---------------------------------------------------

/** Индекс сэмпла для кадра ролика (интегрируем ровно SUB подшагов на кадр). */
export const sampleOfFrame = (frame: number): number =>
  clamp(Math.round(frame) * SUB, 0, Number.MAX_SAFE_INTEGER);

/**
 * Индекс сэмпла, покрывающего путь s, начиная поиск с подсказки.
 * Окно заполняется по возрастанию s, поэтому курсор просто ползёт вперёд.
 */
export function indexOfArc(bake: FlightBake, arc: number, hint: number): number {
  let i = clamp(hint, 0, bake.count - 2);
  while (i < bake.count - 2 && bake.s[i + 1] < arc) i++;
  while (i > 0 && bake.s[i] > arc) i--;
  return i;
}

export type TrackPoint = {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  radius: number;
  openness: number;
  tone: number;
  offX: number;
  offY: number;
};

const tmpQa = new THREE.Quaternion();
const tmpQb = new THREE.Quaternion();

/**
 * Точка трассы на пути arc (линейная интерполяция между сэмплами; шаг сэмплов
 * ≤2.5 м, поэтому погрешность хорды на радиусе 50 м — доли сантиметра).
 * За пределами запечённого — прямая экстраполяция по касательной.
 */
export function trackAt(
  bake: FlightBake,
  arc: number,
  hint: number,
  out: TrackPoint,
): number {
  if (arc <= bake.s[0]) {
    out.pos.fromArray(bake.pos, 0);
    out.quat.fromArray(bake.quat, 0);
    // назад по касательной от нулевого сэмпла
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(out.quat);
    out.pos.addScaledVector(fwd, arc - bake.s[0]);
    out.radius = bake.radius[0];
    out.openness = bake.openness[0];
    out.tone = bake.tone[0];
    out.offX = bake.off[0];
    out.offY = bake.off[1];
    return 0;
  }
  const i = indexOfArc(bake, arc, hint);
  const j = Math.min(i + 1, bake.count - 1);
  const span = bake.s[j] - bake.s[i];
  const w = span > 1e-6 ? clamp((arc - bake.s[i]) / span, 0, 1) : 0;

  out.pos.fromArray(bake.pos, i * 3);
  out.pos.x += (bake.pos[j * 3] - bake.pos[i * 3]) * w;
  out.pos.y += (bake.pos[j * 3 + 1] - bake.pos[i * 3 + 1]) * w;
  out.pos.z += (bake.pos[j * 3 + 2] - bake.pos[i * 3 + 2]) * w;

  tmpQa.fromArray(bake.quat, i * 4);
  tmpQb.fromArray(bake.quat, j * 4);
  out.quat.copy(tmpQa).slerp(tmpQb, w);

  const lerp = (a: Float32Array) => a[i] + (a[j] - a[i]) * w;
  out.radius = lerp(bake.radius);
  out.openness = lerp(bake.openness);
  out.tone = lerp(bake.tone);
  out.offX = bake.off[i * 2] + (bake.off[j * 2] - bake.off[i * 2]) * w;
  out.offY =
    bake.off[i * 2 + 1] + (bake.off[j * 2 + 1] - bake.off[i * 2 + 1]) * w;
  return i;
}

/** Полное состояние камеры (кресло + пружина шеи) на кадре. */
export type CameraState = {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  index: number; // индекс сэмпла — подсказка для поиска по пути
  arc: number;
  speed: number;
  gx: number;
  gy: number;
  gz: number;
  radius: number;
  openness: number;
  tone: number;
  bank: number;
  climb: number;
};

const headEuler = new THREE.Euler();
const headQuat = new THREE.Quaternion();
const headVec = new THREE.Vector3();

export function cameraAt(bake: FlightBake, frame: number): CameraState {
  const i = Math.min(sampleOfFrame(frame), bake.count - 1);
  const quat = new THREE.Quaternion().fromArray(bake.quat, i * 4);
  const pos = new THREE.Vector3().fromArray(bake.pos, i * 3);

  // Кресло смещено внутри трубы + голова висит на пружине.
  headVec.set(
    bake.off[i * 2] + bake.head[i * 3],
    bake.off[i * 2 + 1] + bake.head[i * 3 + 1],
    bake.head[i * 3 + 2],
  );
  pos.add(headVec.applyQuaternion(quat));

  headEuler.set(
    bake.headRot[i * 3],
    bake.headRot[i * 3 + 1],
    bake.headRot[i * 3 + 2],
    "YXZ",
  );
  quat.multiply(headQuat.setFromEuler(headEuler));

  return {
    pos,
    quat,
    index: i,
    arc: bake.s[i],
    speed: bake.speed[i],
    gx: bake.gLoad[i * 3],
    gy: bake.gLoad[i * 3 + 1],
    gz: bake.gLoad[i * 3 + 2],
    radius: bake.radius[i],
    openness: bake.openness[i],
    tone: bake.tone[i],
    bank: bake.bank[i],
    climb: bake.climb[i],
  };
}

// --- Окно трассы для шейдера ---------------------------------------------
/**
 * Раскладываем участок трассы [−WINDOW_NEAR, +WINDOW_FAR] от камеры в текстуру:
 *   строка 0: rgb = положение точки оси в системе камеры, a = радиус трубы
 *   строка 1: rgb = орт «вправо» сечения,               a = открытость
 *   строка 2: rgb = орт «вверх» сечения,                a = температура палитры
 * Вершинный шейдер берёт отсюда кадр трассы для любого элемента по его пути.
 * Всё считается в системе камеры → в шейдере нет больших координат и джиттера.
 */
export const TRACK_ROWS = 3;

const wPoint: TrackPoint = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  radius: 12,
  openness: 0,
  tone: 0,
  offX: 0,
  offY: 0,
};
const wInv = new THREE.Quaternion();
const wRel = new THREE.Vector3();
const wRight = new THREE.Vector3();
const wUp = new THREE.Vector3();

export function fillTrackWindow(
  bake: FlightBake,
  cam: CameraState,
  data: Float32Array,
): void {
  wInv.copy(cam.quat).invert();
  let hint = cam.index; // окно начинается позади камеры — поиск сдвинется назад
  const row = TRACK_SAMPLES * 4;
  for (let k = 0; k < TRACK_SAMPLES; k++) {
    const arc = cam.arc - WINDOW_NEAR + k * TRACK_STEP;
    hint = trackAt(bake, arc, hint, wPoint);

    wRel.copy(wPoint.pos).sub(cam.pos).applyQuaternion(wInv);
    wRight.set(1, 0, 0).applyQuaternion(wPoint.quat).applyQuaternion(wInv);
    wUp.set(0, 1, 0).applyQuaternion(wPoint.quat).applyQuaternion(wInv);

    const o = k * 4;
    data[o] = wRel.x;
    data[o + 1] = wRel.y;
    data[o + 2] = wRel.z;
    data[o + 3] = wPoint.radius;

    data[row + o] = wRight.x;
    data[row + o + 1] = wRight.y;
    data[row + o + 2] = wRight.z;
    data[row + o + 3] = wPoint.openness;

    data[row * 2 + o] = wUp.x;
    data[row * 2 + o + 1] = wUp.y;
    data[row * 2 + o + 2] = wUp.z;
    data[row * 2 + o + 3] = wPoint.tone;
  }
}
