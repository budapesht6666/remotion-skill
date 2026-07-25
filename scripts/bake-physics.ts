/**
 * BAKE-СКРИПТ ФИЗИКИ (мульти-сцена).
 *
 * Прогоняет симуляции cannon-es ОДИН РАЗ детерминированно и запекает трансформы
 * всех тел по кадрам в JSON рядом с композицией. Рендер Remotion движок уже не
 * трогает — читает готовый JSON как чистую функцию кадра, поэтому золотое правило
 * «кадр = f(useCurrentFrame())» соблюдается автоматически, а скраб/still/полный
 * рендер всегда идентичны (см. обсуждение Remotion #4373 «Physics Engine, Baking»).
 *
 * Запуск:  npm run bake            # запечь все сцены
 *          npm run bake -- shells  # только одну
 *
 * Сцены:
 *   poc    → src/compositions/PhysicsScene/sim.json  (падающая стопка кубов)
 *   shells → src/compositions/ShellEject/sim.json    (выстрел + вылет гильз)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as CANNON from "cannon-es";
import { FORMAT, seconds } from "../src/lib/format";
import { mulberry32, range } from "../src/lib/random";

const FPS = FORMAT.fps; // 30
const SUBSTEPS = 4; // фикс. субшаги на кадр — устойчивость без потери детерминизма
const SUB_DT = 1 / FPS / SUBSTEPS;

type BodyMeta = {
  type: "box" | "cylinder";
  color: string;
  half?: [number, number, number]; // box (рендер)
  radius?: number; // cylinder (рендер)
  height?: number; // cylinder (рендер)
  fireFrame?: number; // кадр появления/«выстрела» (для gate видимости в рендере)
};

type Scene = {
  name: string;
  outDir: string;
  frameCount: number;
  world: CANNON.World;
  bodies: CANNON.Body[];
  meta: BodyMeta[];
  onFrame?: (f: number) => void; // мутатор перед шагом (активация гильз и т.п.)
};

// --- Общие помощники ---------------------------------------------------------
function makeWorld(): CANNON.World {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON.GSSolver).iterations = 20;
  world.allowSleep = false;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.2;
  return world;
}

function addGround(world: CANNON.World, mat: CANNON.Material): void {
  const ground = new CANNON.Body({ mass: 0, material: mat, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // нормаль +Z → +Y
  world.addBody(ground);
}

// --- Сцена POC: падающая стопка кубов ----------------------------------------
function buildPoc(): Scene {
  const world = makeWorld();
  const mat = new CANNON.Material("default");
  addGround(world, mat);

  const rng = mulberry32(20260725);
  const COUNT = 8;
  const HALF = 0.5;
  const bodies: CANNON.Body[] = [];
  const meta: BodyMeta[] = [];
  for (let i = 0; i < COUNT; i++) {
    const body = new CANNON.Body({
      mass: 1,
      material: mat,
      shape: new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)),
    });
    body.position.set(range(rng, -0.35, 0.35), 0.75 + i * 1.06, range(rng, -0.35, 0.35));
    body.quaternion.setFromEuler(range(rng, -0.25, 0.25), range(rng, -0.4, 0.4), range(rng, -0.25, 0.25));
    body.angularVelocity.set(range(rng, -0.6, 0.6), range(rng, -0.6, 0.6), range(rng, -0.6, 0.6));
    world.addBody(body);
    bodies.push(body);
    meta.push({ type: "box", half: [HALF, HALF, HALF], color: `hsl(${Math.round((i / COUNT) * 360)}, 70%, 60%)` });
  }
  return { name: "poc", outDir: "src/compositions/PhysicsScene", frameCount: seconds(6), world, bodies, meta };
}

// --- Сцена SHELLS: выстрел + вылет гильз --------------------------------------
// Каждая гильза «спит» (STATIC, без коллизий) в порту до своего кадра выстрела,
// затем активируется в DYNAMIC с импульсом вылета и сильным кувырком.
function buildShells(): Scene {
  const world = makeWorld();
  const mat = new CANNON.Material("default");
  // Гильзы: латунь звенит и отскакивает.
  const shellContact = new CANNON.ContactMaterial(mat, mat, { friction: 0.6, restitution: 0.3 });
  world.addContactMaterial(shellContact);
  addGround(world, mat);

  const rng = mulberry32(4242);
  const SPAWN = new CANNON.Vec3(0.35, 3.7, 0.12); // порт эжекции (мир): верх-зад слайда
  const fireFrames = [8, 20, 32];
  const R = 0.15;
  const H = 0.5;

  const bodies: CANNON.Body[] = [];
  const meta: BodyMeta[] = [];
  const shells: { body: CANNON.Body; fire: number; vel: CANNON.Vec3; ang: CANNON.Vec3 }[] = [];

  for (let i = 0; i < fireFrames.length; i++) {
    // Коллайдер — тонкая коробка вдоль Y (робастнее цилиндра); рендер = цилиндр по Y.
    const body = new CANNON.Body({
      mass: 0.05,
      material: mat,
      shape: new CANNON.Box(new CANNON.Vec3(R, H / 2, R)),
    });
    body.type = CANNON.Body.STATIC;
    body.collisionResponse = false;
    body.position.copy(SPAWN);
    body.quaternion.setFromEuler(0, 0, -Math.PI / 2); // лежит вдоль ствола (X)
    body.linearDamping = 0.01;
    body.angularDamping = 0.12; // гасит «шагающий» перекат после приземления
    world.addBody(body);
    bodies.push(body);

    shells.push({
      body,
      fire: fireFrames[i],
      // Вверх сильно (pop), в сторону слабо — чтобы кувырок и осадка были в кадре у пистолета.
      vel: new CANNON.Vec3(range(rng, 0.4, 0.9), range(rng, 4.3, 5.1), range(rng, 1.1, 1.9)),
      ang: new CANNON.Vec3(range(rng, -17, 17), range(rng, -10, 10), range(rng, -17, 17)),
    });
    meta.push({ type: "cylinder", radius: R, height: H, color: "#c9a24a", fireFrame: fireFrames[i] });
  }

  const onFrame = (f: number) => {
    for (const s of shells) {
      if (f === s.fire) {
        s.body.type = CANNON.Body.DYNAMIC;
        s.body.collisionResponse = true;
        s.body.updateMassProperties();
        s.body.wakeUp();
        s.body.velocity.copy(s.vel);
        s.body.angularVelocity.copy(s.ang);
      }
    }
  };

  return { name: "shells", outDir: "src/compositions/ShellEject", frameCount: seconds(5), world, bodies, meta, onFrame };
}

// --- Запекание ---------------------------------------------------------------
function bake(scene: Scene): void {
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  const frames: number[][] = [];
  for (let f = 0; f < scene.frameCount; f++) {
    if (scene.onFrame) scene.onFrame(f);
    const row: number[] = [];
    for (const b of scene.bodies) {
      row.push(
        round(b.position.x), round(b.position.y), round(b.position.z),
        round(b.quaternion.x), round(b.quaternion.y), round(b.quaternion.z), round(b.quaternion.w),
      );
    }
    frames.push(row);
    for (let s = 0; s < SUBSTEPS; s++) scene.world.step(SUB_DT);
  }

  const out = { fps: FPS, frameCount: scene.frameCount, stride: 7, bodies: scene.meta, frames };
  const dir = path.resolve(process.cwd(), scene.outDir);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "sim.json");
  writeFileSync(file, JSON.stringify(out));

  const finite = frames.every((r) => r.every((n) => Number.isFinite(n)));
  console.log(`[${scene.name}] запечено ${scene.frameCount} кадров × ${scene.bodies.length} тел → ${file}  (конечны=${finite})`);
  if (!finite) process.exit(1);
}

function main() {
  const scenes: Record<string, () => Scene> = { poc: buildPoc, shells: buildShells };
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(scenes);
  for (const n of names) {
    const factory = scenes[n];
    if (!factory) {
      console.error(`Неизвестная сцена "${n}". Доступны: ${Object.keys(scenes).join(", ")}`);
      process.exit(1);
    }
    bake(factory());
  }
}

main();
