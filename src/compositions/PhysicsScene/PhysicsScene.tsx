import React, { useLayoutEffect, useRef } from "react";
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
import sim from "./sim.json";

/**
 * РЕЦЕПТ (PoC): физическая 3D-сцена с облётом камеры.
 *
 * Золотые правила соблюдены:
 *  - Никакого useFrame() и шага физики в рендере. Симуляция ЗАПЕЧЕНА заранее
 *    скриптом (npm run bake → sim.json); здесь только читаем трансформы по кадру.
 *  - Всё состояние (позы тел, камера) — детерминированная функция
 *    useCurrentFrame() внутри useLayoutEffect. Скраб/still/рендер идентичны.
 *  - WebGL в headless идёт через ANGLE (задано в remotion.config.ts).
 *
 * Пайплайн-эталон, от которого растим герой-сцены (гильза при выстреле) и слой
 * эффектов (вспышка/дым/искры). См. CLAUDE.md и /remotion-3d.
 */

type BodyMeta = { type: string; half: [number, number, number]; color: string };
type Sim = {
  fps: number;
  frameCount: number;
  stride: number;
  bodies: BodyMeta[];
  frames: number[][];
};

const SIM = sim as unknown as Sim;

// Тела: по мешу на запечённое тело; поза берётся из sim.frames[frame].
const BodiesRig: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const frame = useCurrentFrame();

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const f = Math.min(Math.max(frame, 0), SIM.frameCount - 1);
    const row = SIM.frames[f];
    group.children.forEach((child, i) => {
      const o = i * SIM.stride;
      child.position.set(row[o], row[o + 1], row[o + 2]);
      child.quaternion.set(row[o + 3], row[o + 4], row[o + 5], row[o + 6]);
    });
  }, [frame]);

  return (
    <group ref={groupRef}>
      {SIM.bodies.map((b, i) => (
        <mesh key={i}>
          <boxGeometry args={[b.half[0] * 2, b.half[1] * 2, b.half[2] * 2]} />
          <meshStandardMaterial color={b.color} roughness={0.45} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
};

// Камера: облёт по окружности (полярная математика) как чистая функция кадра.
const CameraRig: React.FC = () => {
  const camera = useThree((s) => s.camera);
  const frame = useCurrentFrame();

  useLayoutEffect(() => {
    const angle = interpolate(
      frame,
      [0, SIM.frameCount],
      [-Math.PI * 0.28, Math.PI * 0.62],
      { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) },
    );
    const radius = 16;
    const camY = interpolate(frame, [0, SIM.frameCount], [9.5, 5.5], {
      extrapolateRight: "clamp",
    });
    camera.position.set(Math.sin(angle) * radius, camY, Math.cos(angle) * radius);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 2.4, 0);
    camera.updateMatrixWorld();
  }, [frame, camera]);

  return null;
};

export const PhysicsScene: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, #0b1020 0%, #05070d 100%)" }}
    >
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 34, near: 0.1, far: 200, position: [0, 9.5, 16] }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: "absolute", inset: 0 }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 12, 8]} intensity={1.4} />
        <directionalLight position={[-8, 5, -6]} intensity={0.4} />

        {/* Пол */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#161d2e" roughness={0.95} metalness={0} />
        </mesh>

        <BodiesRig />
        <CameraRig />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
