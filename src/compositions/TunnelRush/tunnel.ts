/**
 * Раскладка тоннеля: один InstancedBufferGeometry на всю трубу (1 draw call).
 *
 * Элементы живут в координатах трассы: (путь aS, угол в сечении aAngle,
 * радиус в долях радиуса трубы). Настоящее положение в кадре вершинный шейдер
 * достаёт из текстуры окна трассы (см. flight.ts) — поэтому вся геометрия
 * честно гнётся вместе с петлями и спиралями, а не «едет мимо камеры».
 *
 * Слои глубины (ради объёма и ощущения масштаба):
 *   SKIN  — обшивка трубы: рёбра, продольные штрихи. Гаснет на «открытых» участках.
 *   RAIL  — рельсы на «полу» и полоса на «потолке». Асимметрия сечения — то
 *           единственное, по чему глаз читает переворот вокруг оси движения.
 *   FRAME — силовой каркас: продольные лонжероны, наружные арки, пилоны.
 *   HULL  — корпус мегаструктуры в 4–9 радиусах от оси. Проявляется, когда
 *           обшивка расходится, и даёт параллакс «мы внутри огромной машины».
 */

import { mulberry32 } from "../../lib/random";
import { LOOP, SUB, type FlightBake } from "./flight";

const TAU = Math.PI * 2;

// Классы (влияют на видимость и палитру)
export const CLASS_SKIN = 0;
export const CLASS_RAIL = 1;
export const CLASS_FRAME = 2;
export const CLASS_HULL = 3;

// Типы геометрии квада
export const TYPE_POLAR = 0; // сектор кольца в плоскости сечения
export const TYPE_LONG = 1; // элемент вдоль трассы (гнётся по ней)
export const TYPE_LIGHT = 2; // билборд-огонёк

/**
 * Атрибуты упакованы в три вектора вместо семи отдельных float-ов: меньше
 * слотов на связывание, меньше памяти и — главное — тип/класс/яркость едут
 * одним буфером, то есть не могут разъехаться между собой.
 */
export type TunnelField = {
  count: number;
  aPath: Float32Array; // 2: (путь по трассе, угол в сечении)
  aGeo: Float32Array; // 4: геометрия, смысл зависит от типа
  aMeta: Float32Array; // 4: (тип, класс, яркость, шум)
};

export function buildTunnel(): TunnelField {
  const rnd = mulberry32(20260725);
  const aPath: number[] = [];
  const aGeo: number[] = [];
  const aMeta: number[] = [];

  const put = (
    s: number,
    angle: number,
    geo: [number, number, number, number],
    type: number,
    cls: number,
    bright: number,
  ) => {
    aPath.push(s, angle);
    aGeo.push(geo[0], geo[1], geo[2], geo[3]);
    aMeta.push(type, cls, bright, rnd());
  };

  // --- 1. Рёбра обшивки: кольца из штрихов -------------------------------
  // Шаг колец рандомизирован ±35%: КОМФОРТ. Строго равномерные кольца на
  // скорости дают мелькание на одной частоте (самое опасное для светочувствительных)
  // и вагонно-колёсный алиасинг на 60 fps. Рваный шаг превращает это в шум.
  {
    let s = 0;
    let n = 0;
    while (s < LOOP) {
      const strong = n % 4 === 0;
      const dashes = 20;
      const phase = rnd() * TAU;
      // Штрихи почти смыкаются в кольцо: сплошная окружность даёт поверхность,
      // по которой глаз читает и радиус трубы, и её изгиб.
      const half = (TAU / dashes) * 0.5;
      for (let d = 0; d < dashes; d++) {
        put(
          s,
          phase + (TAU * d) / dashes,
          [half, 0.94, strong ? 1.02 : 0.985, 0],
          TYPE_POLAR,
          CLASS_SKIN,
          strong ? 1 : 0.7,
        );
      }
      n++;
      s += 7.5 * (0.65 + rnd() * 0.7);
    }
  }

  // --- 2. Продольные штрихи обшивки (скоростные линии) --------------------
  for (let i = 0; i < 300; i++) {
    put(
      rnd() * LOOP,
      rnd() * TAU,
      [0.1 + rnd() * 0.12, 1.6 + rnd() * 5, 0.965, 1],
      TYPE_LONG,
      CLASS_SKIN,
      0.4 + rnd() * 0.5,
    );
  }

  // --- 3. Рельсы «пола» и полоса «потолка» -------------------------------
  // Единственная асимметрия сечения: без неё бочка вокруг оси движения просто
  // не видна — вращать симметричную трубу всё равно что не вращать.
  {
    const rails = [-Math.PI / 2 - 0.36, -Math.PI / 2 + 0.36];
    for (let s = 0; s < LOOP; s += 4.5) {
      for (const a of rails) {
        // Огни тянутся с ростом скорости (см. uStretch) → на гиперскорости
        // сливаются в сплошные линии: это и motion blur, и защита от строба.
        put(s, a, [0.16, 0.7, 0.955, 1], TYPE_LONG, CLASS_RAIL, 1);
      }
      // Маячок между рельсами — «осевая разметка».
      if (Math.round(s / 4.5) % 2 === 0) {
        put(s, -Math.PI / 2, [0.5, 0.93, 0, 0], TYPE_LIGHT, CLASS_RAIL, 0.9);
      }
    }
    for (let s = 0; s < LOOP; s += 9) {
      put(s, Math.PI / 2, [0.13, 1.2, 0.955, 1], TYPE_LONG, CLASS_RAIL, 0.45);
    }
  }

  // --- 4. Силовой каркас: лонжероны вдоль трубы ---------------------------
  {
    const spars = 8;
    for (let k = 0; k < spars; k++) {
      const a = (TAU * k) / spars + 0.2;
      for (let s = 0; s < LOOP; s += 32) {
        put(s + 16, a, [0.22, 15.5, 1.06, 0], TYPE_LONG, CLASS_FRAME, 0.5);
      }
    }
  }

  // --- 5. Наружные арки и пилоны (масштаб конструкции) --------------------
  {
    for (let s = 0; s < LOOP; s += 34) {
      const jitter = (rnd() - 0.5) * 8;
      const dashes = 18;
      const half = (TAU / dashes) * 0.4;
      for (let d = 0; d < dashes; d++) {
        put(
          s + jitter,
          (TAU * d) / dashes + rnd() * 0.1,
          [half, 1.45, 1.62, 0],
          TYPE_POLAR,
          CLASS_FRAME,
          0.75,
        );
      }
      // Пилоны: радиальные стойки от обшивки к наружной арке.
      for (let k = 0; k < 4; k++) {
        put(
          s + jitter,
          (TAU * k) / 4 + 0.4,
          [0.028, 1.05, 2.9, 0],
          TYPE_POLAR,
          CLASS_FRAME,
          0.6,
        );
      }
    }
  }

  // --- 6. Корпус мегаструктуры: далёкие кольца и огни ---------------------
  {
    for (let s = 0; s < LOOP; s += 52) {
      const dashes = 22;
      const half = (TAU / dashes) * 0.42;
      const r = 3.6 + rnd() * 3.6;
      for (let d = 0; d < dashes; d++) {
        put(
          s + (rnd() - 0.5) * 20,
          (TAU * d) / dashes,
          [half, r, r * 1.12, 0],
          TYPE_POLAR,
          CLASS_HULL,
          0.5,
        );
      }
    }
    for (let i = 0; i < 520; i++) {
      const r = 2.6 + rnd() * 5.5;
      put(
        rnd() * LOOP,
        rnd() * TAU,
        [0.5 + rnd() * 1.6, r, 0, 0],
        TYPE_LIGHT,
        CLASS_HULL,
        0.35 + rnd() * 0.5,
      );
    }
    // Продольные балки корпуса — дальний параллакс.
    for (let i = 0; i < 90; i++) {
      put(
        rnd() * LOOP,
        rnd() * TAU,
        [0.5, 22 + rnd() * 22, 3.0 + rnd() * 4.5, 0],
        TYPE_LONG,
        CLASS_HULL,
        0.3 + rnd() * 0.3,
      );
    }
  }

  return {
    count: aPath.length / 2,
    aPath: new Float32Array(aPath),
    aGeo: new Float32Array(aGeo),
    aMeta: new Float32Array(aMeta),
  };
}

// --- Ворота ---------------------------------------------------------------
/**
 * Створчатые ворота: диафрагма, в проём которой аппарат проходит.
 * Проём ставится ТУДА, где на этом пути реально окажется аппарат (его смещение
 * внутри трубы уже запечено), поэтому «пилот» проходит впритирку без подгонки
 * камеры — тоннель спроектирован вокруг траектории, а не наоборот.
 */
export type GateSpec = {
  arc: number; // путь, на котором стоят ворота
  cross: [number, number]; // центр проёма в сечении, м (оси right/up)
  aperture: number; // радиус проёма, м
  wall: number; // радиус трубы здесь, м
  portal: boolean; // финальные врата
};

const GATE_TIMES: readonly (readonly [number, number])[] = [
  // [секунда, радиус проёма в долях радиуса трубы]
  [7.0, 0.46],
  [8.8, 0.4],
  [11.6, 0.42],
  [13.6, 0.36],
  [15.2, 0.44],
  [17.8, 0.38],
  [19.6, 0.34],
  [20.8, 0.42],
  [26.2, 0.4],
  [28.8, 0.36],
  [33.2, 0.44],
  [35.0, 0.38],
  [38.4, 0.5],
  [39.8, 0.46],
  [40.8, 0.42],
  [42.4, 0.66], // финальные врата — выход
];

export function buildGates(bake: FlightBake, fps: number): GateSpec[] {
  return GATE_TIMES.map(([t, k]) => {
    const i = Math.min(Math.round(t * fps) * SUB, bake.count - 1);
    const wall = bake.radius[i];
    return {
      arc: bake.s[i],
      cross: [bake.off[i * 2], bake.off[i * 2 + 1]],
      aperture: Math.max(3.2, wall * k),
      wall,
      portal: t > 42,
    };
  });
}
