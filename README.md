# ai · 模型三维图谱

交互式 AI 模型三维散点图：X = Artificial Analysis Intelligence Index，Y = Cost per Task（USD），Z = Time per Task（分钟）。

线上地址：https://ai.mou7s.com

## 功能

- 自由旋转、滚轮缩放、三轴平面预设视角和复位
- 厂商和模型搜索筛选、模型标签、成本 / 时间对数坐标
- 三维 Pareto 前沿筛选、点击模型详情、同步数据表和 CSV 导出
- 响应式布局，本地打包 Plotly，无图表 CDN 依赖

## 数据口径

来源：[Artificial Analysis](https://artificialanalysis.ai/) 首页的公开精选模型快照。不是完整排行榜，也不是实时数据。获取时间和缺失指标在页面底部显示。只有三个指标均完整的模型参与绘图；缺失值不会补为零。`src/data.json` 保留原始精度。

成本采用 `intelligenceIndexCostPerTask.cost.total`。时间采用 `intelligenceIndexTimePerTask`（秒），绘图时除以 60 换算为分钟。Time per Task 是根据输出 token / 输出速度计算的加权解码时间，不含 TTFT 或额外开销，不能当作实际端到端请求时间。详见[官方方法](https://artificialanalysis.ai/methodology)。Pareto 前沿只对当前快照的完整模型计算，筛选厂商不会改变比较基准。

## 开发和部署

```sh
npm ci
npm run dev
npm run check
npm run build
npm run deploy
```

Cloudflare Workers Static Assets，域名在 `wrangler.jsonc` 声明。部署需要 Cloudflare 授权。

## 刷新数据

```sh
npm run refresh-data
npm run check
npm run deploy
```

刷新脚本仅解析公开页面，无需密钥。若来源页面结构变化或有效模型不足，脚本报错并保留之前快照。刷新后自行提交 `src/data.json` 到 GitHub。本项目没有自动更新定时任务。
