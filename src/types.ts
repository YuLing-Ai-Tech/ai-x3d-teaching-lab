export type Subject = "history" | "geography" | "mathematics" | "biology";
export type GradeBand = "primary" | "middle" | "high";

export interface SourceRecord {
  id: string;
  title: string;
  url: string;
  organization: string;
  accessed: string;
  note: string;
}

export interface ControlSpec {
  id: string;
  label: string;
  kind: "button" | "range" | "toggle" | "select";
}

export interface TeachingCaseManifest {
  id: string;
  gradeBand: GradeBand;
  title: string;
  subject: Subject;
  learningObjectives: string[];
  sources: SourceRecord[];
  controls: ControlSpec[];
  fallbackVideo: string;
  dataVersion: string;
  disclaimer?: string;
}

export interface RouteNode {
  id: string;
  title: string;
  date: string;
  lon: number;
  lat: number;
  summary: string;
  question: string;
  sourceIds: string[];
  challenge: "突破封锁" | "战略转折" | "自然险阻" | "会师落脚";
}

// —— 课时设计：重点案例统一的教学结构（预测 → 操作 → 记录证据 → 解释 → 评价） ——

export type SchoolStage = "初中" | "高中";

export interface InquiryOption { value: string; label: string }

export interface InquiryTask {
  id: string;
  /** 适用学段；省略表示两个学段都用 */
  stages?: SchoolStage[];
  title: string;
  /** 预测：先选再动手 */
  question: string;
  options: InquiryOption[];
  /** 唯一答案；开放题（openEnded）没有 */
  answer?: string;
  /** 开放题：不判对错，评价证据、解释与替代观点（语文、历史等） */
  openEnded?: boolean;
  /** 预测时要写的理由提示；有它时必须写理由才能锁定预测 */
  reasonPrompt?: string;
  /** 什么样的证据算“有效”：至少几行、按哪一列区分、必须包含哪些取值 */
  evidenceRule?: EvidenceRule;
  /** 模型反思：解释阶段额外的一格 */
  reflection?: string;
  /** 操作：学生要改变什么 */
  operate: string;
  /** 证据：要记录什么、怎样算记录够了 */
  evidence: string;
  /** 解释：句式支架，学生补全 */
  frames: string[];
  /** 教师对照的标准解释 */
  conclusion: string;
}

export interface EvidenceRule {
  minRows?: number;
  /** 按这一列去重计数，至少 minDistinct 个不同取值 */
  distinctBy?: string;
  minDistinct?: number;
  /** 这些列必须出现过这些取值（每个取值至少一行） */
  mustInclude?: Record<string, string[]>;
}

export interface RubricRow { criterion: string; levels: [string, string, string] }

export interface LessonDesign {
  caseId: string;
  title: string;
  stages: Array<{ stage: SchoolStage; fit: string }>;
  /** 课标出处：引文需与课标原文核对后使用 */
  standards: Array<{ stage: SchoolStage; source: string; text: string }>;
  objectives: string[];
  variables: Array<{ name: string; range: string; meaning: string }>;
  evidence: string[];
  misconceptions: Array<{ wrong: string; fix: string }>;
  tasks: InquiryTask[];
  teacherTips: string[];
  rubric: RubricRow[];
  fallback: string[];
}
