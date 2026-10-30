import type { RouteNode } from "../types";

export const routeNodes: RouteNode[] = [
  {
    id: "yudu", title: "于都集结出发", date: "1934-10-17", lon: 115.42, lat: 25.95,
    summary: "中央红军主力陆续渡过于都河，开始战略转移。",
    question: "为什么出发行动要尽量隐蔽？地形和河流带来了什么条件？",
    sourceIds: ["S1"], challenge: "突破封锁",
  },
  {
    id: "xiangjiang", title: "湘江战役", date: "1934-11-25", lon: 111.08, lat: 25.93,
    summary: "中央红军在湘江地区突破第四道封锁线，付出重大牺牲。",
    question: "路线为什么在湘江一带受到严重阻滞？",
    sourceIds: ["S2"], challenge: "突破封锁",
  },
  {
    id: "zunyi", title: "遵义会议", date: "1935-01-15", lon: 106.93, lat: 27.73,
    summary: "遵义会议成为党的历史上一个生死攸关的转折点。",
    question: "一次会议如何改变随后路线选择与指挥方式？",
    sourceIds: ["S2"], challenge: "战略转折",
  },
  {
    id: "chishui", title: "四渡赤水", date: "1935-01-29", lon: 105.98, lat: 28.25,
    summary: "中央红军在川黔滇边灵活机动，四次渡过赤水河。",
    question: "如果只看直线距离，为什么无法理解这一段路线？",
    sourceIds: ["S2", "S3"], challenge: "战略转折",
  },
  {
    id: "jinsha", title: "巧渡金沙江", date: "1935-05-03", lon: 102.44, lat: 26.29,
    summary: "红军渡过金沙江，摆脱围追堵截，取得战略主动。",
    question: "声东击西如何在空间上创造渡江窗口？",
    sourceIds: ["S2", "S3"], challenge: "战略转折",
  },
  {
    id: "luding", title: "飞夺泸定桥", date: "1935-05-29", lon: 102.23, lat: 29.91,
    summary: "先头部队急行军赶到泸定桥并发起夺桥战斗。",
    question: "桥梁为什么成为路线上的关键瓶颈？",
    sourceIds: ["S2"], challenge: "突破封锁",
  },
  {
    id: "jiajin", title: "翻越夹金山", date: "1935-06-12", lon: 102.73, lat: 30.82,
    summary: "中央红军翻越长征途中第一座大雪山。",
    question: "海拔、气温与补给如何共同放大行军困难？",
    sourceIds: ["S2"], challenge: "自然险阻",
  },
  {
    id: "grassland", title: "穿越草地", date: "1935-08-21", lon: 102.96, lat: 33.10,
    summary: "右路军开始穿越高寒沼泽草地，历经六天六夜。",
    question: "看似平坦的草地为什么比高山更危险？",
    sourceIds: ["S2"], challenge: "自然险阻",
  },
  {
    id: "lazikou", title: "突破腊子口", date: "1935-09-17", lon: 103.91, lat: 34.10,
    summary: "陕甘支队突破川甘边界天险腊子口。",
    question: "峡谷地形如何影响攻守双方的选择？",
    sourceIds: ["S4"], challenge: "突破封锁",
  },
  {
    id: "wuqi", title: "到达吴起镇", date: "1935-10-19", lon: 108.18, lat: 36.93,
    summary: "陕甘支队到达陕北吴起镇，中央红军主力长征胜利结束。",
    question: "从出发到落脚，哪些节点真正改变了全局？",
    sourceIds: ["S4"], challenge: "会师落脚",
  },
];
