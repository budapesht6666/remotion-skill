/**
 * Проверка полётного плана TunnelRush БЕЗ рендера: `npm run flight`.
 *
 * Печатает посекундную телеметрию (скорость, перегрузки, крен, радиус виража)
 * и сводку по актам. Нужен, чтобы ловить нефизичное до того, как оно попадёт
 * в кадр: перегрузку в 12 g, недокрученную петлю, крен быстрее комфортного
 * предела, слишком тугой вираж на гиперскорости.
 */

import { Quaternion, Vector3 } from "three";
import {
  ACTS,
  DURATION_FRAMES,
  FPS,
  G,
  SUB,
  actAt,
  bakeFlight,
  cameraAt,
} from "../src/compositions/TunnelRush/flight";

const bake = bakeFlight();
const deg = (r: number) => (r * 180) / Math.PI;

console.log("t     act          v(km/h)  n(g)   ax(g)  крен°   тангаж°  R(м)     s(м)");
for (let t = 0; t <= 45; t += 1) {
  const frame = Math.min(Math.round(t * FPS), DURATION_FRAMES);
  const c = cameraAt(bake, frame);
  const i = Math.min(frame * SUB, bake.count - 1);
  // Радиус кривизны траектории: R = v² / a_поперечное
  const aLat = Math.hypot(bake.gLoad[i * 3], bake.gLoad[i * 3 + 1] - 1) * G;
  const R = aLat > 0.4 ? c.speed ** 2 / aLat : Infinity;
  console.log(
    [
      t.toFixed(0).padStart(2),
      actAt(t).label.padEnd(12),
      (c.speed * 3.6).toFixed(0).padStart(7),
      c.gy.toFixed(2).padStart(6),
      c.gz.toFixed(2).padStart(6),
      deg(c.bank).toFixed(0).padStart(6),
      deg(c.climb).toFixed(0).padStart(8),
      (R === Infinity ? "∞" : R.toFixed(0)).padStart(7),
      c.arc.toFixed(0).padStart(8),
    ].join(" "),
  );
}

// --- Сводка по актам и предельные значения --------------------------------
let maxG = 0;
let minG = 99;
let maxLat = 0;
// Угловые скорости меряем в осях аппарата: мировой крен вырождается на
// вертикальном тангаже (в петле) и даёт ложные сотни °/с.
const rates = [0, 0, 0]; // pitch, yaw, roll
const qa = new Quaternion();
const qb = new Quaternion();
for (let i = 0; i < DURATION_FRAMES * SUB; i++) {
  const gy = bake.gLoad[i * 3 + 1];
  maxG = Math.max(maxG, gy);
  minG = Math.min(minG, gy);
  maxLat = Math.max(maxLat, Math.abs(bake.gLoad[i * 3]));
  if (i > 0) {
    qa.fromArray(bake.quat, (i - 1) * 4).invert();
    qb.fromArray(bake.quat, i * 4);
    qa.multiply(qb);
    const k = 2 * FPS * SUB;
    rates[0] = Math.max(rates[0], Math.abs(qa.x) * k);
    rates[1] = Math.max(rates[1], Math.abs(qa.y) * k);
    rates[2] = Math.max(rates[2], Math.abs(qa.z) * k);
  }
}

console.log("\nАкты:");
for (const a of ACTS) {
  const c0 = cameraAt(bake, Math.round(a.from * FPS));
  const c1 = cameraAt(bake, Math.min(Math.round(a.to * FPS), DURATION_FRAMES));
  console.log(
    `  ${a.label.padEnd(12)} ${a.from.toFixed(1)}–${a.to.toFixed(1)} c   ` +
      `${(c0.speed * 3.6).toFixed(0)} → ${(c1.speed * 3.6).toFixed(0)} км/ч   ` +
      `путь ${(c1.arc - c0.arc).toFixed(0)} м`,
  );
}

// Суммарный поворот вектора скорости за акт — для петли должно быть ≈360°.
const turnOfAct = (from: number, to: number): number => {
  const q = new Quaternion();
  const f = new Vector3();
  const prev = new Vector3();
  let sum = 0;
  for (
    let i = Math.round(from * FPS * SUB);
    i < Math.round(to * FPS * SUB);
    i += SUB
  ) {
    q.fromArray(bake.quat, i * 4);
    f.set(0, 0, -1).applyQuaternion(q);
    if (i > Math.round(from * FPS * SUB)) {
      sum += Math.acos(Math.min(1, Math.max(-1, f.dot(prev))));
    }
    prev.copy(f);
  }
  return deg(sum);
};

console.log("\nПоворот вектора скорости за акт (петля должна быть ≈360°):");
for (const a of ACTS) {
  console.log(`  ${a.label.padEnd(12)} ${turnOfAct(a.from, a.to).toFixed(0)}°`);
}

const total = cameraAt(bake, DURATION_FRAMES);
console.log(
  `\nВсего: путь ${(total.arc / 1000).toFixed(2)} км, ` +
    `сэмплов ${bake.count}, макс n = ${maxG.toFixed(2)} g, ` +
    `мин n = ${minG.toFixed(2)} g, макс боковая = ${maxLat.toFixed(2)} g`,
);
console.log(
  `Угловые скорости (в осях аппарата): тангаж ${deg(rates[0]).toFixed(0)}°/с, ` +
    `рыскание ${deg(rates[1]).toFixed(0)}°/с, крен ${deg(rates[2]).toFixed(0)}°/с ` +
    `(комфортный предел крена — 135°/с)`,
);
