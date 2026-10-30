import { caseByRoute, lessonOrder } from "../content/catalog";
import { courseSlides, slideForRoute } from "../content/slides";

// 讲课流程：地址里记住“从主课件第几页进来”，任何案例退出都回到那一页，而不是第 1 页。
//   主课件        #/deck?s=N
//   案例（从第 N 页进入） #/poem?from=N
// 案例页顶栏：← 返回主课件（第 N 页） · ‹ 上一个案例 · 位置 · 下一个案例 ›
// Esc：页面自己没处理时（例如没有打开的弹窗），回到主课件第 N 页。

export interface ParsedHash { path: string; params: URLSearchParams }

export function parseHash(hash = location.hash): ParsedHash {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  return { path: path || "home", params: new URLSearchParams(query) };
}

export const deckHref = (slide: number) => `#/deck?s=${slide}`;
export const caseHref = (route: string, from?: number) => `#/${route}${from ? `?from=${from}` : ""}`;

/** 回主课件时应回到的页：优先地址里的 from，其次该案例在主课件里出现的那一页 */
export function returnSlide(route: string, params: URLSearchParams): number {
  const from = Number(params.get("from"));
  if (Number.isInteger(from) && from >= 1 && from <= courseSlides.length) return from;
  return slideForRoute(route) ?? 1;
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

/** 在顶栏插入案例导航；返回卸载函数 */
export function mountCaseNav(route: string, params: URLSearchParams): () => void {
  const entry = caseByRoute(route);
  const bar = document.querySelector<HTMLElement>(".topbar");
  if (!entry || !bar) return () => undefined;
  const index = lessonOrder.indexOf(entry);
  const back = returnSlide(route, params);
  const prev = lessonOrder[index - 1];
  const next = lessonOrder[index + 1];
  const link = (target: typeof prev, label: string, className: string) => target
    ? `<a class="${className}" href="${caseHref(target.route, slideForRoute(target.route))}" title="${escapeHtml(target.title)}">${label}</a>`
    : `<span class="${className} disabled">${label}</span>`;
  const nav = document.createElement("nav");
  nav.className = "case-nav";
  nav.setAttribute("aria-label", "讲课流程");
  nav.innerHTML = `
    <a class="case-back" href="${deckHref(back)}" title="Esc">← 返回主课件 · 第 ${back} 页</a>
    ${link(prev, `‹ ${prev ? escapeHtml(prev.title) : "已是第一个"}`, "case-prev")}
    <span class="case-pos">${index + 1} / ${lessonOrder.length}</span>
    ${link(next, `${next ? escapeHtml(next.title) : "已是最后一个"} ›`, "case-next")}`;
  bar.querySelector(".brand")!.after(nav);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (document.querySelector("[role=dialog]:not([hidden])")) return;
    location.hash = deckHref(back);
  };
  // 用冒泡阶段之后再处理：页面自己的 Esc（关弹窗、回全景）先执行并 preventDefault
  window.addEventListener("keydown", onKey);
  return () => {
    window.removeEventListener("keydown", onKey);
    nav.remove();
  };
}
