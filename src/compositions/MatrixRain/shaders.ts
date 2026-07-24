// GLSL для инстансированного поля глифов.
// position/uv/modelViewMatrix/projectionMatrix объявляет сам ShaderMaterial —
// здесь объявляем только собственные (инстансные) атрибуты и юниформы.

export const rainVertexShader = /* glsl */ `
  attribute vec3 aOffset;      // базовая позиция глифа в мире (колонка/строка)
  attribute vec3 aScatterDir;  // направление разлёта при рассеивании
  attribute float aGlyph;      // индекс глифа в атласе (0..63), меняется по кадрам
  attribute float aBright;     // яркость 0..1 (голова колонки = 1, хвост гаснет)
  attribute float aRand;       // статический шум на инстанс

  uniform vec2 uAtlasGrid; // (cols, rows) атласа
  uniform float uScatter;  // величина разлёта
  uniform float uSwirl;    // закрутка при рассеивании

  varying vec2 vUv;
  varying float vBright;
  varying float vFog;

  void main() {
    // Ячейка атласа по индексу глифа. uv квада 0..1; текстура с flipY=false,
    // поэтому строку атласа считаем сверху вниз: (row + (1 - uv.y)).
    float col = mod(aGlyph, uAtlasGrid.x);
    float row = floor(aGlyph / uAtlasGrid.x);
    vUv = (vec2(col, row) + vec2(uv.x, 1.0 - uv.y)) / uAtlasGrid;
    vBright = aBright;

    vec3 p = position + aOffset;
    p += aScatterDir * uScatter;              // разлёт наружу
    float ang = uSwirl * (0.6 + aRand * 0.8); // закрутка вокруг оси Z
    float ca = cos(ang), sa = sin(ang);
    p.xy = mat2(ca, sa, -sa, ca) * p.xy;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFog = -mv.z; // расстояние перед камерой (для тумана по глубине)
    gl_Position = projectionMatrix * mv;
  }
`;

export const rainFragmentShader = /* glsl */ `
  uniform sampler2D uAtlasTex;
  uniform vec3 uHeadColor;
  uniform vec3 uTailColor;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vBright;
  varying float vFog;

  void main() {
    float mask = texture2D(uAtlasTex, vUv).a; // форма глифа (белым по прозрачному)
    float w = smoothstep(0.7, 1.0, vBright);   // белизна у головы колонки
    vec3 col = mix(uTailColor, uHeadColor, w);

    // Туман по глубине: гасим то, что почти вплотную (пролетели), и далёкое.
    float fogFar = 1.0 - smoothstep(300.0, 420.0, vFog);
    float fogNear = smoothstep(3.0, 30.0, vFog);
    float fog = fogFar * fogNear;

    float alpha = mask * vBright * fog * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha); // аддитивное смешивание → неоновое свечение
  }
`;
