# ai · 三维图

浅色全屏 AI 模型三维散点图。X = Intelligence Index，Y = Cost per Task（USD），Z = Time per Task（分钟）。支持自由旋转、滚轮缩放、悬停查看指标、三轴平面视角及复位。

线上地址：https://ai.mou7s.com

## 数据

来源：https://artificialanalysis.ai/models/ 。完整公开列表快照，共 700 个模型及推理档位，其中 183 个三轴指标完整的模型全部绘图。缺失值不会补为零。获取时间与原始精度保存在 `src/data.json`。

成本取 `intelligenceIndexCostPerTask.cost.total`；时间取 `intelligenceIndexTimePerTask`（秒），绘图除以 60。时间为加权解码时间，不含 TTFT 或其他开销。方法：https://artificialanalysis.ai/methodology

## 开发和部署

Node.js >= 24.5。运行 `npm ci`、`npm run dev`。使用 `npm run build` 构建，`npm run deploy` 部署 Cloudflare Workers Static Assets。域名在 `wrangler.jsonc` 声明。

运行 `npm run refresh-data` 刷新快照，再执行 `npm run check` 和 `npm run deploy`。脚本读取公开模型页及页面声明的数据资源，按 AA 浏览器加载器的 AES-GCM + gzip 格式解析，参数来自公开页面，无需登录或 API 密钥。页面结构变化或有效模型不足时，报错并保留旧快照。没有自动更新定时任务。
