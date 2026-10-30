import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface StageContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  onFrame: (callback: (delta: number) => void) => () => void;
  /** 替换每帧的渲染方式（例如后期辉光）；不调用则直接 renderer.render */
  setRender: (render: () => void) => void;
  onResize: (callback: (width: number, height: number) => void) => void;
  dispose: () => void;
}

export function createStage(container: HTMLElement, cameraPosition: THREE.Vector3): StageContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02070b);
  scene.fog = new THREE.FogExp2(0x02070b, 0.025);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.copy(cameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const pixelRatioCap = () => container.clientWidth < 700 ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap()));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxDistance = 65;

  scene.add(new THREE.HemisphereLight(0x9bdcff, 0x22150b, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(8, 18, 10);
  scene.add(key);

  let frame = 0;
  let active = true;
  let previousTime = performance.now();
  const frameCallbacks = new Set<(delta: number) => void>();
  const resizeCallbacks = new Set<(width: number, height: number) => void>();
  let renderFrame = () => renderer.render(scene, camera);
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap()));
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    resizeCallbacks.forEach((callback) => callback(width, height));
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    container.dataset.webgl = "lost";
  };
  const onContextRestored = () => { container.dataset.webgl = "ready"; };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);
  container.dataset.webgl = "ready";
  const animate = () => {
    if (!active) return;
    const now = performance.now();
    const delta = Math.min(.05, (now - previousTime) / 1000);
    previousTime = now;
    frameCallbacks.forEach((callback) => callback(delta));
    controls.update();
    renderFrame();
    frame = requestAnimationFrame(animate);
  };
  resize();
  window.addEventListener("resize", resize);
  animate();

  return {
    scene, camera, renderer, controls,
    onFrame: (callback) => {
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
    setRender: (render) => { renderFrame = render; },
    onResize: (callback) => {
      resizeCallbacks.add(callback);
      callback(container.clientWidth, container.clientHeight);
    },
    dispose: () => {
      active = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      controls.dispose();
      frameCallbacks.clear();
      resizeCallbacks.clear();
      scene.traverse((object) => {
        const renderable = object as THREE.Mesh & { material?: THREE.Material | THREE.Material[]; geometry?: THREE.BufferGeometry };
        renderable.geometry?.dispose();
        const materials = renderable.material ? (Array.isArray(renderable.material) ? renderable.material : [renderable.material]) : [];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => value instanceof THREE.Texture && value.dispose());
          material.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
