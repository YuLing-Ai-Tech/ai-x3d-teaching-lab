import type { EvidenceRule, InquiryTask, LessonDesign, SchoolStage } from "../types";

// 探究面板：预测 → 操作 → 记录证据 → 解释 → 评价。
// 先锁定预测才能往下走；证据“有效”（满足任务的 evidenceRule）才揭晓判定与参考解释；
// 所有记录只存在本机浏览器（localStorage）。
// 可选能力（不配置就是原来的行为）：预测理由、开放题（不判对错）、模型反思格。

export type InquiryPhase = "predict" | "operate" | "evidence" | "explain" | "evaluate";
export interface EvidenceRow { [column: string]: string }

const PHASES: Array<[InquiryPhase, string]> = [
  ["predict", "预测"], ["operate", "操作"], ["evidence", "证据"], ["explain", "解释"], ["evaluate", "评价"],
];

interface SavedState {
  taskId?: string;
  phase?: InquiryPhase;
  predictions: Record<string, string>;
  reasons: Record<string, string>;
  evidence: Record<string, EvidenceRow[]>;
  explanations: Record<string, string[]>;
  rubric: Record<string, number>;
}

export interface InquiryOptions {
  design: LessonDesign;
  stage: SchoolStage;
  /** 证据表的列（可按任务不同）：key 对应 capture() 返回的字段 */
  columns: (task: InquiryTask) => Array<{ key: string; label: string }>;
  /** 读取当前画面的实测值，作为一行证据 */
  capture: () => EvidenceRow;
  /** 切换任务或阶段时通知页面（例如高亮相关控件、预置参数、预测前暂停模型） */
  onChange?: (task: InquiryTask, phase: InquiryPhase) => void;
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

/** 证据是否有效；missing 是给学生看的“还差什么” */
export function checkEvidence(rule: EvidenceRule | undefined, rows: EvidenceRow[]): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const minRows = rule?.minRows ?? 1;
  if (rows.length < minRows) missing.push(`至少 ${minRows} 组（现在 ${rows.length} 组）`);
  if (rule?.distinctBy) {
    const distinct = new Set(rows.map((row) => row[rule.distinctBy!])).size;
    const need = rule.minDistinct ?? 2;
    if (distinct < need) missing.push(`至少 ${need} 种不同的“${rule.distinctBy}”（现在 ${distinct} 种）`);
  }
  for (const [column, values] of Object.entries(rule?.mustInclude ?? {})) {
    for (const value of values) {
      if (!rows.some((row) => row[column] === value)) missing.push(`包含 ${value}`);
    }
  }
  return { ok: missing.length === 0, missing };
}

export function mountInquiry(host: HTMLElement, options: InquiryOptions) {
  const key = `ai3d-inquiry:${options.design.caseId}`;
  const blank = (): SavedState => ({ predictions: {}, reasons: {}, evidence: {}, explanations: {}, rubric: {} });
  const load = (): SavedState => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<SavedState> | null;
      if (saved && typeof saved === "object") return { ...blank(), ...saved };
    } catch { /* 隐私模式或损坏的数据：从空白开始 */ }
    return blank();
  };
  const state = load();
  const save = () => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* 不保存也能上课 */ } };
  let stage = options.stage;
  const tasks = () => options.design.tasks.filter((task) => !task.stages || task.stages.includes(stage));
  let task = tasks().find((item) => item.id === state.taskId) ?? tasks()[0];
  let phase: InquiryPhase = state.phase ?? "predict";

  const rowsOf = () => state.evidence[task.id] ?? [];
  const valid = () => checkEvidence(task.evidenceRule, rowsOf());
  const predicted = () => Boolean(state.predictions[task.id]) && (!task.reasonPrompt || (state.reasons[task.id] ?? "").trim().length >= 4);

  const reached = (target: InquiryPhase): boolean => {
    if (target === "predict") return true;
    if (!predicted()) return false;
    if (target === "operate" || target === "evidence") return true;
    return valid().ok;
  };

  const optionLabel = (value: string) => task.options.find((option) => option.value === value)?.label ?? value;

  const body = (): string => {
    const prediction = state.predictions[task.id];
    const rows = rowsOf();
    const columns = options.columns(task);
    if (phase === "predict") {
      const reason = state.reasons[task.id] ?? "";
      return `
        <p class="iq-question">${task.question}</p>
        <div class="iq-options" role="radiogroup" aria-label="我的预测">
          ${task.options.map((option) => `<label class="iq-option"><input type="radio" name="iq-predict" value="${option.value}" ${prediction === option.value ? "checked" : ""}><span>${option.label}</span></label>`).join("")}
        </div>
        ${task.reasonPrompt ? `<label class="iq-frame"><span>${task.reasonPrompt}</span><textarea rows="2" data-reason placeholder="先写下你为什么这样想">${escapeHtml(reason)}</textarea></label>` : ""}
        <button class="iq-primary" data-iq="lock" ${predicted() ? "" : "disabled"}>${predicted() ? "锁定预测 · 去操作" : task.reasonPrompt ? "选一个预测并写下理由" : "先选一个预测"}</button>`;
    }
    if (phase === "operate") {
      return `<p class="iq-lead">${task.operate}</p><p class="iq-note">我的预测：<b>${escapeHtml(optionLabel(prediction ?? ""))}</b></p><button class="iq-primary" data-iq="go-evidence">操作好了 · 记录证据</button>`;
    }
    if (phase === "evidence") {
      const check = valid();
      return `
        <p class="iq-lead">${task.evidence}</p>
        <button class="iq-primary" data-iq="capture">＋ 记录当前这一组</button>
        <div class="iq-table-wrap"><table class="iq-table"><thead><tr><th>#</th>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td>${columns.map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${columns.length + 1}" class="iq-empty">还没有记录</td></tr>`}</tbody></table></div>
        <p class="iq-validity ${check.ok ? "ok" : ""}" data-valid="${check.ok}">${check.ok ? "证据有效，可以去解释" : `证据还不够：${check.missing.join("；")}`}</p>
        <div class="iq-row"><button data-iq="undo" ${rows.length ? "" : "disabled"}>删除最后一行</button><button data-iq="go-explain" ${check.ok ? "" : "disabled"}>证据够了 · 去解释</button></div>`;
    }
    if (phase === "explain") {
      const texts = state.explanations[task.id] ?? [];
      const verdict = task.openEnded || !task.answer
        ? `<p class="iq-verdict open">这是开放问题：没有唯一答案。看你的证据能不能支撑你的解释，再听听同伴的不同看法。</p>`
        : prediction === task.answer
          ? `<p class="iq-verdict ok">预测「${escapeHtml(optionLabel(prediction ?? ""))}」与证据一致</p>`
          : `<p class="iq-verdict warn">预测「${escapeHtml(optionLabel(prediction ?? ""))}」与证据不一致：证据支持「${escapeHtml(optionLabel(task.answer))}」</p>`;
      const boxes = [...task.frames, ...(task.reflection ? [task.reflection] : [])];
      return `
        ${verdict}
        ${boxes.map((frame, index) => `<label class="iq-frame ${index >= task.frames.length ? "iq-reflection" : ""}"><span>${frame}</span><textarea rows="2" data-frame="${index}" placeholder="${index >= task.frames.length ? "这个模型简化了什么？会怎样影响结论？" : "用你记录的数据把这句话写完整"}">${escapeHtml(texts[index] ?? "")}</textarea></label>`).join("")}
        <details class="iq-reference"><summary>对照参考解释</summary><p>${task.conclusion}</p></details>
        <button class="iq-primary" data-iq="go-evaluate">去评价</button>`;
    }
    const texts = state.explanations[task.id] ?? [];
    const filled = task.frames.filter((_, index) => (texts[index] ?? "").trim().length >= 6).length;
    const reflected = task.reflection ? (texts[task.frames.length] ?? "").trim().length >= 6 : undefined;
    return `
      <ul class="iq-check">
        <li class="${predicted() ? "done" : ""}">写下预测${task.reasonPrompt ? "和理由" : ""}</li>
        <li class="${valid().ok ? "done" : ""}">证据有效（${rows.length} 组）</li>
        <li class="${filled === task.frames.length ? "done" : ""}">推理链写完整（${filled} / ${task.frames.length}）</li>
        ${reflected === undefined ? "" : `<li class="${reflected ? "done" : ""}">写出模型反思</li>`}
      </ul>
      <table class="iq-rubric"><thead><tr><th>标准</th><th>起步</th><th>达标</th><th>优秀</th></tr></thead><tbody>
        ${options.design.rubric.map((row, rowIndex) => `<tr><th>${row.criterion}</th>${row.levels.map((level, levelIndex) => `<td><label><input type="radio" name="rubric-${rowIndex}" value="${levelIndex}" ${state.rubric[rowIndex] === levelIndex ? "checked" : ""}><span>${level}</span></label></td>`).join("")}</tr>`).join("")}
      </tbody></table>
      <div class="iq-row"><button data-iq="copy">复制本组学习记录</button><button data-iq="next-task">下一个任务</button></div>`;
  };

  const render = () => {
    const list = tasks();
    host.innerHTML = `
      <div class="iq-tasks" role="tablist" aria-label="探究任务">${list.map((item, index) => `<button role="tab" data-task="${item.id}" aria-selected="${item.id === task.id}">${index + 1}. ${item.title}</button>`).join("")}</div>
      <ol class="iq-phases">${PHASES.map(([id, label], index) => `<li><button data-phase="${id}" aria-current="${id === phase ? "step" : "false"}" ${reached(id) ? "" : "disabled"}><i>${index + 1}</i>${label}</button></li>`).join("")}</ol>
      <div class="iq-body" data-phase="${phase}">${body()}</div>`;
    host.dataset.phase = phase;
    options.onChange?.(task, phase);
  };

  const go = (next: InquiryPhase) => {
    if (!reached(next)) return;
    phase = next;
    state.phase = next;
    save();
    render();
  };

  const resumePhase = (): InquiryPhase => (!predicted() ? "predict" : valid().ok ? "explain" : "operate");

  const record = (): string => {
    const lines = [`【${options.design.title}】任务：${task.title}`, `预测：${optionLabel(state.predictions[task.id] ?? "")}`];
    if (state.reasons[task.id]) lines.push(`理由：${state.reasons[task.id]}`);
    rowsOf().forEach((row, index) => lines.push(`证据 ${index + 1}：${options.columns(task).map((column) => `${column.label} ${row[column.key] ?? ""}`).join("，")}`));
    task.frames.forEach((frame, index) => lines.push(`${frame}${state.explanations[task.id]?.[index] ?? ""}`));
    if (task.reflection) lines.push(`${task.reflection}${state.explanations[task.id]?.[task.frames.length] ?? ""}`);
    return lines.join("\n");
  };

  const onClick = async (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!target || !host.contains(target)) return;
    if (target.dataset.task) {
      task = tasks().find((item) => item.id === target.dataset.task) ?? task;
      state.taskId = task.id;
      phase = resumePhase();
      state.phase = phase;
      save();
      render();
      return;
    }
    if (target.dataset.phase) { go(target.dataset.phase as InquiryPhase); return; }
    const action = target.dataset.iq;
    if (action === "lock") go("operate");
    else if (action === "go-evidence") go("evidence");
    else if (action === "go-explain") go("explain");
    else if (action === "go-evaluate") go("evaluate");
    else if (action === "capture") {
      (state.evidence[task.id] ??= []).push(options.capture());
      save();
      render();
    } else if (action === "undo") {
      state.evidence[task.id]?.pop();
      save();
      render();
    } else if (action === "next-task") {
      const list = tasks();
      task = list[(list.indexOf(task) + 1) % list.length];
      state.taskId = task.id;
      phase = predicted() ? "operate" : "predict";
      state.phase = phase;
      save();
      render();
    } else if (action === "copy") {
      try { await navigator.clipboard.writeText(record()); target.textContent = "已复制"; }
      catch { target.textContent = "请手动截图保存"; }
    }
  };

  const refreshLock = () => {
    const lock = host.querySelector<HTMLButtonElement>('[data-iq="lock"]');
    if (lock) { lock.disabled = !predicted(); lock.textContent = predicted() ? "锁定预测 · 去操作" : task.reasonPrompt ? "选一个预测并写下理由" : "先选一个预测"; }
    host.querySelectorAll<HTMLButtonElement>("[data-phase]").forEach((button) => { button.disabled = !reached(button.dataset.phase as InquiryPhase); });
  };

  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.name === "iq-predict") {
      state.predictions[task.id] = target.value;
      save();
      refreshLock();
    } else if (target.dataset.reason !== undefined) {
      state.reasons[task.id] = target.value;
      save();
      refreshLock();
    } else if (target.dataset.frame !== undefined) {
      (state.explanations[task.id] ??= [])[Number(target.dataset.frame)] = target.value;
      save();
    } else if (target.name?.startsWith("rubric-")) {
      state.rubric[target.name.slice(7)] = Number(target.value);
      save();
    }
  };

  host.addEventListener("click", onClick);
  host.addEventListener("input", onInput);
  host.addEventListener("change", onInput);
  render();

  return {
    get task() { return task; },
    get phase() { return phase; },
    setStage: (next: SchoolStage) => {
      stage = next;
      if (!tasks().includes(task)) { task = tasks()[0]; phase = predicted() ? "operate" : "predict"; }
      render();
    },
    /** 页面里记录证据的快捷方式（例如键盘 R） */
    capture: () => { if (phase === "evidence") { (state.evidence[task.id] ??= []).push(options.capture()); save(); render(); } },
    reset: () => {
      Object.assign(state, blank());
      task = tasks()[0]; phase = "predict"; save(); render();
    },
    dispose: () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("input", onInput);
      host.removeEventListener("change", onInput);
    },
  };
}
