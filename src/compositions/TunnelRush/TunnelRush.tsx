import React, { useLayoutEffect, useMemo, useRef } from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { tunnelFragmentShader, tunnelVertexShader } from "./shaders";
import {
  DURATION_FRAMES,
  LOOP,
  TRACK_ROWS,
  TRACK_SAMPLES,
  TRACK_STEP,
  WINDOW_FAR,
  WINDOW_NEAR,
  bakeFlight,
  cameraAt,
  fillTrackWindow,
  fovAt,
  trackAt,
  type CameraState,
  type FlightBake,
  type TrackPoint,
} from "./flight";
import { buildGates, buildTunnel, type GateSpec, type TunnelField } from "./tunnel";
import { Atmosphere, Hud, Titles } from "./Hud";

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * РЕЦЕПТ: полёт по трубе на настоящей полётной физике.
 *
 * Чем отличается от «красивого пролёта»:
 *  - Трасса не задана синусами, а проинтегрирована из команд пилота (крен +
 *    перегрузка). Радиус виража = v²/(n·g), поэтому на 1600 км/ч поворот
 *    физически пологий и величественный, а тугую петлю приходится проходить,
 *    сбросив скорость торможением в 5 g. См. flight.ts и `npm run flight`.
 *  - Труба живёт в координатах трассы и честно гнётся вместе с ней: петля,
 *    бочка, штопор, спираль — это геометрия, а не поворот камеры.
 *  - Камера = голова пилота на пружине: перегрузки вжимают в кресло, торможение
 *    бросает вперёд, голова отстаёт от вращения корпуса. Плюс микровибрация
 *    корпуса — это и даёт «эффект присутствия», которого нет у жёсткой камеры.
 *  - Глубина набирается слоями: обшивка → силовой каркас → корпус мегаструктуры
 *    в 4–9 радиусах от оси, который проступает, когда обшивка расходится.
 *
 * КОМФОРТ (ролик не должен провоцировать светочувствительность и укачивание):
 *  - Скорость крена ограничена 135°/с, все команды идут через smoothstep —
 *    без рывков ускорения.
 *  - Шаг колец рваный (±35%), а на скорости выше ~200 м/с кольца гаснут: строго
 *    периодическое мелькание — главный риск, стрики и рельсы его заменяют.
 *  - Нет вспышек во весь кадр: warp на портале — мягкий налив за 0.35 с с
 *    потолком по яркости, палитра переливается медленно.
 *  - Виньетка поджимается на скорости (приём VR-комфорта: гасим периферийный
 *    поток), в центре — статичный прицел как опора для глаза.
 */

export type TunnelRushProps = {
  hook: string;
  taunt: string;
  outroTitle: string;
  outroSub: string;
  neonA: string;
  neonB: string;
  danger: string;
  musicSrc: string | null;
};

const RAIL_COLOR = "#fff0d2";
const HAZE_COLOR = "#0b1a34";
const MIN_PIXEL = 1.4;
/** Выдержка «виртуального затвора»: смаз = скорость × это. */
const SHUTTER = 1 / 50;

// --- Труба ----------------------------------------------------------------
const TunnelMesh: React.FC<{
  bake: FlightBake;
  field: TunnelField;
  cam: CameraState;
  fov: number;
  heightPx: number;
  exposure: number;
  cool: string;
  mid: string;
  warm: string;
}> = ({ bake, field, cam, fov, heightPx, exposure, cool, mid, warm }) => {
  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(2, 2); // position ∈ [−1, 1]
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.attributes.position);
    geo.setAttribute("uv", base.attributes.uv);
    geo.instanceCount = field.count;
    const put = (name: string, arr: Float32Array, size: number) =>
      geo.setAttribute(name, new THREE.InstancedBufferAttribute(arr, size));
    put("aPath", field.aPath, 2);
    put("aGeo", field.aGeo, 4);
    put("aMeta", field.aMeta, 4);
    return geo;
  }, [field]);

  const trackData = useMemo(
    () => new Float32Array(TRACK_SAMPLES * TRACK_ROWS * 4),
    [],
  );

  const trackTex = useMemo(() => {
    const tex = new THREE.DataTexture(
      trackData,
      TRACK_SAMPLES,
      TRACK_ROWS,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, [trackData]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTrack: { value: trackTex },
          uTrackDim: { value: new THREE.Vector2(TRACK_SAMPLES, TRACK_ROWS) },
          uTravel: { value: 0 },
          uLoop: { value: LOOP },
          uNear: { value: WINDOW_NEAR },
          uStep: { value: TRACK_STEP },
          uStretch: { value: 0 },
          uPixelScale: { value: 1000 },
          uMinPx: { value: MIN_PIXEL },
          uFogFar: { value: WINDOW_FAR },
          uPolarFade: { value: 1 },
          uCool: { value: new THREE.Color(cool) },
          uMid: { value: new THREE.Color(mid) },
          uWarm: { value: new THREE.Color(warm) },
          uRail: { value: new THREE.Color(RAIL_COLOR) },
          uHaze: { value: new THREE.Color(HAZE_COLOR) },
          uExposure: { value: 1 },
        },
        vertexShader: tunnelVertexShader,
        fragmentShader: tunnelFragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        // Кольца лежат в плоскости сечения — их нормаль смотрит вдоль трассы.
        // Без DoubleSide backface culling срезает всю кольцевую геометрию.
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [trackTex, cool, mid, warm],
  );

  useLayoutEffect(() => {
    fillTrackWindow(bake, cam, trackData);
    trackTex.needsUpdate = true;

    const u = material.uniforms;
    u.uTravel.value = cam.arc;
    u.uStretch.value = cam.speed * SHUTTER;
    u.uPixelScale.value =
      (heightPx * 0.5) / Math.tan(((fov * Math.PI) / 180) * 0.5);
    // Анти-строб: кольца гаснут, когда частота их пролёта уходит в мельтешение.
    u.uPolarFade.value =
      1 - 0.82 * smoothstep(190, 360, cam.speed);
    u.uExposure.value = exposure;
  }, [bake, cam, trackData, trackTex, material, fov, heightPx, exposure]);

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
};

// --- Ворота-диафрагмы -----------------------------------------------------
const gateVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const gateFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // vUv.y — от кромки проёма (0) к стене (1), vUv.x — вдоль створки.
    float lip = 1.0 - smoothstep(0.0, 0.32, vUv.y);
    float weld = smoothstep(0.86, 1.0, vUv.y);
    float ends = 1.0 - smoothstep(0.82, 1.0, abs(vUv.x * 2.0 - 1.0));
    float a = (0.05 + lip * 0.55 + weld * 0.22) * ends * uOpacity;
    if (a < 0.004) discard;
    vec3 col = mix(uColor, vec3(1.0), lip * 0.55);
    gl_FragColor = vec4(col, a);
  }
`;

/** Створки диафрагмы: кольцевые сектора от проёма к стене трубы. */
function makeIrisGeometry(
  aperture: number,
  wall: number,
  blades: number,
  fill: number,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const seg = 8;
  const span = ((Math.PI * 2) / blades) * fill;
  for (let b = 0; b < blades; b++) {
    const a0 = ((Math.PI * 2) / blades) * b - span / 2;
    for (let k = 0; k < seg; k++) {
      const t0 = k / seg;
      const t1 = (k + 1) / seg;
      const A0 = a0 + span * t0;
      const A1 = a0 + span * t1;
      const p = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r, 0];
      const q00 = p(A0, aperture);
      const q10 = p(A1, aperture);
      const q01 = p(A0, wall);
      const q11 = p(A1, wall);
      pos.push(...q00, ...q01, ...q11, ...q00, ...q11, ...q10);
      uv.push(t0, 0, t0, 1, t1, 1, t0, 0, t1, 1, t1, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

const GateRig: React.FC<{
  bake: FlightBake;
  gates: GateSpec[];
  cam: CameraState;
  color: string;
}> = ({ bake, gates, cam, color }) => {
  const groups = useRef<(THREE.Group | null)[]>([]);

  const built = useMemo(
    () =>
      gates.map((g) => ({
        geo: makeIrisGeometry(
          g.aperture,
          g.wall * 1.02,
          g.portal ? 12 : 6,
          g.portal ? 0.9 : 0.78,
        ),
        mat: new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color(color) },
            uOpacity: { value: 0 },
          },
          vertexShader: gateVertexShader,
          fragmentShader: gateFragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      })),
    [gates, color],
  );

  useLayoutEffect(() => {
    const inv = cam.quat.clone().invert();
    const point: TrackPoint = {
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      radius: 12,
      openness: 0,
      tone: 0,
      offX: 0,
      offY: 0,
    };
    const rel = new THREE.Vector3();
    const cross = new THREE.Vector3();

    gates.forEach((g, i) => {
      const group = groups.current[i];
      if (!group) return;
      const d = g.arc - cam.arc;
      if (d < 8 || d > WINDOW_FAR * 0.98) {
        group.visible = false;
        return;
      }
      group.visible = true;
      trackAt(bake, g.arc, cam.index, point);
      cross.set(g.cross[0], g.cross[1], 0).applyQuaternion(point.quat);
      rel.copy(point.pos).add(cross).sub(cam.pos).applyQuaternion(inv);
      group.position.copy(rel);
      group.quaternion.copy(point.quat).premultiply(inv);
      group.updateMatrixWorld();
      // КОМФОРТ: створки успевают погаснуть ДО камеры. Вплотную аддитивная
      // пластина залила бы весь кадр — это резкий скачок яркости, недопустимый
      // для светочувствительных зрителей.
      built[i].mat.uniforms.uOpacity.value =
        (1 - smoothstep(WINDOW_FAR * 0.55, WINDOW_FAR * 0.95, d)) *
        smoothstep(10, 52, d);
    });
  }, [bake, gates, cam, built]);

  return (
    <>
      {gates.map((g, i) => (
        <group
          key={g.arc}
          ref={(el) => {
            groups.current[i] = el;
          }}
          visible={false}
        >
          <mesh geometry={built[i].geo} material={built[i].mat} frustumCulled={false} />
        </group>
      ))}
    </>
  );
};

// --- Камера ---------------------------------------------------------------
/**
 * Камера стоит в начале координат с единичной ориентацией: мир приходит к ней
 * уже пересчитанным (см. fillTrackWindow). Так на восьмом километре трассы нет
 * дрожания float, а вся «езда» остаётся чистой функцией кадра.
 */
const CameraRig: React.FC<{ fov: number }> = ({ fov }) => {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera && persp.fov !== fov) {
      persp.fov = fov;
      persp.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }, [camera, fov]);
  return null;
};

// --- Композиция -----------------------------------------------------------
export const TunnelRush: React.FC<TunnelRushProps> = ({
  hook,
  taunt,
  outroTitle,
  outroSub,
  neonA,
  neonB,
  danger,
  musicSrc,
}) => {
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  const bake = useMemo(() => bakeFlight(), []);
  const field = useMemo(() => buildTunnel(), []);
  const gates = useMemo(() => buildGates(bake, fps), [bake, fps]);

  const cam = useMemo(() => cameraAt(bake, frame), [bake, frame]);
  const t = frame / fps;
  const fov = fovAt(t);

  // Экспозиция: тоннель «зажигается» на старте и слегка наливается к вратам.
  // Все изменения медленные (≥0.4 с) — резкие скачки яркости недопустимы.
  const exposure =
    interpolate(frame, [0, 26, 70], [0.62, 1.05, 1.14], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) *
    (1 + 0.16 * smoothstep(2400, 2545, frame) * (1 - smoothstep(2560, 2650, frame)));

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 70% at 50% 42%, #071226 0%, #03060f 55%, #010206 100%)",
      }}
    >
      <ThreeCanvas
        width={width}
        height={height}
        camera={{
          fov,
          near: 0.25,
          far: WINDOW_FAR + 260,
          position: [0, 0, 0],
        }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <TunnelMesh
          bake={bake}
          field={field}
          cam={cam}
          fov={fov}
          heightPx={height}
          exposure={exposure}
          cool={neonA}
          mid={neonB}
          warm={danger}
        />
        <GateRig bake={bake} gates={gates} cam={cam} color={neonA} />
        <CameraRig fov={fov} />
      </ThreeCanvas>

      <Atmosphere cam={cam} accent={neonA} danger={danger} />
      <Hud cam={cam} accent={neonA} danger={danger} />
      <Titles
        hook={hook}
        taunt={taunt}
        outroTitle={outroTitle}
        outroSub={outroSub}
        accent={neonA}
        danger={danger}
      />

      {musicSrc ? (
        <Audio
          src={staticFile(musicSrc)}
          volume={(f) =>
            interpolate(
              f,
              [0, 50, durationInFrames - 110, durationInFrames],
              [0, 0.36, 0.36, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};

export { DURATION_FRAMES };
