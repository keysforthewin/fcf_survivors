import { Filter, GlProgram } from "pixi.js";

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLocal;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord() {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main() {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
  vLocal = aPosition;
}
`;

const fragment = `
in vec2 vTextureCoord;
in vec2 vLocal;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uWorldOffset;
uniform vec2 uWorldSize;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform float uIntensity;

float layered(vec2 p, float t) {
  float a = sin(p.x * 0.0042 + p.y * 0.0031 + t * 0.55);
  float b = sin(p.x * 0.0027 - p.y * 0.0055 + t * 0.41 + 1.7);
  float c = sin(p.x * 0.0081 + p.y * 0.0067 + t * 0.83 + 3.1);
  return (a + b + c) / 3.0;
}

float caustic(vec2 p, float t) {
  vec2 q = p + vec2(sin(p.y * 0.0033 + t * 0.21) * 60.0,
                    cos(p.x * 0.0028 - t * 0.18) * 60.0);
  float w1 = layered(q, t);
  float w2 = layered(q * 1.7 + vec2(120.0, -80.0), t * 1.3 + 5.0);
  float v = 0.5 + 0.5 * w1 * w2;
  return pow(max(0.0, v), 5.0);
}

void main() {
  vec4 base = texture(uTexture, vTextureCoord);
  if (base.a < 0.001) { finalColor = base; return; }

  vec2 world = uWorldOffset + vLocal * uWorldSize;
  float c = caustic(world, uTime);

  // gentle tint cycling between two hues across the frame
  float mixT = sin(uTime * 0.18 + world.x * 0.00018 + world.y * 0.00021) * 0.5 + 0.5;
  vec3 tint = mix(uTintA, uTintB, mixT);

  vec3 col = base.rgb + tint * c * uIntensity;
  finalColor = vec4(col, base.a);
}
`;

export class WaterCausticFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: "water-caustic" }),
      resources: {
        waterUniforms: {
          uTime: { value: 0.0, type: "f32" },
          uWorldOffset: { value: new Float32Array([0, 0]), type: "vec2<f32>" },
          uWorldSize: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
          uTintA: { value: new Float32Array([0.50, 0.82, 1.00]), type: "vec3<f32>" },
          uTintB: { value: new Float32Array([1.00, 0.91, 0.52]), type: "vec3<f32>" },
          uIntensity: { value: 0.55, type: "f32" },
        },
      },
    });
  }

  setTime(t: number): void {
    (this.resources.waterUniforms as any).uniforms.uTime = t;
  }

  setWorldRect(x: number, y: number, w: number, h: number): void {
    const off = (this.resources.waterUniforms as any).uniforms.uWorldOffset as Float32Array;
    off[0] = x;
    off[1] = y;
    const sz = (this.resources.waterUniforms as any).uniforms.uWorldSize as Float32Array;
    sz[0] = w;
    sz[1] = h;
  }
}
