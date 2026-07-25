import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  Easing,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import sim from "./sim.json";

/**
 * РЕЦЕПТ (герой-сцена, Тир 1 + реализм-проход): выстрел с вылетом гильз.
 *
 * Реализм: настоящая GLTF-модель пистолета (материал gunmetal) + IBL
 * (RoomEnvironment/PMREM — отражения без внешнего HDRI) + ACES tone mapping +
 * мягкие тени. Модель — "9mm Pistol" by Quaternius (CC0, статичный проп; см.
 * public/models/CREDITS.md).
 *
 * Золотые правила: физика ЗАПЕЧЕНА (npm run bake -- shells → sim.json), рендер
 * читает позы гильз по useCurrentFrame(); async-загрузка модели — в delayRender.
 */

type BodyMeta = { type: string; color: string; radius?: number; height?: number; fireFrame?: number };
type Sim = { fps: number; frameCount: number; stride: number; bodies: BodyMeta[]; frames: number[][] };

const SIM = sim as unknown as Sim;
const GUN_ORIGIN: [number, number, number] = [0, 3.5, 0];
const PISTOL_ROT: [number, number, number] = [0, 0, 0]; // подгоняется по стиллам
const TARGET_LEN = 2.4; // целевой габарит пистолета (юниты сцены)
const PISTOL_URL = staticFile("models/pistol9mm.glb");

// GLTF-пистолет: нормализовать размер/центр, gunmetal-материал под IBL.
const Pistol: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const threeScene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [content, setContent] = useState<{
    scene: THREE.Group;
    fit: number;
    center: THREE.Vector3;
  } | null>(null);
  const [handle] = useState(() => delayRender("Загрузка модели пистолета"));

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      PISTOL_URL,
      (gltf) => {
        const root = gltf.scene;
        root.updateWorldMatrix(true, true);
        const box = new THREE.Box3();
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.receiveShadow = true;
          // gunmetal под IBL: сохраняем цвет модели, добавляем металличность
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm) => {
            const mat = mm as THREE.MeshStandardMaterial;
            if (mat && mat.isMeshStandardMaterial) {
              mat.metalness = 0.7;
              mat.roughness = 0.5;
              mat.envMapIntensity = 1.0;
            }
          });
          box.expandByObject(m);
        });
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        setContent({ scene: root, fit: TARGET_LEN / maxDim, center });
      },
      undefined,
      (err) => cancelRender(err),
    );
  }, []);

  // Модель грузится async и попадает в сцену уже ПОСЛЕ обычной отрисовки кадра.
  // После коммита с моделью принудительно перерисовываем сцену и только затем
  // снимаем кадр — иначе пистолет не попадёт в снимок.
  useEffect(() => {
    if (!content) return;
    gl.render(threeScene, camera);
    continueRender(handle);
  }, [content, handle, gl, threeScene, camera]);

  if (!content) return null;
  const { scene, fit, center } = content;
  return (
    <group position={GUN_ORIGIN} rotation={PISTOL_ROT}>
      <group scale={fit} position={[-center.x * fit, -center.y * fit, -center.z * fit]}>
        <primitive object={scene} />
      </group>
    </group>
  );
};

// IBL (RoomEnvironment) + ACES + тени. Настраивается синхронно до кадра.
const SceneSetup: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.15;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.6; // отражения есть, но сцена остаётся тёмной/moody
    return () => {
      env.texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
};

// Гильзы: поза из sim.frames[frame]; видимость включается на кадре выстрела.
const ShellsRig: React.FC = () => {
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
      child.visible = frame >= (SIM.bodies[i].fireFrame ?? 0);
    });
  }, [frame]);

  return (
    <group ref={groupRef}>
      {SIM.bodies.map((b, i) => (
        <mesh key={i} castShadow receiveShadow>
          <cylinderGeometry args={[b.radius, b.radius, b.height, 20]} />
          <meshStandardMaterial color={b.color} metalness={0.95} roughness={0.28} envMapIntensity={1.1} />
        </mesh>
      ))}
    </group>
  );
};

// Камера: облёт по профилю пистолета + спуск за гильзами (чистая функция кадра).
const CameraRig: React.FC = () => {
  const camera = useThree((s) => s.camera);
  const frame = useCurrentFrame();

  useLayoutEffect(() => {
    const N = SIM.frameCount;
    const angle = interpolate(frame, [0, N], [-Math.PI * 0.25, Math.PI * 0.25], {
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    });
    const radius = interpolate(frame, [0, 45, N], [8, 7.2, 8.4], {
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    });
    const camY = interpolate(frame, [0, N], [4.7, 3.0], {
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    });
    const targetY = interpolate(frame, [0, N], [3.5, 1.9], { extrapolateRight: "clamp" });

    camera.position.set(Math.sin(angle) * radius, camY, Math.cos(angle) * radius);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, targetY, 0);
    camera.updateMatrixWorld();
  }, [frame, camera]);

  return null;
};

export const ShellEject: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 34%, #17141a 0%, #060709 72%)" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 34, near: 0.1, far: 200, position: [0, 4.7, 8] }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <SceneSetup />

        <ambientLight intensity={0.15} />
        <directionalLight
          position={[6, 12, 8]}
          intensity={2.0}
          color="#fff4e6"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-6, 5, -7]} intensity={0.5} color="#9fb8ff" />
        <pointLight position={[1.2, 3.9, 1.6]} intensity={10} distance={7} decay={2} color="#ffb45a" />

        <Pistol />
        <ShellsRig />

        {/* Пол */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color="#12151d" roughness={0.95} metalness={0.1} />
        </mesh>

        <CameraRig />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
