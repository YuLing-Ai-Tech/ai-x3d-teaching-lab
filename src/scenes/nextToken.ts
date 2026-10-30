import * as THREE from "three";
import { createCinematicStage, glowTexture } from "../three/cinematic";
import { createTagLayer } from "../three/tags";
import type { LangScene } from "../ui/langLab";

// 下一个词预测塔：每一步 8 个候选词立成光柱（高度 = 概率），最高的那根“射出”一个词，接到句子后面。

export interface TokenPrompt { label: string; prompt: string; steps: Array<Array<{ token: string; p: number }>>; completion: string }

const STEP_SECONDS = 2.6;
const show = (token: string) => token.replace(/\n/g, "↵").replace(/^ /, "␣") || "␣";

export function mountNextToken(stage: HTMLElement): LangScene<TokenPrompt> {
  const context = createCinematicStage(stage, new THREE.Vector3(0, 6.5, 19.5), { accent: 0xffd38a, target: new THREE.Vector3(0, 3.6, 0), dust: 1200, bloom: { strength: .8, radius: .45, threshold: .62 } });
  context.scene.add(new THREE.DirectionalLight(0xffffff, 1.2).translateY(10).translateZ(8));
  const sentence = document.createElement("div");
  sentence.className = "token-sentence";
  stage.append(sentence);
  const tags = createTagLayer(stage);
  const bars = new THREE.Group();
  context.scene.add(bars);
  const shot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd38a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  shot.scale.setScalar(1.6);
  context.scene.add(shot);
  let prompt: TokenPrompt | null = null;
  let step = -1;
  let clock = 0;
  let highlighted: string | null = null;

  // 第一名站在正中，其余按名次左右交替排开（1 右、2 左、3 右……），画面左右平衡
  const ORDER = [0, 1, -1, 2, -2, 3, -3, 4];
  const slot = (rank: number) => {
    const k = ORDER[rank] ?? rank;
    return new THREE.Vector3(k * 1.55, 0, Math.abs(k) * .35);
  };
  const buildStep = (index: number) => {
    bars.clear();
    tags.clear();
    if (!prompt) return;
    prompt.steps[index].forEach((candidate, rank) => {
      const height = .08 + candidate.p * 7.5;
      const color = new THREE.Color(rank === 0 ? 0xffd38a : 0x57d8ff).lerp(new THREE.Color(0x3a4cff), rank === 0 ? 0 : rank / 10);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.9, 1, .9), new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: rank === 0 ? .4 : .28, transparent: true, opacity: .9, roughness: .2, clearcoat: 1 }));
      bar.position.copy(slot(rank));
      bar.userData = { height, rank };
      bar.scale.y = .001;
      bars.add(bar);
      const tag = tags.add(`${show(candidate.token)}<small>${candidate.p >= .01 ? (candidate.p * 100).toFixed(1) : (candidate.p * 100).toFixed(2)}%</small>`, bar.position.clone().setY(height + .9), `bar${rank === 0 ? " top" : ""}`);
      bar.userData.tag = tag;
    });
  };
  const renderSentence = () => {
    if (!prompt) return;
    const generated = prompt.steps.slice(0, Math.max(0, step)).map((candidates) => show(candidates[0].token)).join("");
    sentence.innerHTML = `<span class="${highlighted === "prompt" ? "gen" : ""}">${prompt.prompt}</span><span class="gen">${generated}</span><span class="cursor"></span>`;
  };

  const removeFrame = context.onFrame((delta) => {
    tags.update(context.camera);
    if (!prompt) return;
    clock += delta;
    const total = prompt.steps.length;
    const current = Math.floor(clock / STEP_SECONDS);
    if (current >= total + 1.2) { clock = 0; step = -1; return; }
    if (current !== step && current < total) {
      step = current;
      buildStep(step);
      renderSentence();
    } else if (current >= total && step !== total) {
      step = total;
      renderSentence();
    }
    const local = (clock % STEP_SECONDS) / STEP_SECONDS;
    bars.children.forEach((bar) => {
      const rise = THREE.MathUtils.clamp((local - bar.userData.rank * .03) / .35, 0, 1);
      bar.scale.y = Math.max(.001, bar.userData.height * (1 - Math.pow(1 - rise, 3)));
      bar.position.y = bar.scale.y / 2;
      bar.userData.tag.element.style.visibility = rise > .6 ? "visible" : "hidden";
    });
    const top = bars.children[0];
    shot.visible = !!top && local > .6 && step < total;
    if (top && shot.visible) {
      const k = (local - .6) / .4;
      shot.position.copy(top.position).setY(top.scale.y + k * 8);
      shot.scale.setScalar(1.6 * (1 - k * .5));
    }
  });

  return {
    update: (next) => {
      prompt = next;
      clock = 0;
      step = -1;
      context.pulse(.7);
    },
    highlight: (role) => { highlighted = role; renderSentence(); },
    dispose: () => {
      removeFrame();
      tags.dispose();
      sentence.remove();
      context.dispose();
    },
  };
}
