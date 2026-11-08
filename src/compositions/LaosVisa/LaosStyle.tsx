/** Доска стиля «Лаосской визы» — показать пользователю приёмы до монтажа. 9 сцен по 4 с. */
import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { FPS } from "./theme";
import { GradedStill, Intertitle, IrisCard, Receipt, RouteMap, TitleScene, TvQuote, Iris } from "./parts";

export const SCENE = 4 * FPS;
const S = (p: string) => `clips/LaosVisa/style/${p}`;

const IrisOut: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  return (
    <>
      <GradedStill src={S("hue.png")} dur={dur} />
      <Iris p={interpolate(f, [dur * 0.35, dur * 0.85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} cx={0.55} cy={0.45} />
    </>
  );
};

const SCENES: React.FC[] = [
  () => <TitleScene art={S("s01_title.png")} dur={SCENE} />,
  () => <Intertitle kicker="ГЛАВА ТРЕТЬЯ" lines={["«Бамбарбия! Киргуду!»"]} sub="или Граница" />,
  () => <IrisCard src={S("pavel.png")} face={[470, 1110]} radius={300} name="Павлик" sub="Глава экспедиции. В первый раз боялся пограничников" />,
  () => <RouteMap from={0} to={1} dur={SCENE} clock={["06:00", "12:00"]} />,
  () => (
    <Receipt
      before={8250000}
      stamp="ЭКОНОМИЯ ≈ $210"
      lines={[
        { label: "Автобус ×6", value: 1320000 },
        { label: "Такси", value: 300000 },
        { label: "Обед", value: 500000 },
        { label: "«Сборы»", value: 600000, hidden: true },
      ]}
    />
  ),
  () => <GradedStill src={S("river.png")} split dur={SCENE} />,
  () => <GradedStill src={S("s02_window.png")} push={0.08} dur={SCENE} />,
  () => <TvQuote quote="«Птичку жалко!»" bg={S("hue.png")} />,
  () => <IrisOut dur={SCENE} />,
];

export const LAOS_STYLE_FRAMES = SCENES.length * SCENE;

export const LaosStyle: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {SCENES.map((Scene, i) => (
      <Sequence key={i} from={i * SCENE} durationInFrames={SCENE}>
        <Scene />
      </Sequence>
    ))}
  </AbsoluteFill>
);
