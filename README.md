# DSH Provider Config
> 📖 [English](README.en.md)

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 提供**经过实战验证**的 LLM 供应商配置模板。当前聚焦 **SenseNova（商汤 Token Plan）**，结构可扩展到其他 OpenAI 兼容供应商。

> **版本管理**：本仓库为纯配置模板，**不依赖特定 DSH 版本**（配置键通用于各版本，已核对到 **`0.2.0-rc.2`（官方 `latest` 与 `next`）**）；git tag 仅用于标记模板自身的发布点。

## 这个仓库给你什么

1. **一份开箱可用的供应商模板** —— [`config/sensenova.yaml`](config/sensenova.yaml)，复制进配置即可用，内置 **5 个模型**（见下一节）
2. **修好网关的两个 `400001` 报错** —— SenseNova 网关对 thinking 模型有两处不兼容，**不修的话长对话会持续 400、看起来像"卡死"**（见「配置详解 1」）
3. **限流自动重试** —— 429 / 配额 / 超时 / 5xx / 网络抖动都会自动退避重试，**且有次数上限、不会无限卡死**（见「配置详解 2」）

## 配了哪些模型

模板内置以下 5 个模型，**开箱即用，按需删减**：

| 模型 ID | 显示名 | 上下文 | 最大输出 | 说明 |
|---|---|---|---|---|
| **`deepseek-v4-flash`** | DeepSeek V4 Flash | 1M | 64K | ⭐ **本模板默认**。上一代高效通用模型（0731 正式版），高峰期更稳 |
| `deepseek-flash` | DeepSeek V4.1 Flash | 1M | 64K | 新一代高效通用模型；**备选**，实测高峰期 429 频繁 |
| `kimi-k3` | Kimi K3 | 1M | 64K | Kimi 新一代 thinking 模型 |
| `glm-5.2` | GLM-5.2 | 1M | 128K | thinking 模型，输出上限更大 |
| `sensenova-6.8-flash-lite` | SenseNova 6.8 Flash Lite | 256K | 64K | 轻量**多模态**（文本 + 图片输入）；Flash-Lite 专属积分有返赠活动 |

> 除 `sensenova-6.8-flash-lite` 外的 4 个都声明了 `reasoningEfforts`（`off` / `low` / `medium` / `high`），
> 可在 DSH 里直接切换思考档位。

## 快速开始

1. 打开模板：[`config/sensenova.yaml`](config/sensenova.yaml)
2. 导出 key：`export SENSENOVA_API_KEY=<你的key>`
3. 把模板内容复制到供应商配置（**放哪见「配置文件放哪」一节**）
4. 重启 DSH —— 之后遇到限流会自动重试

## 配置详解

模板分三段，每段都带逐行注释，这里说清**为什么这么配**。

### 1. 网关兼容修复（`compat`）—— 不修会长对话卡死

DSH 的 pi-ai 适配器把 SenseNova 网关（`token.sensenova.cn`）当作**标准 OpenAI 端点**，
于是两项默认行为会在网关上的 **thinking 模型**上触发 `400001`：

| 默认行为 | 为什么出错 | 本模板 |
|---|---|---|
| `requiresReasoningContentOnAssistantMessages: false` | pi-ai 只对 `provider=deepseek` 或 `baseURL` 含 `deepseek.com` 自动补 `reasoning_content`，SenseNova 两者都不满足。thinking 模式下，带 `tool_calls` 的 assistant 历史若缺该字段，网关报 `reasoning_content must be passed back to the API` | 置为 `true` |
| `supportsDeveloperRole: true` | 模型被标记为 reasoning 后，pi-ai 会把 `system` 消息改写成 `developer` role（OpenAI 惯例），但 SenseNova 网关只接受 `system` / `assistant` / `user` / `tool`，报 `invalid value: developer` | 置为 `false` |

**为什么必须修**：对话变长触发**自动压缩**时，摘要请求会重放历史 → 同样报 `400001` →
**压缩失败、后续请求持续 400，会话看起来"卡死"**。本配置同时修复普通请求与压缩路径。

> 这两项是**网关级**问题，与具体模型无关 —— 凡网关上的 thinking 模型都会中招；
> 对非 thinking 模型（`sensenova-6.8-flash-lite`）无副作用。

**验证状态**（如实标注，未验完的不说成已验完）：

- `developer` role 错误：**已实测确认**（400 复现 + 修正后不再报）
- `reasoning_content` 错误：**源码逻辑链确证**（pi-ai 的兜底逻辑即为此错误设计），
  但原始出错会话已被清除、纯 API 调用未能复现，**待长对话 + `tool_call` 实测最终确认**

### 2. 重试策略（`retryPolicy`）

| 参数 | 本模板值 | 作用 |
|---|---|---|
| `mode` | `normal` | 只重试 `retryableCodes` 里的错误，且有次数上限（`always` 会无限重试，**不推荐**） |
| `maxRetries` | `15` | 约覆盖 8 分钟短暂限流；耗尽后失败，把问题暴露出来 |
| `retryableCodes` | `RATE_LIMIT`、`QUOTA`、`TIMEOUT`、`SERVER`、`TRANSPORT` | 见下方说明 |
| `backoff` | `1000ms → 30000ms`，`jitterRatio: 0.3` | 指数退避 + ±30% 抖动，避免惊群 |

> ⚠️ **`QUOTA` 不能省。** SenseNova 会产生**两种形态的 429**，归一化后走向不同 code ——
> `429 + "inference tpm exhausted"` 归为 `RATE_LIMIT`，而 `429 + "Allocated quota exceeded"`
> 会被 `isQuotaExceededError()` **优先命中**、归为 `QUOTA`（判断顺序在 `\b429\b` **之前**）。
> **只写 `RATE_LIMIT` 而不写 `QUOTA`，后一类错误会直接失败、不重试。**
> 完整推导见 [`docs/retry-policy.md`](docs/retry-policy.md)，排查步骤见 [`docs/troubleshooting.md`](docs/troubleshooting.md)。

## 配置文件放哪

DSH 每个「面」各有**一份自己的** `cordis.patch.yml`，供应商配置要**逐面配置** —— 它们**互不继承**：

| 面 | 供应商配置位置 |
|---|---|
| 浏览器 / `dsh web` | `~/.dsh/profiles/web/cordis.patch.yml` 的 `llm-pi-ai:` 段 |
| 桌面版 `DeepSeek Harness.app` | `~/.dsh/profiles/desktop/cordis.patch.yml` |
| VS Code Lite（自起实例） | 走 `web` profile，同上第一条 |
| 0.1.5 之前的老版本 | `~/.dsh/settings.yaml` |

> **桌面版两个要点**：
> 1. 桌面版 profile 由 Electron 应用**独占管理** —— `dsh --profile desktop` 会被直接拒绝
>    （`profile "desktop" is managed exclusively by the Electron application`），
>    所以只能**直接编辑文件**，改完**重启应用**生效。
> 2. API key 存在**全局** `~/.dsh/.credentials.yaml` 的 `refs` 里，各面共用，
>    **不需要在桌面版重新配 key**。

> **Windows**：DSH 用 `os.homedir()` 拼 `.dsh`（见官方 `dsh-home-paths`：`join(homedir(), ".dsh")`），
> 所以 `~` 就是 `%USERPROFILE%`，即实际路径为
> `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`（通常是 `C:\Users\<你>\.dsh\...`）；
> 桌面版同理为 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`。
> 官方同时支持 `~/` 与 `~\` 两种 `~` 展开写法，配置里两种都能用。

> 升级时 DSH 会**自动迁移**旧配置，原文件改名 `settings.yaml.imported`。
> 新装用户直接写 `cordis.patch.yml` 即可。

> ⚠️ **网页版与桌面版是两个独立 profile**（`web` / `desktop`），配置文件互不影响：
> 改网页版的 `cordis.patch.yml` 不会作用于桌面版，反之亦然 —— 两边都要单独配一份。
> 桌面版（DeepSeek Harness Desktop）与 npm 版**共享 `~/.dsh` 根目录**（`.credentials.yaml` /
> `settings.yaml.imported` / 会话数据），只有 profile 各自独立。本机桌面版配置建于 2026-09-29。

> 📁 **桌面版专题**：完整教程 + 已生效配置快照见 [`desktop/`](desktop/README.md)
> （`desktop/config/cordis.patch.yml`，2026-09-29，7 段 / 4600 字节；配置侧 Windows 与 macOS 路径相同，
> 有平台差异的是 asar 补丁安装，见 [`dsh-custom-patches/desktop/`](https://github.com/chai1110/dsh-custom-patches/blob/main/desktop/README.md)）。

### 多面同步：别再手工复制（推荐）

**各面互不继承** ⇒ 同一份供应商配置要在多处各写一遍 ⇒ 迟早**静默漂移**。
这不是假设：2026-09-29 实测就发现本仓库模板里 `models[].description` 多了一条、
而 web / desktop 两个 profile 都没有；`off:` 的写法也各不相同。**这类漂移不会报错。**

所以本仓库带了一个同步工具，把 `config/sensenova.yaml` 定为**唯一数据源**：

```bash
node tools/dsh-profile-sync.mjs --list       # 看哪些面已纳入同步
node tools/dsh-profile-sync.mjs --check      # 只检测漂移（退出码 1 = 有漂移，可用于巡检）
node tools/dsh-profile-sync.mjs --dry-run    # 预览将写入的内容
node tools/dsh-profile-sync.mjs              # 同步写入
```

它只替换 profile 里**一对哨兵注释之间**的内容，其余部分（各面自己的
`agent-default-model` / `ui-chat` 等）**一个字符都不动**：

```yaml
    providers:
      # >>> dsh-provider-config:begin —— 由 tools/dsh-profile-sync.mjs 生成，勿手改
      sensenova:
        displayName: ...
      # <<< dsh-provider-config:end
```

**设计要点**：

- **不用 YAML 解析器**：模板正文整体按哨兵行的缩进重排即可 —— 零依赖、不会因为
  解析器版本差异而改坏配置。
- 模板**顶部整段注释**是模板自身说明，不写进 profile；模板**内部注释**会一并带过去，
  让 profile 自解释（为什么设 `requiresReasoningContentOnAssistantMessages` 等）。
- 实测：同步后 web 的 80 行内容、desktop 的 93 行内容**逐行完全一致** ——
  即「只增加了注释，没有改动任何配置值」；再用 DSH 自带的 `yaml` 库解析三份
  （模板 / web / desktop），provider 对象**深相等**。
- 未加哨兵的面（如 `headless`，配置为 `[]`）**不会被同步**，只会提示。

> 新增一个面要纳入同步：在其 `llm-pi-ai` 的 `providers:` 下加那两行哨兵即可，
> 然后跑一次 `--check` 确认。

## 兼容性记录

配置键全部来自官方 `dsh-llm` / `dsh-llm-pi-ai` 的 schema，因此只需核对这两处。

| DSH 版本 | 核对结果 | 依据 |
|---|---|---|
| `0.1.2-rc.1` | ✅ 模板基准版本 | — |
| **`0.1.5-rc.1`** | ✅ **模板无需改动** | 见下 |
| **`0.1.7-rc.2`** | ✅ **配置键全部有效；⚠️ 配置位置迁移** | 见下 |
| **`0.2.0-rc.2`** | ✅ **配置键全部有效；配置位置不变** | 见下 |
| **`0.2.0-rc.1`** | ✅ 配置键全部有效 | 见下 |
| **`0.2.0-rc.2`（桌面版）** | ✅ **同一套配置键可用；改配到 `profiles/desktop`** | 桌面版 Electron 实测 2026-09-29 |

**模型目录更新（2026-09-27，以 SenseNova Token Plan 控制台为准）**

- `deepseek-v4-pro` 已从控制台下线 → 模板与示例配置移除（⚠️ API `/v1/models` 当时仍列出该 ID，但控制台计划不含即不可用）
- 新增 `deepseek-flash`（DeepSeek V4.1 Flash，ctx 1M / maxout 65536，tools + json + reasoning）
- **默认模型**（2026-09-27 实测后调整）：**`deepseek-v4-flash`** —— 双模型对比实测：4.1 端点 3/3 全部 429 秒拒（新模型全网拥挤，RPM/TPM 双超），V4 Flash 3/3 成功约 2 秒。`deepseek-flash`（V4.1 Flash）保留在清单作备选，高峰过后可切换

**0.2.0-rc.2 核对（2026-09-29）**

- `dsh-llm` 的 `lib/types/retry-policy.js` 与 0.2.0-rc.1 **逐字节相同**（SHA-256 一致）→ `retryPolicy.*` 全部有效
- **pi-ai 0.85.1 → 0.87.1**（官方注「部分旧模型 ID 被移除，已保存的选择可能需重新选择」——那只影响**内置**模型目录）；
  本模板的 sensenova provider 块为**自定义模型**（自备 ID/名称/上下文窗口），不受内置目录影响
- 实测：`dsh --profile web --dump-config` 组装校验通过（sensenova 块正常出现），launchd 服务干净重启
- ✅ 官方 `latest` 与 `next` 均已为 `0.2.0-rc.2`（2026-09-29 起），普通 `npm i -g @deepseek-ai/dsh` 即可

**0.2.0-rc.1 核对（2026-09-28）**

- `dsh-llm` 的 `lib/types/retry-policy.{js,d.ts}` 与 0.1.7-rc.2 **逐字节相同**（SHA-256 一致）→ `retryPolicy.mode` / `maxRetries` / `retryableCodes` / `backoff.{initialDelayMs,maxDelayMs,jitterRatio}` 全部有效
- `dsh-llm-pi-ai` 的 `compat` 键 **26 → 26，零增删**；本模板用到的 `requiresReasoningContentOnAssistantMessages` 与 `supportsDeveloperRole` 均在其中
- 模板用到的 provider / model 级键（`baseURL` / `apiKeyEnv` / `displayName` / `api` / `defaultContextWindow` / `defaultMaxTokens` / `reasoningEfforts` / `models` / `compat`）**全部仍在**
- **✅ 配置位置不变**：仍在 `~/.dsh/profiles/web/cordis.patch.yml`（官方 `dsh-llm-pi-ai` README 原文：该文件「仍然是决定路由服务内容的唯一事实」）
- ⚠️ 新装用户注意：`0.2.0-rc.1` 在官方 **`next`** 频道，`latest` 仍是 `0.1.7-rc.2`；本模板对两者都适用，无需改动

**0.1.7-rc.2 核对（2026-09-26）**

- `dsh-llm-retry` 的 schema 仍含 `retryableCodes` / `initialDelayMs` / `maxDelayMs` / `jitterRatio` / `backoff`；`dsh-llm-pi-ai` 仍含 `baseURL` / `defaultContextWindow` / `defaultMaxTokens` / `reasoningEfforts` / `compat` / `displayName` / `apiKeyEnv` —— **全部有效**
- **⚠️ 配置位置迁移（0.1.5 起）**：供应商配置由 dsh 自动迁移至 profile 补丁层 `~/.dsh/profiles/web/cordis.patch.yml`（原文件改名 `settings.yaml.imported`）。本机已实证：迁移后的配置在 0.1.7-rc.2 上 `agent-default-model` 仍解析为 `sensenova/deepseek-v4-flash`

**0.1.5-rc.1 逐项核对（2026-09-10）**

- `dsh-llm` 的 `lib/types/retry-policy.{js,d.ts}` 两版**逐字节相同** → `retryPolicy.mode` / `maxRetries` / `retryableCodes` / `backoff.{initialDelayMs,maxDelayMs,jitterRatio}` 全部有效
- `dsh-llm-pi-ai` 的 `compat` 键由 **28 → 31**，**净增量全部是新增可选项**，无删除：新增 `thinkingTokenBudgetField`、`vllmPriority`、`supportsMaxOutputTokens`、`supportsMidConvoEffort`、`allowedFallbackModels`
- 模板用到的键逐个确认仍在 0.1.5 中存在且类型未变：`requiresReasoningContentOnAssistantMessages`（`z.boolean()`）、`supportsDeveloperRole`（`z.boolean()`）、`api: openai-completions`（仍为合法 api 值）、`defaultContextWindow`、`defaultMaxTokens`、`reasoningEfforts`、`apiKeyEnv`、`baseURL`、`displayName`
- 另：`thinkingTokenBudget` 语义在 0.1.5 有文档级调整（新增 `thinkingTokenBudgetField` 别名，「显式字段优先」），本模板未使用该字段，不受影响

> 结论：**0.1.5-rc.1 上直接照抄本模板即可**，无需任何改写。
> 需要更细的模型侧调优时，可考虑 0.1.5 新增的可选 compat 键（如 `supportsMaxOutputTokens`）。

## 📌 文档状态（哪些是最新的）

**目标版本：DSH `0.2.0-rc.1`（官方 `next`）。**

⚠️ 本仓库**并非每个文档都随最新版同步重写过**。下表如实说明，请按「状态」列判断可信度：

| 文件 | 状态 | 说明 |
|---|---|---|
| `config/sensenova.yaml` | ✅ 已同步 | **唯一数据源**。模型目录已更新（移除下线的 `deepseek-v4-pro`、新增 `deepseek-flash`）；默认模型 `deepseek-v4-flash`。2026-09-29：惰性字段 `description` 改为注释、`off:` 统一为 `off: null` |
| `tools/dsh-profile-sync.mjs` | ✅ 已实测 | **多面同步工具**（零依赖）：把上面的模板渲染进各 profile 的哨兵区间；`--check` 检测漂移、`--dry-run` 预览。实测同步后两个 profile 的内容行逐行未变、provider 对象深相等 |
| `README.md` / `README.en.md` | ✅ 已同步 | 含 `0.2.0-rc.1` 兼容性核对记录 + 多面同步说明 |
| `docs/retry-policy.md` | ➖ 版本无关 | 重试机制原理与源码依据，不涉及配置路径或版本号，**无需随版本更新** |
| `docs/troubleshooting.md` | ➖ 版本无关 | 限流排查步骤，同上 |
| `SECURITY.md` | ➖ 与版本无关 | 漏洞上报联系方式 |

> 「适配」在本仓库指**配置键在目标 DSH 版本上仍然有效**（逐键核对官方 schema），
> **不是**指每个文档都重写过。本仓库**不依赖特定 DSH 版本** —— 模板通用于各版本，
> 唯一会变的是「配置位置」（0.1.5 起迁移至 `cordis.patch.yml`，见「配置文件放哪」）。

## 🤝 贡献与反馈

小项目，**没有单独的贡献指南** —— 直接开 Issue 或提 PR 就行。

- 欢迎：新的供应商配置模板、重试/限流文档的改进、模板 bug 修复
- **唯一硬性要求**：提交里**绝不能出现真实 API key**，只用环境变量名（如 `SENSENOVA_API_KEY`）
- 安全问题请按 [`SECURITY.md`](SECURITY.md) 私下反馈，不要开公开 issue

## License

MIT — 见 [LICENSE](LICENSE)。
