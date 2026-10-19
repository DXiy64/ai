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
    notes:
      "能力越高越好；成本和时间越低越好。|同色代表同一版本，连线表示不同思维档位。|时间不含首 token 等开销。",
    picker: "选择显示的模型",
    search: "搜索模型或厂商…",
    all: "全选",
    clear: "清空",
    fit: "重置视图",
    fitHelp: "恢复默认视角并适配当前所选模型的完整视野，保留筛选",
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
    projectChecks: "Cloudflare 每 6 小时更新 · 每 5 分钟检查",
    retained: "更新失败，保留快照",
    local: "部署快照",
    hourly: "Cloudflare 每 6 小时更新",
    dataHelp: "按当前数据自动分类，优先发布日期，无日期时按版本号推断。",
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
  en: {
    idealCorner: "◇ Ideal corner",
    idealHint:
      "Higher intelligence, lower cost and time; not a combined ranking",
    appTitle: "AI Model Compare",
    free: "Free view",
    front: "Front",
    side: "Side",
    top: "Top",
    ability: "Intelligence",
    cost: "Cost",
    time: "Time",
    abilityTitle: "Intelligence Index (higher is better)",
    costTitle: "Cost · USD / task (lower is better)",
    timeTitle: "Time · min / task (lower is better)",
    ability3d: "Intelligence Index",
    cost3d: "Cost · USD / task",
    time3d: "Time · min / task",
    notes:
      "Higher intelligence; lower cost and time.|One colour per version; lines connect effort levels.|Time excludes TTFT and other overhead.",
    picker: "Choose models",
    search: "Search models or providers…",
    all: "Select all",
    clear: "Clear",
    fit: "Reset view",
    fitHelp:
      "Restore the default view and fit all selected models, keeping filters",
    chosen: "{n} variants selected",
    summary: "{chosen} / {total} series · {selected} / {models} variants",
    latest: "Latest models",
    old: "Previous models",
    unknown: "Version unverified",
    versions: "{n} versions",
    modes: "{n} levels",
    missing: "No metrics",
    missingNote: "Incomplete metrics; unavailable in chart",
    standard: "Standard",
    released: "released",
    nonReasoning: "Non-reasoning",
    reasoning: "Reasoning",
    noResults: "No matching models",
    show: "Show {name}",
    showSeries: "Show {name} series",
    latestBasis:
      "Based on {basis} in this dataset; version order is used if dates are absent",
    sameSeries: "{label} in this series",
    basisDate: "release date",
    basisVersion: "version order",
    basisOnly: "the only recorded version",
    empty: "No models selected",
    emptyHint: "Choose models in the menu to compare",
    freeHint:
      "Drag to rotate · Scroll to zoom · Double-click center · Right-click hide · / Search · R Reset",
    planeHint:
      "Selection auto-fits · Drag to pan · Scroll to zoom at cursor · Reset view shows all selected points",
    axisCaption: "X: {x} · Y: {y} · Upper right is better on these two metrics",
    threeCaption:
      "X: Intelligence Index · Y: Cost (USD / task) · Z: Time (min / task)",
    worse: "Lower left: worse",
    better: "Upper right: better ↗",
    reset: "Switch to and reset {name}",
    snapshot: "Data {date}",
    checking: "Checking updates",
    projectChecks: "Cloudflare 6h refresh · 5min checks",
    retained: "Update failed; keeping snapshot",
    local: "Bundled snapshot",
    hourly: "Cloudflare updates every 6 hours",
    dataHelp:
      "Classified within this dataset: release dates first, version order if dates are absent.",
    sourceState: "Source status: ",
    invalid: "Invalid model snapshot",
    tooFew: "Too few complete models; keeping snapshot",
    unavailable: "Snapshot service unavailable",
    expand: "Expand",
    collapse: "Collapse",
    toEnglish: "Switch to English",
    toChinese: "Switch to Chinese",
    toDark: "Switch to dark theme",
    toLight: "Switch to light theme",
    zoomLimit: "1–50× relative to the fitted selection",
    usdTask: "USD / task",
    minutesTask: "min / task",
  },
};
const saved = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
let lang = saved("model-atlas-language", "zh"),
  theme = saved("model-atlas-theme", "light");
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
  dark: {
    bg: "#101722",
    panel: "#182333",
    text: "#dbe5f2",
    muted: "#a2b1c6",
    grid: "#29394e",
    border: "#40516a",
    plane: "#152030",
    better: "#9bd3bc",
  },
};
function apply() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.theme = theme;
}
const AtlasUI = {
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
    (dictionary[lang][key] ?? dictionary.en[key] ?? key).replace(
      /\{(\w+)\}/g,
      (_, name) => values[name] ?? "",
    ),
  setLanguage(value) {
    lang = value === "en" ? "en" : "zh";
    try {
      localStorage.setItem("model-atlas-language", lang);
    } catch {}
    apply();
  },
  setTheme(value) {
    theme = value === "dark" ? "dark" : "light";
    try {
      localStorage.setItem("model-atlas-theme", theme);
    } catch {}
    apply();
  },
};
apply();
export default AtlasUI;
