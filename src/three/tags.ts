import * as THREE from "three";

// 3D 位置上的 HTML 文字标签：清晰的系统中文字体，每帧投影到屏幕。

export interface Tag { element: HTMLElement; position: THREE.Vector3; visible: boolean }

export function createTagLayer(stage: HTMLElement) {
  const layer = document.createElement("div");
  layer.className = "tag-layer";
  stage.append(layer);
  const tags: Tag[] = [];
  const projected = new THREE.Vector3();
  return {
    add: (html: string, position: THREE.Vector3, className = ""): Tag => {
      const element = document.createElement("span");
      element.className = `tag ${className}`;
      element.innerHTML = html;
      layer.append(element);
      const tag = { element, position, visible: true };
      tags.push(tag);
      return tag;
    },
    clear: () => { tags.length = 0; layer.innerHTML = ""; },
    update: (camera: THREE.Camera) => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      for (const tag of tags) {
        projected.copy(tag.position).project(camera);
        const show = tag.visible && projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
        tag.element.style.opacity = show ? "" : "0";
        if (show) tag.element.style.transform = `translate(${((projected.x + 1) / 2 * width).toFixed(1)}px, ${((1 - projected.y) / 2 * height).toFixed(1)}px) translate(-50%, -50%)`;
      }
    },
    dispose: () => layer.remove(),
  };
}
