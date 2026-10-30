import { routeStories } from "../data/routeStories";
import { sourceById } from "../data/sources";
import type { RouteNode } from "../types";

// 长征节点详情：图片轮播（实景照片 / 地图 / AI 示意图）+ 最后一页“背景 · 经过 · 意义 + 课堂问题”。
// 图片清单 public/media/long-march/stories.json 由 scripts/build-story-images.py 统一生成（同一套 16:9 调色）。

export interface StoryImage { src: string; caption: string; kind: "photo" | "map" | "ai"; credit: string; license: string; url: string }
export type StoryManifest = Record<string, StoryImage[]>;

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

export async function loadStoryManifest(): Promise<StoryManifest> {
  try {
    const response = await fetch("./media/long-march/stories.json");
    return response.ok ? await response.json() as StoryManifest : {};
  } catch {
    return {};
  }
}

export function createStoryCarousel(root: HTMLElement, manifest: StoryManifest) {
  let slides: HTMLElement[] = [];
  let current = 0;
  const stage = root.querySelector<HTMLElement>(".story-stage")!;
  const dots = root.querySelector<HTMLElement>(".story-dots")!;
  const prev = root.querySelector<HTMLButtonElement>(".story-prev")!;
  const next = root.querySelector<HTMLButtonElement>(".story-next")!;

  const go = (index: number) => {
    current = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, i) => slide.classList.toggle("active", i === current));
    [...dots.children].forEach((dot, i) => dot.classList.toggle("active", i === current));
    prev.disabled = current === 0;
    next.disabled = current === slides.length - 1;
    root.dataset.slide = String(current);
    root.dataset.slideKind = slides[current]?.dataset.kind ?? "";
  };

  const show = (node: RouteNode) => {
    const images = manifest[node.id] ?? [];
    const story = routeStories[node.id];
    const imageSlides = images.map((image) => `
      <figure class="story-slide" data-kind="${image.kind}">
        <img src="./${image.src}" alt="${escapeHtml(image.caption)}" loading="lazy" />
        ${image.kind === "ai" ? `<span class="ai-badge">AI 生成 · 示意图</span>` : ""}
        <figcaption>
          <span class="story-date">${node.date.replaceAll("-", ".")} · ${escapeHtml(node.title)}</span>
          <b>${escapeHtml(image.caption)}</b>
          <small>${image.kind === "ai" ? "本机 AI 生成，非历史影像" : `${escapeHtml(image.credit)} · ${escapeHtml(image.license)} · Wikimedia Commons`}</small>
        </figcaption>
      </figure>`).join("");
    const textSlide = `
      <article class="story-slide story-text" data-kind="text">
        <span class="story-date">${node.date.replaceAll("-", ".")}</span>
        <h2>${escapeHtml(node.title)}</h2>
        <div class="story-columns">
          <section><small>背景</small><p>${escapeHtml(story?.background ?? node.summary)}</p></section>
          <section><small>经过</small><p>${escapeHtml(story?.process ?? "")}</p></section>
          <section><small>意义</small><p>${escapeHtml(story?.meaning ?? "")}</p></section>
        </div>
        <div class="event-question"><small>课堂问题</small><p>${escapeHtml(node.question)}</p></div>
        <p class="source-note">来源：${node.sourceIds.map((id) => `<a href="${sourceById[id].url}" target="_blank" rel="noreferrer">${escapeHtml(sourceById[id].title)}</a>`).join(" · ")}</p>
      </article>`;
    stage.innerHTML = imageSlides + textSlide;
    slides = [...stage.querySelectorAll<HTMLElement>(".story-slide")];
    dots.innerHTML = slides.map((slide, i) => `<button aria-label="第 ${i + 1} 页${slide.dataset.kind === "text" ? "：讲解" : ""}" data-dot="${i}"></button>`).join("");
    go(0);
  };

  dots.addEventListener("click", (event) => {
    const dot = (event.target as HTMLElement).closest<HTMLElement>("[data-dot]");
    if (dot) go(Number(dot.dataset.dot));
  });
  prev.addEventListener("click", () => go(current - 1));
  next.addEventListener("click", () => go(current + 1));
  return { show, step: (delta: number) => go(current + delta) };
}
