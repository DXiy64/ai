# ai · AI 模型对比

线上地址：[ai.mou7s.com](https://ai.mou7s.com)。

全屏三维散点与三个独立平面视图，比较能力、任务成本和任务时间。左上角菜单切换视图，不根据拖动或接近角度自动切换，也不添加吸附。

## 对比与操作

- 自由视图：拖动旋转、滚轮缩放，仅显示散点。坐标为能力、成本、时间，悬停查看原始数值与单位。
- 正视图：能力 × 时间；侧视图：成本 × 时间；俯视图：能力 × 成本。平面视图统一为左下较差、右上更优，成本与时间轴反向显示，数值不取反。
- 平面拖动只平移，滚轮以鼠标位置为中心缩放，范围为 1–50 倍，平移受完整数据范围约束。再次点击当前视图可复位。
- 平面点大小从 6px 缓慢增长至 10px，线宽从 1.3px 增长至 2.2px；自由视图的点大小也做有限调整，避免遮挡。
- 同一具体版本的不同思维档位按顺序连线，各版本颜色稳定。自由视图隐藏所有连线；不会把不同版本连成一条线。
- 默认显示全部有效数据。支持搜索及“系列 → 最新 / 旧版本 / 待确认 → 具体版本 → 思维档位”的复选筛选，父级显示部分选中状态。展开箭头支持鼠标和键盘。
- 中英文和深浅色可切换，偏好保存在本浏览器。切换时保留筛选和当前视野；小屏布局根据浏览器尺寸调整。

“最新”只表示**当前收录数据中同系列的最新版本**，优先按发布日期排序，日期不完整时使用可识别版本号；有歧义的版本列为待确认。系列和具体版本保持分离，例如 GPT Sol 与 GPT Luna、不同参数规模的模型不混为同一产品线。缺少完整三轴指标的最新版本会标明不可绘制，不会把旧版本冒充最新。

## 数据与自动更新

来源：[Artificial Analysis 模型列表](https://artificialanalysis.ai/models/)，[指标方法](https://artificialanalysis.ai/methodology)。快照及获取时间保存在 src/data.json，包含缺指标条目；只有三轴指标均有效的条目绘图，缺失值不补零。

成本为 intelligenceIndexCostPerTask.cost.total（USD / 任务）；时间为 intelligenceIndexTimePerTask（秒，显示时除以 60），不含 TTFT 等开销。releaseDate 用于版本归类。模型与有效档位数由数据动态计算，不写死在界面。

GitHub Actions 的 Refresh model snapshot 每小时检查源站，也可手动触发。源站的公开页面声明数据资源及 AES-GCM + gzip 加载参数，无需登录或 API 密钥。刷新先校验完整性、重复 ID 和指标，再原子写入快照；模型数据未变时不提交，抓取或校验失败时保留原文件并使任务报错。

页面启动、重新可见以及每 5 分钟读取一次 Mou7s/ai 的 main 分支公开快照，因此数据归类更新不依赖重新部署页面。读取失败、快照无效或比当前数据更旧时保留现有图表；默认全选会纳入新模型，部分选择只保留已选 ID。最新版本的出现取决于源站收录和定时任务成功运行，页面会显示快照日期。

合并后需确保仓库启用 Actions，并允许该刷新任务写入 main（分支保护若限制机器人写入，需由维护者配置）。Fork 默认仍读取正式仓库；独立运行时应将 src/main.js 的快照 URL 改为自己的仓库。

## 开发、检查和部署

Node.js >= 24.5。

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

端到端检查使用构建后的页面，另开终端运行预览：

```sh
npx playwright install chromium
npm run preview -- --port 4173
# 另一个终端
npm run test:ui
```

可用 BASE_URL 指定测试地址、PLAYWRIGHT_CHANNEL=chrome 使用已安装的 Chrome。测试覆盖视图、缩放边界与鼠标锚点、数据完整性、层级选择、新版本提升、异常快照保留、语言主题和偏好持久化；截图写入被忽略的 test-results/。PR 的 Check application 工作流运行数据检查、单元测试、构建和浏览器测试。

```sh
npm run refresh-data   # 手动刷新源站快照
npm run check
npm run deploy         # Vite 构建后部署 Cloudflare Workers Static Assets
```

域名和部署配置保留在 wrangler.jsonc。源码中的 catalog.js 管理系列/版本归类，preferences.js 管理翻译和主题，snapshot.js 在浏览器和刷新脚本间共享数据校验；不提交本地实验页、内嵌 Plotly 副本及过期截图。
