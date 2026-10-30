import * as THREE from "three";

// 长征沙盘的“台面”与全景光迹：让全国尺度下也能一眼看清路线，并给沙盘一个有经纬网的深色台面。

interface TerrainFrame {
  bounds: { west: number; east: number; south: number; north: number };
  width: number;
  depth: number;
}

/** 沙盘下方的深色台面：5° 经纬网 + 北回归线，向四周渐隐 */
export function createGraticuleFloor(terrain: TerrainFrame, y: number): THREE.Mesh {
  const { west, east, south, north } = terrain.bounds;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      origin: { value: new THREE.Vector2(west, north) },
      degPerUnit: { value: new THREE.Vector2((east - west) / terrain.width, (north - south) / terrain.depth) },
      halfSize: { value: new THREE.Vector2(terrain.width / 2, terrain.depth / 2) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec2 origin; uniform vec2 degPerUnit; uniform vec2 halfSize;
      varying vec3 vWorld;
      float gridLine(float value, float step) {
        float d = abs(fract(value / step - .5) - .5) * step;
        return 1.0 - smoothstep(0.0, fwidth(value) * 1.2, d);
      }
      void main() {
        float lon = origin.x + (vWorld.x + halfSize.x) * degPerUnit.x;
        float lat = origin.y - (vWorld.z + halfSize.y) * degPerUnit.y;
        float grid = max(gridLine(lon, 5.0), gridLine(lat, 5.0));
        float tropic = 1.0 - smoothstep(0.0, fwidth(lat) * 1.6, abs(lat - 23.44));
        float r = length(vWorld.xz / vec2(halfSize.x * 1.35, halfSize.y * 1.6));
        float fade = 1.0 - smoothstep(.55, 1.25, r);
        vec3 base = mix(vec3(.018, .05, .062), vec3(.008, .022, .03), smoothstep(0.0, 1.2, r));
        vec3 color = base + vec3(.2, .62, .72) * grid * .16 + vec3(.95, .72, .4) * tropic * .28;
        gl_FragColor = vec4(color, fade * .96);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(terrain.width * 3, terrain.depth * 3.4), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y;
  floor.renderOrder = -1;
  return floor;
}

/** 全景光迹：一条较粗的发光管道，光脉冲沿行军方向流动；镜头越远越明显，近景自动淡出 */
export function createRouteFlow(path: THREE.Curve<THREE.Vector3>, segments: number) {
  const radial = 6;
  const geometry = new THREE.TubeGeometry(path, segments, .16, radial, false);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, strength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform float strength;
      varying vec2 vUv;
      void main() {
        float pulse = pow(.5 + .5 * sin((vUv.x * 46.0 - time * 1.6) * 6.2831), 6.0);
        float edge = 1.0 - abs(vUv.y - .5) * 2.0;
        vec3 color = mix(vec3(1.0, .26, .14), vec3(1.0, .82, .5), pulse);
        gl_FragColor = vec4(color, (.32 + .68 * pulse) * strength * (.35 + .65 * edge));
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const total = geometry.index!.count;
  return {
    mesh,
    reveal: (fraction: number) => geometry.setDrawRange(0, Math.min(total, Math.floor(THREE.MathUtils.clamp(fraction, 0, 1) * segments) * radial * 6)),
    update: (delta: number, cameraDistance: number) => {
      material.uniforms.time.value += delta;
      const strength = THREE.MathUtils.smoothstep(cameraDistance, 14, 40);
      material.uniforms.strength.value = strength;
      mesh.visible = strength > .01;
    },
  };
}
