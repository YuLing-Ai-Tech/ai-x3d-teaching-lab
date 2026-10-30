import * as THREE from "three";
import { courseSlides } from "../content/slides";
import { caseHref, deckHref } from "../ui/flow";
import { sampleShape, type ShapeSpec } from "../domain/compiler";
import { createCinematicStage, createParticleMorph } from "../three/cinematic";
import { shell } from "../ui/shell";

// 主课件：← → / 翻页笔翻页，F 全屏。背景 6000 个粒子随页重组——“语言变了，世界就变了”。

const SHAPES: ShapeSpec[] = [
  { kind: "sphere", values: { r: 2.4 }, guessed: [] },
  { kind: "helix", values: { r: 2, turns: 4, rise: 1 }, guessed: [] },
  { kind: "wave", values: { lambda: 3.5, amp: .7 }, guessed: [] },
  { kind: "torus", values: { R: 2.6, r: .8 }, guessed: [] },
  { kind: "cone", values: { r: 2.4, h: 4.2 }, guessed: [] },
];

export function renderDeck(startSlide = 1): () => void {
  const start = Math.min(courseSlides.length, Math.max(1, Math.round(startSlide))) - 1;
  const slides = courseSlides.map((slide, index) => `
    <section class="slide${index === start ? " active" : ""}" data-slide="${index}">
      <div class="slide-kicker">${slide.kicker}</div>
      <h2>${slide.title}</h2>
      <div>${slide.body}</div>
      ${slide.jump || slide.also ? `<div class="case-jumps">${slide.jump ? `<a class="case-jump" href="${caseHref(slide.jump.route, index + 1)}">${slide.jump.label} →</a>` : ""}${(slide.also ?? []).map((link) => `<a class="case-jump secondary" href="${caseHref(link.route, index + 1)}">${link.label} →</a>`).join("")}</div>` : ""}
    </section>
  `).join("");
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = shell(`
    <div class="deck" tabindex="0"><div class="deck-bg" id="deck-bg"></div>${slides}</div>
    <div class="slide-progress"><span id="slide-number">${start + 1}</span> / ${courseSlides.length} · ← → 翻页 · Home / End 首尾 · F 全屏</div>
  `);
  const background = document.querySelector<HTMLElement>("#deck-bg")!;
  const stage = createCinematicStage(background, new THREE.Vector3(0, 3.5, 14), { accent: 0x2fd4ff, target: new THREE.Vector3(-4.5, 2.2, 0), dust: 700 });
  stage.controls.enabled = false;
  const morph = createParticleMorph(6000, 0x2fd4ff, .07);
  morph.points.position.x = 0;
  stage.scene.add(morph.points);
  const colorA = new THREE.Color(0x2fd4ff), colorB = new THREE.Color(0xc58bff);
  const removeFrame = stage.onFrame((delta) => {
    morph.update(delta);
    morph.points.rotation.y += delta * .12;
  });
  let index = start;
  history.replaceState(null, "", deckHref(index + 1));
  const reshape = () => {
    const targets = sampleShape(SHAPES[index % SHAPES.length], 6000);
    morph.setTargets(targets, (i, out) => out.copy(colorA).lerp(colorB, Math.min(1, targets[i * 3 + 1] / 5)), .8);
    stage.pulse(.5);
  };
  const show = (next: number) => {
    const target = Math.min(courseSlides.length - 1, Math.max(0, next));
    if (target === index) return;
    index = target;
    document.querySelectorAll("[data-slide]").forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === index));
    document.querySelector("#slide-number")!.textContent = String(index + 1);
    history.replaceState(null, "", deckHref(index + 1));
    reshape();
  };
  const keydown = (event: KeyboardEvent) => {
    if (["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); show(index + 1); }
    if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); show(index - 1); }
    if (event.key.toLowerCase() === "f") void document.documentElement.requestFullscreen?.();
    if (event.key === "Home") show(0);
    if (event.key === "End") show(courseSlides.length - 1);
  };
  window.addEventListener("keydown", keydown);
  document.querySelector(".deck")!.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("a")) show(index + 1);
  });
  reshape();
  return () => {
    window.removeEventListener("keydown", keydown);
    removeFrame();
    stage.dispose();
  };
}
