const dictionary = {
  zh: {
    idealCorner: "◇ 理想方向",
    idealHint: "能力更高、成本和时间更低；不是综合排名",
    appTitle: "AI 模型对比",
    free: "自由视图",
    front: "正视图",
    side: "侧视图",
    top: "俯视图",
    ability: "能力",
    cost: "成本",
    time: "时间",
    abilityTitle: "能力 · Intelligence Index（越高越好）",
    costTitle: "成本 · 美元 / 任务（越低越好）",
    timeTitle: "时间 · 分钟 / 任务（越低越好）",
    ability3d: "能力 · Intelligence Index",
    cost3d: "成本 · USD / 任务",
    time3d: "时间 · 分钟 / 任务",
    notes: "能力越高越好；成本和时间越低越好。|时间不含首 token 等开销。",
    picker: "选择显示的模型",
    search: "搜索模型或厂商…",
    all: "全选",
    clear: "清空",
    fit: "重置视图",
    fitHelp: "重置缩放和平移，显示当前所选模型的完整视野，保留筛选",
    chosen: "已选 {n} 个档位",
    summary: "{chosen} / {total} 个系列 · {selected} / {models} 个档位",
    latest: "最新模型",
    old: "旧模型",
    unknown: "版本待确认",
    versions: "{n} 版本",
    modes: "{n} 档",
    missing: "缺指标",
    missingNote: "三轴指标不全，暂不可绘制",
    standard: "标准版本",
    released: "发布",
    nonReasoning: "不思考",
    reasoning: "思考",
    noResults: "没有匹配的模型",
    show: "显示 {name}",
    showSeries: "显示 {name} 系列",
    latestBasis: "当前数据中按{basis}判定；缺少日期时使用版本号推断",
    sameSeries: "同系列的{label}",
    basisDate: "发布日期",
    basisVersion: "版本号",
    basisOnly: "仅收录此版本",
    empty: "尚未选择模型",
    emptyHint: "在菜单中勾选模型，开始对比",
    freeHint: "拖动旋转 · 滚轮缩放 · 双击定位 · 右键隐藏 · / 搜索 · R 复位",
    planeHint:
      "筛选后自动适配 · 拖动平移 · 滚轮按鼠标位置缩放 · 重置视图显示完整所选",
    axisCaption: "横轴：{x} · 纵轴：{y} · 右上角表示当前两项指标更优",
    threeCaption:
      "X：能力（Intelligence Index） · Y：成本（USD / 任务） · Z：时间（分钟 / 任务）",
    worse: "左下：较差",
    better: "右上：更优 ↗",
    reset: "切换并复位{name}",
    snapshot: "快照 {date}",
    checking: "检查更新中",
    projectChecks: "Cloudflare 数据",
    retained: "更新失败，保留快照",
    local: "部署快照",
    hourly: "Cloudflare 每 6 小时更新",
    dataHelp: "数据由现有 Cloudflare 后端提供。",
    sourceState: "源站状态：",
    invalid: "无效的数据快照",
    tooFew: "有效模型不足，保留原快照",
    unavailable: "快照服务暂不可用",
    expand: "展开",
    collapse: "收起",
    toEnglish: "切换为英文",
    toChinese: "切换为中文",
    toDark: "切换深色模式",
    toLight: "切换浅色模式",
    zoomLimit: "以当前所选模型的适配范围为 1 倍，可放大至 50 倍",
    usdTask: "美元 / 任务",
    minutesTask: "分钟 / 任务",
  },
};
let lang = "zh",
  theme = "light";
function saved(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
if (!dictionary[lang]) lang = "zh";
if (!["light", "dark"].includes(theme)) theme = "light";
const palettes = {
  light: {
    bg: "#ffffff",
    panel: "#ffffff",
    text: "#50647a",
    muted: "#718096",
    grid: "#e8edf3",
    border: "#d7e0eb",
    plane: "#fbfcfe",
    better: "#4e8274",
  },
};
function apply() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.theme = theme;
}
const UI = {
  get lang() {
    return lang;
  },
  get theme() {
    return theme;
  },
  get palette() {
    return palettes[theme];
  },
  t: (key, values = {}) =>
    (dictionary[lang][key] ?? key).replace(
      /\{(\w+)\}/g,
      (_, name) => values[name] ?? "",
    ),
};
apply();
export default UI;
