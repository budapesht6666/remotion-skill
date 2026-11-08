/** Обложка «Лаосской визы» 1280x720: рисунок заставки, название крупно (читается в превью 168x94), штамп с выгодой. */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, F } from "./theme";

export const LaosThumb: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
    <Img
      src={staticFile("clips/LaosVisa/img/gen_s01_title.png")}
      style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.06) translateY(40px)", transformOrigin: "55% 100%" }}
    />
    {/* светлая подложка под заголовком, чтобы буквы не путались с горами */}
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 250, background: "linear-gradient(180deg, rgba(242,230,201,0.95) 55%, rgba(242,230,201,0))" }} />
    <div style={{ position: "absolute", top: 18, width: "100%", textAlign: "center" }}>
      <div
        style={{
          fontFamily: F.deco,
          fontSize: 124,
          lineHeight: 1,
          whiteSpace: "nowrap",
          color: C.brick,
          letterSpacing: 2,
          WebkitTextStroke: `4px ${C.ink}`,
          textShadow: `7px 7px 0 ${C.ink}`,
        }}
      >
        Лаосская виза
      </div>
      <div
        style={{
          display: "inline-block",
          marginTop: 10,
          fontFamily: F.title,
          fontSize: 42,
          color: C.cream,
          background: C.ink,
          padding: "4px 26px 8px",
          borderRadius: 10,
        }}
      >
        или Новые приключения Павлика
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 40,
        bottom: 46,
        transform: "rotate(-10deg)",
        border: `9px solid ${C.brick}`,
        borderRadius: 18,
        padding: "8px 26px 12px",
        background: "rgba(251,246,234,0.92)",
        color: C.brick,
        fontFamily: F.title,
        textAlign: "center",
        boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1.05 }}>ВИЗАРАН</div>
      <div style={{ fontSize: 74, lineHeight: 1 }}>−$210</div>
    </div>
  </AbsoluteFill>
);
