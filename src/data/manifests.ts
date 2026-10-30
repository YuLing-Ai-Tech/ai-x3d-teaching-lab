import type { TeachingCaseManifest } from "../types";
import { sources } from "./sources";

const selectSources = (...ids: string[]) => sources.filter((source) => ids.includes(source.id));

export const caseManifests: TeachingCaseManifest[] = [
  {
    id: "long-march", gradeBand: "high", title: "中央红军长征 3D 地形叙事", subject: "history",
    learningObjectives: ["解释关键节点的时空关系", "区分直线距离与真实行动难度", "用来源支撑历史叙事"],
    sources: selectSources("S1", "S2", "S3", "S4", "S5", "S10"),
    controls: [
      { id: "timeline", label: "事件时间轴", kind: "button" },
      { id: "tour", label: "自动讲解", kind: "button" },
      { id: "rain", label: "降雨图层", kind: "toggle" },
      { id: "dimension", label: "2D/3D", kind: "toggle" },
    ],
    fallbackVideo: "media/long-march-demo.mp4", dataVersion: "2026-10-14",
    disclaimer: "教学示意图。节点经纬度用于空间定位，不用于测绘、里程或边界判定。",
  },
  {
    id: "conic-lab", gradeBand: "high", title: "圆锥曲线 3D 实验室", subject: "mathematics",
    learningObjectives: ["从空间截面理解三类圆锥曲线", "用参数变化建立几何直觉", "完成预测—操作—解释"],
    sources: selectSources("S6"),
    controls: [
      { id: "angle", label: "切面角度", kind: "range" },
      { id: "predict", label: "先预测", kind: "select" },
      { id: "answer", label: "显示答案", kind: "button" },
    ],
    fallbackVideo: "media/conic-demo.mp4", dataVersion: "2026-10-14",
    disclaimer: "教学几何模型，参数用于展示截面类型转换。",
  },
  {
    id: "membrane-lab", gradeBand: "high", title: "细胞膜运输实验舱", subject: "biology",
    learningObjectives: ["比较三种跨膜运输", "判断浓度梯度与运输方向", "说明 ATP 与主动运输的关系"],
    sources: selectSources("S7"),
    controls: [
      { id: "concentration", label: "浓度", kind: "range" },
      { id: "channels", label: "通道数量", kind: "range" },
      { id: "atp", label: "ATP", kind: "toggle" },
    ],
    fallbackVideo: "media/membrane-demo.mp4", dataVersion: "2026-10-14",
    disclaimer: "教学概念模型，不代表真实分子尺度、速率或定量生物物理过程。",
  },
  {
    id: "blender-volcano", gradeBand: "high", title: "Codex + Blender 火山剖面", subject: "geography",
    learningObjectives: ["识别生成式 3D 的适用边界", "理解预建资产与受控参数修改", "建立现场失败回退意识"],
    sources: selectSources("S8"),
    controls: [{ id: "prompt", label: "受控修改提示词", kind: "button" }],
    fallbackVideo: "media/blender-volcano-demo.mp4", dataVersion: "2026-10-14",
    disclaimer: "高阶彩蛋。课堂只修改预演过的对象与参数。",
  },
];
