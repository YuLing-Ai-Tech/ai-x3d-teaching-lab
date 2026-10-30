import type { LessonDesign, SchoolStage } from "../types";

// 教师视图：一张弹层，把这节课的设计全部摊开——学段、课标、目标、变量、证据、常见错误、讲解提示、评价、30 秒回退。
// 学生端只看到探究面板；老师按“教师提示”或键盘 T 打开，Esc 关闭（全站导航会让弹层先处理 Esc）。

const list = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;

export function teacherNotesHtml(design: LessonDesign, stage?: SchoolStage): string {
  const standards = design.standards.filter((item) => !stage || item.stage === stage);
  return `
    <section class="tn-grid">
      <article><h3>学段适用</h3>${list(design.stages.map((item) => `<b>${item.stage}</b>：${item.fit}`))}</article>
      <article><h3>课标与学习目标</h3>${list(standards.map((item) => `<b>${item.source}</b>：${item.text}`))}<h4>本课目标</h4>${list(design.objectives)}</article>
      <article><h3>可控制变量</h3>${list(design.variables.map((item) => `<b>${item.name}</b>（${item.range}）：${item.meaning}`))}</article>
      <article><h3>观察证据</h3>${list(design.evidence)}</article>
      <article class="tn-wide"><h3>常见错误 → 用画面纠正</h3>${list(design.misconceptions.map((item) => `<b>“${item.wrong}”</b> → ${item.fix}`))}</article>
      <article class="tn-wide"><h3>课堂任务与参考解释</h3>${list(design.tasks.filter((task) => !stage || !task.stages || task.stages.includes(stage)).map((task) => `<b>${task.title}</b>：${task.question}<br><span class="tn-answer">${task.conclusion}</span>`))}</article>
      <article><h3>讲解提示</h3>${list(design.teacherTips)}</article>
      <article><h3>评价标准</h3><table class="tn-rubric"><tr><th></th><th>起步</th><th>达标</th><th>优秀</th></tr>${design.rubric.map((row) => `<tr><th>${row.criterion}</th>${row.levels.map((level) => `<td>${level}</td>`).join("")}</tr>`).join("")}</table></article>
      <article class="tn-fallback"><h3>30 秒失败回退</h3>${list(design.fallback)}</article>
    </section>`;
}

export function mountTeacherNotes(trigger: HTMLButtonElement, design: LessonDesign, getStage: () => SchoolStage): () => void {
  const dialog = document.createElement("div");
  dialog.className = "tn-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", `${design.title} · 教师提示`);
  dialog.hidden = true;
  document.body.append(dialog);
  const open = () => {
    dialog.innerHTML = `<div class="tn-card"><header><div><span class="eyebrow">教师提示 · ${getStage()}</span><h2>${design.title}</h2></div><button class="tn-close" aria-label="关闭">×</button></header>${teacherNotesHtml(design, getStage())}</div>`;
    dialog.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    dialog.querySelector<HTMLButtonElement>(".tn-close")!.focus();
  };
  const close = () => { dialog.hidden = true; trigger.setAttribute("aria-expanded", "false"); trigger.focus(); };
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (!dialog.hidden && event.key === "Escape") { event.preventDefault(); close(); }
    else if (dialog.hidden && (event.key === "t" || event.key === "T")) open();
  };
  const onDialogClick = (event: Event) => {
    if (event.target === dialog || (event.target as HTMLElement).closest(".tn-close")) close();
  };
  trigger.addEventListener("click", open);
  dialog.addEventListener("click", onDialogClick);
  window.addEventListener("keydown", onKey, true);
  return () => {
    trigger.removeEventListener("click", open);
    window.removeEventListener("keydown", onKey, true);
    dialog.remove();
  };
}
