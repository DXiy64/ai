# ai · 三维图

浅色全屏 AI 模型三维散点图。X = Intelligence Index，Y = Cost per Task（USD），Z = Time per Task（分钟）。支持自由旋转、滚轮缩放、悬停查看指标；在模型散点上点击右键可隐藏该点（状态保存在 sessionStorage 中，坐标轴自适应展开），按 R 键恢复初始视角与重置显示所有点。

线上地址：https://ai.mou7s.com

## 数据

来源：https://artificialanalysis.ai/models/ 。完整公开列表快照，共 704 个模型及推理档位，其中 187 个三轴指标完整的模型全部绘图。缺失值不会补为零。获取时间与原始精度保存在 `src/data.json`。

成本取 `intelligenceIndexCostPerTask.cost.total`；时间取 `intelligenceIndexTimePerTask`（秒），绘图除以 60。时间为加权解码时间，不含 TTFT 或其他开销。方法：https://artificialanalysis.ai/methodology

## 开发和部署

技术栈为 Nuxt 4 + Vue 3 + Plotly，使用 Bun 管理依赖和运行本地开发（当前 Bun 1.4.3）。

```sh
bun install --frozen-lockfile
bun run dev
```

本地地址默认为 http://127.0.0.1:3000。图表仅在客户端加载。

运行 `bun run build` 生成静态站点到 `.output/public`，`bun run preview` 本地预览构建结果，`bun run deploy` 部署 Cloudflare Workers Static Assets。域名在 `wrangler.jsonc` 声明；线上提供静态文件，不运行 Bun。

运行 `bun run refresh-data` 刷新快照，再执行 `bun run check` 和 `bun run deploy`。刷新脚本使用 Node.js >= 24.5，以保留 `--use-env-proxy` 代理支持；Wrangler 部署工具也需要 Node.js。脚本读取公开模型页及页面声明的数据资源，按 AA 浏览器加载器的 AES-GCM + gzip 格式解析，参数来自公开页面，无需登录或 API 密钥。页面结构变化或有效模型不足时，报错并保留旧快照。Cloudflare Cron 每 6 小时自动刷新（北京时间 02:00、08:00、14:00、20:00），校验通过后将快照写入 Workers KV。网页通过 `/api/data` 读取，缓存 5 分钟；失败时保留上次成功快照，KV 不可用时回退到随部署提供的数据。自动刷新不会修改 Git 仓库中的快照，已打开的网页需刷新才会加载新数据。

## Cloudflare 自动更新部署

首次部署前运行 `bunx wrangler login`，再运行 `bun run deploy`。Wrangler 会自动创建并绑定 `MODEL_DATA` KV；如提示确认创建，选择确认。首次定时刷新前，接口返回随部署提供的快照。

在 Cloudflare 控制台的 Workers → ai → Observability 查看定时任务的成功日志或失败原因；Triggers 中查看 Cron。Cron 配置生效可能需要约 15 分钟。

本地验证：`bun run check`、`node --test tests/worker.test.mjs`、`bun run build`、`bunx wrangler deploy --dry-run`。使用 `bunx wrangler dev --test-scheduled`，访问 `/cdn-cgi/mf/scheduled` 可在本地触发任务，本地 KV 与线上隔离。
