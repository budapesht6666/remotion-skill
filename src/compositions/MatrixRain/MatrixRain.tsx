import React, { useLayoutEffect, useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { loadFont } from "@remotion/google-fonts/ShareTechMono";
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  buildGlyphAtlasCanvas,
  GLYPH_COUNT,
  mulberry32,
} from "./atlas";
import { rainFragmentShader, rainVertexShader } from "./shaders";

const { fontFamily } = loadFont();

/**
 * РЕЦЕПТ: премиальный 3D «цифровой дождь» Матрицы на @remotion/three.
 *
 * Золотые правила соблюдены:
 *  - Никакого useFrame() — всё состояние (яркость колонок, смена глифов, камера,
 *    разлёт) вычисляется ДЕТЕРМИНИРОВАННО из useCurrentFrame() в useLayoutEffect.
 *  - Поле глифов — один InstancedBufferGeometry (1 draw call на ~2400 глифов) +
 *    кастомный ShaderMaterial с атласом: дёшево для iGPU, множество разных глифов.
 *  - Смена глифа/яркость — через инстансные атрибуты (aGlyph/aBright), позиция
 *    статична, разлёт и закрутка считаются в вершинном шейдере (uScatter/uSwirl).
 *  - WebGL в headless идёт через ANGLE (задано в remotion.config.ts).
 *
 * Драматургия (60fps, 1800 кадров = 30 c):
 *   0–8 c   набор дождя, камера чуть дрейфует
 *   8–18 c  пролёт камеры сквозь слои глифов (честный параллакс)
 *   18–24 c плавный разворот (крен), дождь редеет
 *   24–30 c глифы рассеиваются в чёрное, проявляется надпись
 */

export type MatrixRainProps = {
  title: string;
  headColor: string; // цвет «головы» колонки (почти белый)
  tailColor: string; // цвет хвоста (канонический зелёный)
};

// --- Геометрия поля -------------------------------------------------------
const NX = 15; // колонок по X
const NZ = 8; // слоёв по глубине Z
const ROWS = 20; // глифов в колонке
const COLS = NX * NZ; // 120 колонок
const COUNT = COLS * ROWS; // 2400 глифов
const SY = 2.3; // шаг между глифами по вертикали
const QUAD_W = 1.9;
const QUAD_H = 2.15;

type Field = {
  aOffset: Float32Array;
  aScatterDir: Float32Array;
  aRand: Float32Array;
  colOf: Int16Array;
  rowOf: Int16Array;
  colSpeed: Float32Array;
  colPhase: Float32Array;
  colKill: Float32Array;
  colFlip: Float32Array;
};

function buildField(): Field {
  const rnd = mulberry32(1337);
  const aOffset = new Float32Array(COUNT * 3);
  const aScatterDir = new Float32Array(COUNT * 3);
  const aRand = new Float32Array(COUNT);
  const colOf = new Int16Array(COUNT);
  const rowOf = new Int16Array(COUNT);
  const colSpeed = new Float32Array(COLS);
  const colPhase = new Float32Array(COLS);
  const colKill = new Float32Array(COLS);
  const colFlip = new Float32Array(COLS);

  const xSpan = 17;
  const zNear = -8;
  const zFar = -350;
  let i = 0;
  for (let cz = 0; cz < NZ; cz++) {
    for (let cx = 0; cx < NX; cx++) {
      const c = cz * NX + cx;
      const jitterX = (rnd() - 0.5) * 1.6;
      const jitterZ = (rnd() - 0.5) * 34;
      const x = -xSpan + 2 * xSpan * (cx / (NX - 1)) + jitterX;
      const z = zNear + (zFar - zNear) * (cz / (NZ - 1)) + jitterZ;
      const yTop = (ROWS * SY) / 2 + (rnd() - 0.5) * 6;

      colSpeed[c] = 6 + rnd() * 9; // строк/сек — скорость «головы»
      colPhase[c] = rnd() * (ROWS + 12); // случайный старт потока
      colKill[c] = rnd(); // стаггер рассеивания
      colFlip[c] = 2 + rnd() * 4; // базовая частота смены глифов, Гц

      for (let r = 0; r < ROWS; r++) {
        aOffset[i * 3 + 0] = x;
        aOffset[i * 3 + 1] = yTop - r * SY;
        aOffset[i * 3 + 2] = z;

        const sx = rnd() - 0.5;
        const sy = rnd() - 0.5;
        const sz = rnd() - 0.5;
        const len = Math.hypot(sx, sy, sz) || 1;
        aScatterDir[i * 3 + 0] = sx / len;
        aScatterDir[i * 3 + 1] = sy / len;
        aScatterDir[i * 3 + 2] = sz / len;

        aRand[i] = rnd();
        colOf[i] = c;
        rowOf[i] = r;
        i++;
      }
    }
  }
  return {
    aOffset,
    aScatterDir,
    aRand,
    colOf,
    rowOf,
    colSpeed,
    colPhase,
    colKill,
    colFlip,
  };
}

const TRAIL = 13; // длина светящегося хвоста в строках
const CYC = ROWS + 12; // период «капли» (со тёмным промежутком)

const RainField: React.FC<{ headColor: string; tailColor: string }> = ({
  headColor,
  tailColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const field = useMemo(buildField, []);

  const atlasTexture = useMemo(() => {
    const tex = new THREE.CanvasTexture(buildGlyphAtlasCanvas(64));
    tex.flipY = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(QUAD_W, QUAD_H);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.attributes.position);
    geo.setAttribute("uv", base.attributes.uv);
    geo.instanceCount = COUNT;
    geo.setAttribute(
      "aOffset",
      new THREE.InstancedBufferAttribute(field.aOffset, 3),
    );
    geo.setAttribute(
      "aScatterDir",
      new THREE.InstancedBufferAttribute(field.aScatterDir, 3),
    );
    geo.setAttribute(
      "aRand",
      new THREE.InstancedBufferAttribute(field.aRand, 1),
    );
    geo.setAttribute(
      "aGlyph",
      new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1),
    );
    geo.setAttribute(
      "aBright",
      new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1),
    );
    return geo;
  }, [field]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uAtlasTex: { value: atlasTexture },
          uAtlasGrid: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
          uHeadColor: { value: new THREE.Color(headColor) },
          uTailColor: { value: new THREE.Color(tailColor) },
          uScatter: { value: 0 },
          uSwirl: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: rainVertexShader,
        fragmentShader: rainFragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [atlasTexture, headColor, tailColor],
  );

  // Детерминированный пересчёт кадра: яркость колонок, смена глифов, огибающие.
  useLayoutEffect(() => {
    const t = frame / fps;
    const aGlyph = geometry.getAttribute("aGlyph") as THREE.BufferAttribute;
    const aBright = geometry.getAttribute("aBright") as THREE.BufferAttribute;
    const gArr = aGlyph.array as Float32Array;
    const bArr = aBright.array as Float32Array;
    const { colOf, rowOf, colSpeed, colPhase, colKill, colFlip, aRand } = field;

    const buildIn = interpolate(frame, [0, 70], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    const dissolveFade = interpolate(frame, [1500, 1760], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    });
    const globalOpacity = buildIn * dissolveFade;

    // Стаггер «угасания» колонок при рассеивании.
    const killProgress = interpolate(frame, [1440, 1720], [0, 1.15], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    });

    for (let i = 0; i < COUNT; i++) {
      const c = colOf[i];
      const r = rowOf[i];
      const head = (t * colSpeed[c] + colPhase[c]) % CYC;
      const diff = head - r; // >=0 → строка в светящемся хвосте (выше головы)

      let b: number;
      if (diff < 0 || diff > TRAIL) {
        b = 0.03 + 0.045 * aRand[i]; // слабый ambient-мерцающий фон
      } else {
        const k = 1 - diff / TRAIL; // 1 у головы → 0 в конце хвоста
        b = k * k;
        if (diff < 1.1) b = 1.0; // белая «голова» капли
      }

      const alive =
        1 - Math.min(1, Math.max(0, (killProgress - colKill[c]) * 3));
      bArr[i] = b * alive;

      // Смена глифа: голова скремблится чаще хвоста.
      const flipHz = colFlip[c] * (diff >= 0 && diff < 2 ? 2.4 : 1);
      const step = Math.floor(t * flipHz + aRand[i] * 53 + c * 7);
      let h = (step * 374761393 + i * 668265263) >>> 0;
      h = (h ^ (h >>> 13)) >>> 0;
      gArr[i] = h % GLYPH_COUNT;
    }
    aGlyph.needsUpdate = true;
    aBright.needsUpdate = true;

    material.uniforms.uOpacity.value = globalOpacity;
    material.uniforms.uScatter.value = interpolate(
      frame,
      [1440, 1780],
      [0, 60],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      },
    );
    material.uniforms.uSwirl.value = interpolate(
      frame,
      [1440, 1800],
      [0, 0.5],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.quad),
      },
    );
  }, [frame, fps, geometry, material, field]);

  return (
    <mesh geometry={geometry} material={material} frustumCulled={false} />
  );
};

// Камера: дрейф → пролёт сквозь поле → плавный крен-разворот.
const CameraRig: React.FC = () => {
  const camera = useThree((s) => s.camera);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  useLayoutEffect(() => {
    const t = frame / fps;
    const z = interpolate(
      frame,
      [0, 300, 480, 1080, 1320, 1560, 1800],
      [36, 33, 27, -168, -212, -236, -252],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    const driftEnv = interpolate(
      frame,
      [0, 480, 1440, 1800],
      [0.4, 1, 1, 0.15],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const x = Math.sin(t * 0.5) * 3.2 * driftEnv;
    const y = Math.cos(t * 0.38) * 2.4 * driftEnv;
    camera.position.set(x, y, z);

    // Разворот: крен через up-вектор + лёгкий орбитальный сдвиг цели.
    const roll = interpolate(
      frame,
      [980, 1120, 1420, 1560, 1800],
      [0, 0.05, 0.62, 0.7, 0.72],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.cubic),
      },
    );
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    const tx = Math.sin(t * 0.32) * 2.4 * driftEnv;
    const ty = Math.cos(t * 0.29) * 1.8 * driftEnv;
    camera.lookAt(tx, ty, z - 120);
    camera.updateMatrixWorld();
  }, [frame, fps, camera]);

  return null;
};

// Финальная надпись — DOM-оверлей поверх сцены (чёткий текст + неоновое свечение).
const TitleOverlay: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const green = "#00ff41";

  const appear = interpolate(frame, [1500, 1620], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const scale = interpolate(frame, [1500, 1690], [1.06, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const blur = interpolate(frame, [1500, 1620], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorOn = Math.floor(frame / (fps * 0.5)) % 2 === 0;

  const words = title.split(" ");
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(" ");
  const line2 = words.slice(mid).join(" ");

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity: appear,
          transform: `scale(${scale})`,
          filter: `blur(${blur}px)`,
          textAlign: "center",
          fontFamily,
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            fontSize: 100,
            lineHeight: 1.08,
            letterSpacing: 8,
            color: "#eafff0",
            textShadow: `0 0 12px ${green}, 0 0 34px rgba(0,255,65,.75), 0 0 82px rgba(0,255,65,.45)`,
          }}
        >
          <div>{line1}</div>
          <div>
            {line2}
            <span style={{ opacity: cursorOn ? 1 : 0 }}>_</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const MatrixRain: React.FC<MatrixRainProps> = ({
  title,
  headColor,
  tailColor,
}) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 46, near: 0.1, far: 700, position: [0, 0, 36] }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <RainField headColor={headColor} tailColor={tailColor} />
        <CameraRig />
      </ThreeCanvas>
      <TitleOverlay title={title} />
    </AbsoluteFill>
  );
};
