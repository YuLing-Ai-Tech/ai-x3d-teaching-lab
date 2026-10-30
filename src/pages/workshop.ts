import { WORKSHOP_EXAMPLES } from "../content/workshopExamples";
import { analyzeSpec, buildSpecPrompt, findVague, REVISION_PROMPTS, SPEC_FIELDS, type Spec } from "../domain/spec";
import { shell } from "../ui/shell";

// 工作坊：写语言规格书 → 生成提示词 → 粘贴到在线 AI 工具 → 一次只改一层。内容只存在本机浏览器。

const STORE = "ai3d-workshop";
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

function load(): Partial<Spec> & { subject?: string } {
  try { return JSON.parse(localStorage.getItem(STORE) ?? "{}"); } catch { return {}; }
}

export function renderWorkshop(): void {
  const saved = load();
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = shell(`
    <section class="workshop">
      <span class="eyebrow">工作坊 · 内容只保存在本机浏览器</span>
      <h1 class="page-title">写你学科的那一句话</h1>
      <p class="section-intro">把一个知识点写成语言规格书，复制给在线 AI 工具生成 3D 网页，再用验收标准检查。说得越清楚，AI 做得越准。</p>
      <ol class="ws-steps"><li><b>1</b>写规格书</li><li><b>2</b>生成提示词</li><li><b>3</b>粘贴到在线 AI</li><li><b>4</b>一次只改一层</li><li><b>5</b>验收互评</li></ol>
      <div class="ws-examples" role="group" aria-label="学科示例">
        <span>载入示例：</span>
        ${WORKSHOP_EXAMPLES.map((example, index) => `<button data-example="${index}">${example.subject} · ${example.topic}</button>`).join("")}
      </div>
      <div class="ws-meter" id="ws-meter" aria-live="polite"></div>
      <div class="form-grid">
        <label class="form-field ws-subject" for="subject"><span>学科与知识点</span><input id="subject" value="${escapeHtml(saved.subject ?? "")}" placeholder="例如：物理 · 平抛运动" /></label>
        ${SPEC_FIELDS.map(({ id, label, hint }) => `<label class="form-field" for="${id}"><span>${label}</span><textarea id="${id}" placeholder="${hint}">${escapeHtml(saved[id] ?? "")}</textarea><small class="ws-vague" data-for="${id}"></small></label>`).join("")}
      </div>
      <div class="control-row"><button class="button-primary" id="generate-prompt">生成制作提示词</button><button id="copy-prompt">复制提示词</button><button id="clear-workshop">清空本机内容</button></div>
      <pre class="prompt-output" id="generated-prompt" aria-live="polite">填写规格书后，这里会生成提示词。</pre>
      <p class="ws-tools">复制后粘贴到任一能写网页代码的在线 AI 工具（例如 DeepSeek、豆包、Kimi、通义千问等）。工具能预览就直接看；不能预览就把代码存为 <code>.html</code>，用浏览器打开。</p>
      <h2 class="ws-h2">一次只改一层</h2>
      <div class="ws-revisions">
        ${REVISION_PROMPTS.map((entry, index) => `<article class="ws-revision"><h3>${entry.label}</h3><p>${escapeHtml(entry.text).replace(/\n/g, "<br>")}</p><button data-revision="${index}">复制</button></article>`).join("")}
      </div>
    </section>
  `);

  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const subject = $<HTMLInputElement>("#subject");
  const output = $("#generated-prompt");
  const collect = (): Spec => Object.fromEntries(SPEC_FIELDS.map(({ id }) => [id, $<HTMLTextAreaElement>(`#${id}`).value.trim()])) as Spec;
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify({ ...collect(), subject: subject.value.trim() })); } catch { /* 隐私模式下不保存 */ }
  };
  const refresh = () => {
    const spec = collect();
    const analysis = analyzeSpec(spec);
    SPEC_FIELDS.forEach(({ id }) => {
      const words = findVague(spec[id]);
      $(`.ws-vague[data-for="${id}"]`).textContent = words.length ? `模糊词：${words.join("、")}——AI 只能猜，换成数量、关系或条件` : "";
    });
    $("#ws-meter").innerHTML = `
      <div class="ws-bar"><i style="width:${analysis.precision}%"></i></div>
      <span>精确度提示 <b>${analysis.precision}</b></span>
      <span>已填 ${analysis.filled}/6 格</span><span>数量表达 ${analysis.numbers} 处</span>
      <span class="${analysis.vague.length ? "warn" : ""}">模糊词 ${analysis.vague.length} 个</span>`;
  };
  const copy = async (text: string, button: HTMLElement) => {
    try { await navigator.clipboard.writeText(text); button.textContent = "已复制"; } catch { button.textContent = "请手动选中复制"; }
  };
  const generate = () => {
    save();
    output.textContent = buildSpecPrompt(collect(), subject.value.trim());
  };

  document.querySelectorAll<HTMLTextAreaElement>(".form-grid textarea").forEach((area) => area.addEventListener("input", refresh));
  $("#generate-prompt").addEventListener("click", generate);
  $("#copy-prompt").addEventListener("click", (event) => {
    if (!output.textContent?.startsWith("请为")) generate();
    void copy(output.textContent ?? "", event.currentTarget as HTMLElement);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => button.addEventListener("click", () => {
    const example = WORKSHOP_EXAMPLES[Number(button.dataset.example)];
    subject.value = `${example.subject} · ${example.topic}`;
    SPEC_FIELDS.forEach(({ id }) => { $<HTMLTextAreaElement>(`#${id}`).value = example.spec[id]; });
    refresh();
    generate();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-revision]").forEach((button) => button.addEventListener("click", () => {
    void copy(REVISION_PROMPTS[Number(button.dataset.revision)].text, button);
  }));
  $("#clear-workshop").addEventListener("click", () => {
    try { localStorage.removeItem(STORE); } catch { /* ignore */ }
    subject.value = "";
    SPEC_FIELDS.forEach(({ id }) => { $<HTMLTextAreaElement>(`#${id}`).value = ""; });
    refresh();
    output.textContent = "已清空。内容没有上传到任何服务器。";
  });
  refresh();
}
