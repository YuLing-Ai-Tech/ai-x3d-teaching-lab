import * as THREE from "three";
import type { EmbeddingData, EmbeddingQuery } from "../domain/embedding";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import { createTagLayer, type Tag } from "../three/tags";
import type { LangScene } from "../ui/langLab";

// 词向量宇宙：每个词是一颗星，颜色 = 类别；中英文同义词之间有一道“光桥”。

export const GROUP_COLORS: Record<string, string> = {
  动物: "#ffb347", 人物: "#ff6b9d", 学科: "#57d8ff", 情感: "#c58bff", 城市国家: "#4dffa0",
  颜色: "#ff5a5a", 数字: "#ffd34d", 食物: "#ff9f6b", 天体: "#9fc4ff", 语言: "#ffffff",
};
const LIFT = 4;

function arrow(from: THREE.Vector3, to: THREE.Vector3, color: number): THREE.Group {
  const group = new THREE.Group();
  const direction = to.clone().sub(from);
  const length = direction.length();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, Math.max(.01, length - .5), 10), new THREE.MeshBasicMaterial({ color }));
  const head = new THREE.Mesh(new THREE.ConeGeometry(.2, .5, 16), new THREE.MeshBasicMaterial({ color }));
  shaft.position.y = (length - .5) / 2;
  head.position.y = length - .25;
  group.add(shaft, head);
  group.position.copy(from);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return group;
}

export function mountEmbedding(data: EmbeddingData) {
  return (stage: HTMLElement): LangScene<EmbeddingQuery> => {
    const context = createCinematicStage(stage, new THREE.Vector3(0, 6, 25), { accent: 0x8a7bff, grid: false, dust: 2600, target: new THREE.Vector3(0, LIFT, 0), bloom: { strength: .9, radius: .55, threshold: .3 } });
    const positions = data.words.map((word) => new THREE.Vector3(word.xyz[0], word.xyz[1] + LIFT, word.xyz[2]));
    const geometry = new THREE.BufferGeometry().setFromPoints(positions);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(data.words.flatMap((word) => new THREE.Color(GROUP_COLORS[word.group]).toArray()), 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ map: glowTexture(), size: .62, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    context.scene.add(stars);
    const bridges = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(data.pairs.flatMap((pair) => [positions[pair.zh], positions[pair.en]])),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .07, blending: THREE.AdditiveBlending }),
    );
    context.scene.add(bridges);
    const tags = createTagLayer(stage);
    const wordTags: Tag[] = data.words.map((word, index) => {
      const tag = tags.add(word.text, positions[index].clone().add(new THREE.Vector3(0, .55, 0)));
      tag.element.style.setProperty("--glow", GROUP_COLORS[word.group]);
      return tag;
    });
    const focusGroup = new THREE.Group();
    context.scene.add(focusGroup);
    let highlighted: string | null = null;
    let idle = true;
    const removeFrame = context.onFrame(() => {
      tags.update(context.camera);
      (bridges.material as THREE.LineBasicMaterial).opacity = highlighted === "word" ? .4 : .07;
    });
    context.controls.autoRotate = true;
    context.controls.autoRotateSpeed = .35;

    const setClasses = (focus: number[], near: number[], result = -1) => wordTags.forEach((tag, index) => {
      tag.element.className = `tag ${index === result ? "result" : focus.includes(index) ? "focus" : near.includes(index) ? "near" : focus.length ? "dim" : ""}`;
    });

    return {
      update: (query) => {
        focusGroup.clear();
        idle = false;
        context.controls.autoRotate = false;
        if (query.kind === "word") {
          const center = positions[query.index];
          const near = data.words[query.index].near;
          near.forEach((other, rank) => {
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([center, positions[other]]), new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 1 - rank * .15 }));
            focusGroup.add(line);
          });
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: GROUP_COLORS[data.words[query.index].group], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          halo.scale.setScalar(2);
          halo.position.copy(center);
          focusGroup.add(halo);
          setClasses([query.index], near);
          const direction = context.camera.position.clone().sub(context.controls.target).normalize();
          context.flyTo(center.clone().addScaledVector(direction, 15), center.clone(), 1.8);
        } else {
          const { a, b, c, result } = query.analogy;
          focusGroup.add(arrow(positions[b], positions[a], 0x57d8ff), arrow(positions[c], positions[result], 0xff5ad1));
          const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints([positions[a], positions[result]]), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: .3, gapSize: .2, transparent: true, opacity: .5 }));
          dashed.computeLineDistances();
          focusGroup.add(dashed);
          setClasses([a, b, c], [], result);
          const center = [a, b, c, result].reduce((sum, index) => sum.add(positions[index]), new THREE.Vector3()).multiplyScalar(.25);
          const spread = Math.max(...[a, b, c, result].map((index) => positions[index].distanceTo(center)));
          const direction = context.camera.position.clone().sub(context.controls.target).normalize();
          context.flyTo(center.clone().addScaledVector(direction, Math.max(10, spread * 2.6)), center, 1.8);
        }
        context.pulse(.8);
      },
      highlight: (role) => { highlighted = role; },
      dispose: () => {
        void idle;
        removeFrame();
        tags.dispose();
        context.dispose();
      },
    };
  };
}
