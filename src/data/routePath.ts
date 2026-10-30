// 中央红军主力行军路线（教学示意）。坐标为城镇/渡口近似位置，只用于空间叙事，不作里程或测绘依据。
// `event` 对应 route.ts 中的事件节点 id，场景按它切分“已走过”的路线。

export interface Waypoint {
  name: string;
  lon: number;
  lat: number;
  event?: string;
  /** 在地图上显示名字的普通地名 */
  label?: boolean;
}

export const routePath: Waypoint[] = [
  { name: "瑞金", lon: 116.03, lat: 25.89, label: true },
  { name: "于都", lon: 115.42, lat: 25.95, event: "yudu" },
  { name: "信丰", lon: 114.93, lat: 25.39, label: true },
  { name: "大余", lon: 114.36, lat: 25.40 },
  { name: "汝城", lon: 113.68, lat: 25.55, label: true },
  { name: "宜章", lon: 112.95, lat: 25.40, label: true },
  { name: "临武", lon: 112.56, lat: 25.28 },
  { name: "道县", lon: 111.60, lat: 25.53, label: true },
  { name: "文市", lon: 111.30, lat: 25.75 },
  { name: "全州", lon: 111.08, lat: 25.93, event: "xiangjiang" },
  { name: "兴安", lon: 110.67, lat: 25.61 },
  { name: "老山界", lon: 110.38, lat: 25.83 },
  { name: "龙胜", lon: 110.01, lat: 25.80 },
  { name: "通道", lon: 109.78, lat: 26.16, label: true },
  { name: "黎平", lon: 109.14, lat: 26.23, label: true },
  { name: "剑河", lon: 108.44, lat: 26.73 },
  { name: "施秉", lon: 108.12, lat: 27.03 },
  { name: "猴场", lon: 107.47, lat: 27.07 },
  { name: "江界河", lon: 107.38, lat: 27.33 },
  { name: "遵义", lon: 106.93, lat: 27.73, event: "zunyi" },
  { name: "桐梓", lon: 106.83, lat: 28.13 },
  { name: "土城", lon: 105.98, lat: 28.25, event: "chishui" },
  { name: "叙永", lon: 105.44, lat: 28.16 },
  { name: "扎西", lon: 105.05, lat: 27.85, label: true },
  { name: "太平渡", lon: 106.03, lat: 28.17 },
  { name: "娄山关", lon: 106.82, lat: 27.98, label: true },
  { name: "遵义（再占）", lon: 106.93, lat: 27.70 },
  { name: "茅台", lon: 106.38, lat: 27.86, label: true },
  { name: "古蔺", lon: 105.81, lat: 28.04 },
  { name: "二郎滩", lon: 106.14, lat: 28.16 },
  { name: "南渡乌江", lon: 106.55, lat: 27.18 },
  { name: "贵阳近郊", lon: 106.75, lat: 26.62, label: true },
  { name: "龙里", lon: 106.98, lat: 26.45 },
  { name: "安顺", lon: 105.93, lat: 26.25 },
  { name: "盘县", lon: 104.47, lat: 25.71 },
  { name: "曲靖", lon: 103.80, lat: 25.50, label: true },
  { name: "寻甸", lon: 103.25, lat: 25.56 },
  { name: "禄劝", lon: 102.47, lat: 25.55 },
  { name: "皎平渡", lon: 102.44, lat: 26.29, event: "jinsha" },
  { name: "会理", lon: 102.25, lat: 26.66, label: true },
  { name: "德昌", lon: 102.18, lat: 27.40 },
  { name: "西昌", lon: 102.26, lat: 27.89, label: true },
  { name: "冕宁", lon: 102.17, lat: 28.55 },
  { name: "安顺场", lon: 102.28, lat: 29.27, label: true },
  { name: "泸定桥", lon: 102.23, lat: 29.91, event: "luding" },
  { name: "天全", lon: 102.76, lat: 30.07 },
  { name: "宝兴", lon: 102.81, lat: 30.37 },
  { name: "夹金山", lon: 102.73, lat: 30.82, event: "jiajin" },
  { name: "达维", lon: 102.55, lat: 31.03 },
  { name: "两河口", lon: 102.62, lat: 31.45 },
  { name: "芦花", lon: 102.99, lat: 32.06 },
  { name: "毛儿盖", lon: 103.15, lat: 32.55, label: true },
  { name: "草地", lon: 102.96, lat: 33.10, event: "grassland" },
  { name: "班佑", lon: 102.97, lat: 33.45 },
  { name: "巴西", lon: 103.25, lat: 33.62 },
  { name: "俄界", lon: 103.55, lat: 34.02 },
  { name: "腊子口", lon: 103.91, lat: 34.10, event: "lazikou" },
  { name: "哈达铺", lon: 104.30, lat: 34.24, label: true },
  { name: "榜罗镇", lon: 105.03, lat: 35.05 },
  { name: "通渭", lon: 105.24, lat: 35.21 },
  { name: "六盘山", lon: 106.20, lat: 35.62, label: true },
  { name: "环县", lon: 107.30, lat: 36.57 },
  { name: "吴起镇", lon: 108.18, lat: 36.93, event: "wuqi" },
];

export type MapLabelKind = "city" | "river" | "region" | "mountain";

export interface MapLabel {
  text: string;
  lon: number;
  lat: number;
  kind: MapLabelKind;
}

/** 参照地名与地理单元：帮助学生把路线放回“盆地—高原—大河”的空间结构里。 */
export const mapLabels: MapLabel[] = [
  { text: "青藏高原", lon: 88, lat: 33, kind: "region" },
  { text: "塔里木盆地", lon: 83, lat: 39.3, kind: "region" },
  { text: "内蒙古高原", lon: 111, lat: 42.5, kind: "region" },
  { text: "东北平原", lon: 125, lat: 45.5, kind: "region" },
  { text: "华北平原", lon: 116, lat: 36.5, kind: "region" },
  { text: "台湾岛", lon: 121, lat: 23.6, kind: "region" },
  { text: "海南岛", lon: 109.8, lat: 19.1, kind: "region" },
  { text: "北京", lon: 116.4, lat: 39.9, kind: "city" },
  { text: "上海", lon: 121.47, lat: 31.23, kind: "city" },
  { text: "青藏高原东缘", lon: 100.6, lat: 32.6, kind: "region" },
  { text: "四川盆地", lon: 105.6, lat: 30.3, kind: "region" },
  { text: "云贵高原", lon: 104.6, lat: 26.0, kind: "region" },
  { text: "黄土高原", lon: 107.6, lat: 36.2, kind: "region" },
  { text: "南岭", lon: 112.6, lat: 24.9, kind: "mountain" },
  { text: "大雪山", lon: 101.9, lat: 30.3, kind: "mountain" },
  { text: "秦岭", lon: 107.8, lat: 33.8, kind: "mountain" },
  { text: "湘江", lon: 111.64, lat: 26.50, kind: "river" },
  { text: "乌江", lon: 107.90, lat: 27.64, kind: "river" },
  { text: "赤水河", lon: 105.75, lat: 28.45, kind: "river" },
  { text: "金沙江", lon: 101.88, lat: 26.45, kind: "river" },
  { text: "大渡河", lon: 102.16, lat: 29.55, kind: "river" },
  { text: "长江", lon: 108.95, lat: 30.92, kind: "river" },
  { text: "黄河", lon: 104.6, lat: 36.75, kind: "river" },
  { text: "昆明", lon: 102.71, lat: 25.04, kind: "city" },
  { text: "成都", lon: 104.07, lat: 30.67, kind: "city" },
  { text: "重庆", lon: 106.55, lat: 29.56, kind: "city" },
  { text: "长沙", lon: 112.94, lat: 28.23, kind: "city" },
  { text: "西安", lon: 108.94, lat: 34.34, kind: "city" },
  { text: "兰州", lon: 103.83, lat: 36.06, kind: "city" },
];
