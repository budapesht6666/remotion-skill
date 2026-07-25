/**
 * GLSL тоннеля. Камера ВСЕГДА стоит в начале координат с единичной ориентацией,
 * а участок трассы вокруг неё приходит текстурой окна (flight.ts → fillTrackWindow):
 *
 *   строка 0: rgb = точка оси трубы в системе камеры, a = радиус трубы
 *   строка 1: rgb = орт «вправо» сечения,             a = открытость участка
 *   строка 2: rgb = орт «вверх» сечения,              a = температура палитры
 *
 * Благодаря этому вся геометрия честно гнётся по петлям и спиралям, координаты
 * всегда маленькие (никакого дрожания float на восьмом километре трассы), а
 * длинные элементы читают трассу в СВОЕЙ точке — то есть изгибаются вместе с ней.
 */

export const tunnelVertexShader = /* glsl */ `
  // aPath = (путь по трассе, угол в сечении)
  // aGeo  = POLAR: (полуугол, rВнутр, rНаруж, -)
  //         LONG:  (полуширина, полудлина, радиус-множитель, смаз 0/1)
  //         LIGHT: (размер, радиус-множитель, -, -)
  // aMeta = (тип 0 POLAR / 1 LONG / 2 LIGHT, класс, яркость, шум)
  attribute vec2 aPath;
  attribute vec4 aGeo;
  attribute vec4 aMeta;

  uniform sampler2D uTrack;
  uniform vec2 uTrackDim;
  uniform float uTravel;
  uniform float uLoop;
  uniform float uNear;
  uniform float uStep;
  uniform float uStretch;     // метры смаза = скорость × выдержка
  uniform float uPixelScale;  // пикселей на метр на дистанции 1 м
  uniform float uMinPx;       // минимальный экранный размер элемента
  uniform float uFogFar;
  uniform float uPolarFade;   // анти-строб: гашение колец на высокой скорости

  varying vec2 vUv;
  varying float vAlpha;
  varying float vHaze;
  varying float vShape;
  varying float vTone;
  varying float vRand;
  varying float vClass;

  vec4 trackRow(float i, float row) {
    return texture2D(uTrack, vec2((i + 0.5) / uTrackDim.x, (row + 0.5) / uTrackDim.y));
  }

  void main() {
    float aType = aMeta.x;
    float aClass = aMeta.y;
    float aBright = aMeta.z;
    float aRand = aMeta.w;

    float isPolar = 1.0 - step(0.5, aType);
    float isLong = step(0.5, aType) * (1.0 - step(1.5, aType));
    float isLight = step(1.5, aType);

    // Позиция элемента относительно камеры вдоль трассы (рециклинг по mod).
    float dSelf = mod(aPath.x - uTravel + uNear, uLoop) - uNear;
    float halfLen = aGeo.y + uStretch * aGeo.w;
    float dUse = dSelf + isLong * position.y * halfLen;

    float fi = clamp((dUse + uNear) / uStep, 0.0, uTrackDim.x - 1.001);
    float i0 = floor(fi);
    float w = fi - i0;
    vec4 A = mix(trackRow(i0, 0.0), trackRow(i0 + 1.0, 0.0), w);
    vec4 B = mix(trackRow(i0, 1.0), trackRow(i0 + 1.0, 1.0), w);
    vec4 C = mix(trackRow(i0, 2.0), trackRow(i0 + 1.0, 2.0), w);

    vec3 centre = A.xyz;
    float radius = A.w;
    vec3 right = normalize(B.xyz);
    float openness = B.w;
    vec3 upv = normalize(C.xyz);
    float tone = C.w;

    float ca = cos(aPath.y);
    float sa = sin(aPath.y);
    vec3 radial = right * ca + upv * sa;
    vec3 tang = -right * sa + upv * ca;

    vec3 base;
    vec3 axU;
    vec3 axV;
    if (aType < 0.5) {
      // Сектор кольца: лежит в плоскости сечения, толщина уходит радиально.
      // Нормаль такого квада смотрит вдоль трассы, поэтому материал обязан быть
      // DoubleSide — иначе половину колец срежет backface culling.
      float rMid = (aGeo.y + aGeo.z) * 0.5 * radius;
      float rHalf = (aGeo.z - aGeo.y) * 0.5 * radius;
      base = centre + radial * rMid;
      axU = tang * (aGeo.x * rMid);
      axV = radial * rHalf;
    } else if (aType < 1.5) {
      // Протяжный элемент: длина уже учтена сдвигом выборки трассы (гнётся).
      base = centre + radial * (aGeo.z * radius);
      axU = tang * aGeo.x;
      axV = vec3(0.0);
    } else {
      // Огонёк: билборд в осях камеры.
      base = centre + radial * (aGeo.y * radius);
      axU = vec3(aGeo.x, 0.0, 0.0);
      axV = vec3(0.0, aGeo.x, 0.0);
    }

    // Дальние элементы не дают стать тоньше uMinPx: субпиксельная геометрия
    // иначе мерцает от кадра к кадру. Утолщаем и гасим альфой — энергия та же.
    float dist = max(length(base), 1.0);
    float pxPerM = uPixelScale / dist;
    float lu = length(axU);
    float lv = length(axV);
    float kU = lu > 1e-5 ? max(1.0, uMinPx / max(lu * 2.0 * pxPerM, 1e-4)) : 1.0;
    float kV = lv > 1e-5 ? max(1.0, uMinPx / max(lv * 2.0 * pxPerM, 1e-4)) : 1.0;
    axU *= kU;
    axV *= kV;

    vec3 p = base + axU * position.x + axV * position.y;

    // Видимость слоёв: обшивка расходится, корпус мегаструктуры проступает.
    // Обшивка редеет, но не исчезает: именно по её кольцам глаз читает изгиб
    // трассы в петле и спиралях — обнулить её значит потерять весь манёвр.
    float vis;
    if (aClass < 0.5) vis = (1.0 - openness * 0.45) * mix(1.0, uPolarFade, isPolar);
    else if (aClass < 1.5) vis = 1.0;
    else if (aClass < 2.5) vis = (0.8 + openness * 0.45) * mix(1.0, uPolarFade, isPolar);
    else vis = 0.14 + openness * 1.5;

    float dFog = max(dUse, 0.0);
    float fade = 1.0 - smoothstep(uFogFar * 0.42, uFogFar, dFog);
    // Пролетающее вплотную гасим: иначе на скорости элемент вспыхивает во весь кадр.
    fade *= smoothstep(1.5, 9.0, dist);

    vUv = uv;
    vAlpha = fade * vis * aBright / (kU * kV);
    vHaze = smoothstep(uFogFar * 0.1, uFogFar * 0.95, dFog) * 0.85;
    vShape = isLight;
    vTone = tone;
    vRand = aRand;
    vClass = aClass;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const tunnelFragmentShader = /* glsl */ `
  uniform vec3 uCool;   // холодный неон
  uniform vec3 uMid;    // второй холодный (фиолет) — разнообразит стены
  uniform vec3 uWarm;   // раскалённый неон
  uniform vec3 uRail;   // рельсы/огни
  uniform vec3 uHaze;   // цвет воздушной перспективы
  uniform float uExposure;

  varying vec2 vUv;
  varying float vAlpha;
  varying float vHaze;
  varying float vShape;
  varying float vTone;
  varying float vRand;
  varying float vClass;

  void main() {
    vec2 q = vUv * 2.0 - 1.0;
    float bar = (1.0 - smoothstep(0.1, 1.0, abs(q.x)))
              * (1.0 - smoothstep(0.35, 1.0, abs(q.y)));
    float glow = 1.0 - smoothstep(0.0, 1.0, length(q));
    glow *= glow;

    float a = mix(bar, glow, vShape) * vAlpha;
    if (a < 0.003) discard;

    // Палитра тремя остановками: холодный → фиолет → раскалённый.
    float x = clamp(vTone + vRand * 0.34, 0.0, 1.0);
    vec3 col = mix(
      mix(uCool, uMid, clamp(x * 2.2, 0.0, 1.0)),
      uWarm,
      clamp(x * 1.8 - 0.55, 0.0, 1.0)
    );
    if (vClass > 0.5 && vClass < 1.5) col = mix(col, uRail, 0.78);
    col = mix(col, uHaze, vHaze); // даль теряет насыщенность → читается глубина

    gl_FragColor = vec4(col * uExposure, a);
  }
`;
