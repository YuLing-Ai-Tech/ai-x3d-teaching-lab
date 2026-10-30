import "./style.css";
import { renderHome } from "./pages/home";
import { mountCaseNav, parseHash } from "./ui/flow";
import { prefetchNext, routes } from "./routes";

// 路由级拆包：首页静态打包，其余页面按需加载（Three.js / MapLibre / deck.gl 只在用到的页面下载）。
// 路由切走时立即销毁上一页；异步加载期间又切了路由，加载完的页面直接丢弃。

let cleanup: (() => void) | undefined;
let routeToken = 0;
let navCleanup: (() => void) | undefined;

async function route(): Promise<void> {
  const token = ++routeToken;
  cleanup?.();
  cleanup = undefined;
  navCleanup?.();
  navCleanup = undefined;
  const { path, params } = parseHash();
  const target = routes[path];
  if (!target) renderHome();
  else {
    document.body.dataset.loading = path;
    const dispose = await target.open(params);
    if (token !== routeToken) { dispose?.(); return; }
    delete document.body.dataset.loading;
    cleanup = dispose || undefined;
  }
  if (token === routeToken) {
    navCleanup = mountCaseNav(path, params);
    prefetchNext(path);
  }
}

window.addEventListener("hashchange", () => void route());
void route();
