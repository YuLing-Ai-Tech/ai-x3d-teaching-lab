import { caseByRoute, lessonOrder } from "./content/catalog";
import { hasPrivateAssets, privateAssetCases } from "./runtime/assetMode";
import { renderLocalAssetRequired } from "./pages/localAssetRequired";

// 每个路由一个动态 import：Vite 会把它拆成独立的块。open 返回页面的卸载函数（静态页没有）。
type Dispose = (() => void) | void;
interface PageRoute { load: () => Promise<unknown>; open: (params: URLSearchParams) => Promise<Dispose> }

function page<M>(load: () => Promise<M>, render: (module: M, params: URLSearchParams) => Dispose | Promise<Dispose>): PageRoute {
  return { load, open: async (params) => render(await load(), params) };
}

function localAssetPage<M>(route: string, load: () => Promise<M>, render: (module: M) => Dispose | Promise<Dispose>): PageRoute {
  return {
    load: () => hasPrivateAssets ? load() : Promise.resolve(),
    open: async () => {
      if (!hasPrivateAssets) { renderLocalAssetRequired(route); return; }
      return render(await load());
    },
  };
}

export const routes: Record<string, PageRoute> = {
  deck: page(() => import("./pages/deck"), (m, params) => m.renderDeck(Number(params.get("s")) || 1)),
  "long-march": localAssetPage("long-march", () => import("./pages/longMarch"), (m) => m.renderLongMarch()),
  conic: page(() => import("./pages/conic"), (m) => m.renderConic()),
  membrane: page(() => import("./pages/membrane"), (m) => m.renderMembrane()),
  workshop: page(() => import("./pages/workshop"), (m) => m.renderWorkshop()),
  cards: page(() => import("./pages/cards"), (m) => m.renderCards()),
  sources: page(() => import("./pages/sources"), (m) => m.renderSources()),
  blender: localAssetPage("blender", () => import("./pages/blender"), (m) => m.renderBlender()),
  compiler: page(() => import("./pages/compiler"), (m) => m.renderCompiler()),
  poem: page(() => import("./pages/poem"), (m) => m.renderPoem()),
  gravity: page(() => import("./pages/gravity"), (m) => m.renderGravity()),
  molecule: page(() => import("./pages/molecule"), (m) => m.renderMolecule()),
  preposition: page(() => import("./pages/preposition"), (m) => m.renderPreposition()),
  dna: page(() => import("./pages/dna"), (m) => m.renderDna()),
  embedding: page(() => import("./pages/embedding"), (m) => m.renderEmbedding()),
  "next-token": page(() => import("./pages/nextToken"), (m) => m.renderNextToken()),
  geo: localAssetPage("geo", () => import("./pages/geo"), (m) => m.renderGeo()),
};

export const requiresPrivateAssets = (route: string) => privateAssetCases.has(route);

/** 空闲时预取讲课顺序里的下一个案例（离线时就是本地文件，只省掉切换时的等待） */
export function prefetchNext(path: string): void {
  const entry = caseByRoute(path);
  const next = entry ? lessonOrder[lessonOrder.indexOf(entry) + 1] : lessonOrder[0];
  const target = next && routes[next.route];
  if (!target) return;
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback;
  const run = () => void target.load().catch(() => undefined);
  if (idle) idle(run); else window.setTimeout(run, 1200);
}
