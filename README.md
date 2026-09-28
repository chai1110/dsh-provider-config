# DSH Provider Config
> 📖 [English](README.en.md)

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 提供**经过实战验证**的 LLM 供应商配置模板与**限流重试机制**最佳实践。当前聚焦 SenseNova（商汤 Token Plan），结构可扩展到其他 OpenAI 兼容供应商。

> **版本管理**：本仓库为纯配置模板，**不依赖特定 DSH 版本**（配置键通用于各版本，已核对到 **`0.1.7-rc.2`（官方 `latest`）**，见下方「兼容性记录」）；git tag（如 `v0.1.7-rc.2`）仅用于标记模板自身的发布点。

## 📌 文档状态（哪些是最新的）

**目标版本：DSH `0.1.7-rc.2`（官方 `latest`）。**

⚠️ 本仓库**并非每个文档都随最新版同步重写过**。下表如实说明，请按「状态」列判断可信度：

| 文件 | 状态 | 说明 |
|---|---|---|
| `config/sensenova.yaml` | ✅ 已同步 | 模型目录已更新（移除下线的 `deepseek-v4-pro`、新增 `deepseek-flash`）；默认模型 `deepseek-v4-flash` |
| `README.md` / `README.en.md` | ✅ 已同步 | 含 `0.1.7-rc.2` 兼容性核对记录 |
| `docs/retry-policy.md` | ➖ 版本无关 | 重试机制原理与源码依据，不涉及配置路径或版本号，**无需随版本更新** |
| `docs/troubleshooting.md` | ➖ 版本无关 | 限流排查步骤，同上 |
| `SECURITY.md` | ➖ 与版本无关 | 漏洞上报联系方式 |

> 「适配」在本仓库指**配置键在目标 DSH 版本上仍然有效**（逐键核对官方 schema），
> **不是**指每个文档都重写过。本仓库**不依赖特定 DSH 版本** —— 模板通用于各版本，
> 唯一会变的是「配置位置」（0.1.5 起迁移至 `cordis.patch.yml`，见下方「兼容性记录」）。

## 为什么需要这个项目

DSH 通过供应商配置来设置 LLM 供应商——**0.1.5 起该配置位于 profile 补丁层 `~/.dsh/profiles/web/cordis.patch.yml`**（更早版本为 `~/.dsh/settings.yaml`，升级时 dsh 会自动迁移，见下方「兼容性记录」）。其中最关键、也最容易被忽略的是 **`retryPolicy`（重试策略）**——它直接决定了：

- 遇到限流（HTTP 429 / RATE_LIMIT）时，任务能否自动恢复
- 重试多久后放弃，会不会无限卡死
- 供应商持续故障时，能否及时暴露错误让你排查

本项目把这些配置整理成**可直接套用的模板**，并解释每个参数的含义与权衡。

## 项目内容

| 路径 | 说明 |
|---|---|
| `config/sensenova.yaml` | SenseNova 供应商的**配置模板**（复制进 `~/.dsh/profiles/web/cordis.patch.yml` 的 `llm-pi-ai:` 段；0.1.5 之前的版本为 `~/.dsh/settings.yaml`） |
| `docs/retry-policy.md` | 重试机制详解：`normal` vs `always`、指数退避、抖动、次数上限的权衡 |
| `docs/troubleshooting.md` | 限流排查指南：怎么判断是短暂限流还是持续性问题 |

## 快速开始

1. 查看配置模板：`config/sensenova.yaml`
2. 阅读重试机制：`docs/retry-policy.md`
3. 按需复制到你的供应商配置：**0.1.5 及以上**写入 `~/.dsh/profiles/web/cordis.patch.yml` 的 `llm-pi-ai:` 段；**0.1.5 之前**写入 `~/.dsh/settings.yaml`
4. 重启 DSH，享受遇到限流自动重试

## 配置模板

见 [`config/sensenova.yaml`](config/sensenova.yaml)。key 通过环境变量 `SENSENOVA_API_KEY` 引用。

## 重试机制速览

- **推荐** `mode: normal` + `maxRetries: 15` + `retryableCodes: [RATE_LIMIT, TIMEOUT, SERVER, TRANSPORT]`
- 指数退避 `initialDelayMs → maxDelayMs`，叠加抖动（jitter）避免惊群
- 详细的利弊权衡见 [`docs/retry-policy.md`](docs/retry-policy.md)

## 兼容性记录

配置键全部来自 DSH 官方 `dsh-llm` / `dsh-llm-pi-ai` 的 schema，因此只需核对这两处的变动。

| DSH 版本 | 核对结果 | 依据 |
|---|---|---|
| `0.1.2-rc.1` | ✅ 模板基准版本 | — |
| **`0.1.5-rc.1`** | ✅ **模板无需改动** | 见下 |
| **`0.1.7-rc.2`** | ✅ **配置键全部有效；⚠️ 配置位置迁移** | 见下 |


**模型目录更新（2026-09-27，以 SenseNova Token Plan 控制台为准）**

- `deepseek-v4-pro` 已从控制台下线 → 模板与示例配置移除（⚠️ API /v1/models 当时仍列出该 ID，但控制台计划不含即不可用）；
- 新增 `deepseek-flash`（DeepSeek V4.1 Flash，ctx 1M / maxout 65536，tools+json+reasoning）；
- 模板与示例配置同步更新；**默认模型**（2026-09-27 实测后调整）：**`deepseek-v4-flash`** —— 双模型对比实测：4.1 端点 3/3 全部 429 秒拒（新模型全网拥挤，RPM/TPM 双超），V4 Flash 3/3 成功约 2 秒。`deepseek-flash`（V4.1 Flash）保留在清单作备选，高峰过后可切换使用（实测 4.1 高峰期 429 频繁，重试策略会自动退避）。

**0.1.7-rc.2 核对（2026-09-26）**

- `dsh-llm-retry` 的 schema 仍含 `retryableCodes` / `initialDelayMs` / `maxDelayMs` / `jitterRatio` / `backoff`，`dsh-llm-pi-ai` 仍含 `baseURL` / `defaultContextWindow` / `defaultMaxTokens` / `reasoningEfforts` / `compat` / `displayName` / `apiKeyEnv` —— 全部有效。
- **⚠️ 配置位置迁移（0.1.5 起）**：`~/.dsh/settings.yaml` 的供应商配置由 dsh 自动迁移至 **profile 补丁层 `~/.dsh/profiles/web/cordis.patch.yml`**（原文件改名 `settings.yaml.imported`，本机已实证：迁移后的配置在 0.1.7-rc.2 上 `agent-default-model` 仍解析为 sensenova/deepseek-v4-flash）。**新装用户把模板写入 `cordis.patch.yml` 的 `llm-pi-ai:` 段**。

**0.1.5-rc.1 逐项核对（2026-09-10）**

- `dsh-llm` 的 `lib/types/retry-policy.{js,d.ts}` 两版**逐字节相同** → `retryPolicy.mode` /
  `maxRetries` / `retryableCodes` / `backoff.{initialDelayMs,maxDelayMs,jitterRatio}` 全部有效。
- `dsh-llm-pi-ai` 的 `compat` 键由 **28 → 31**，**净增量全部是新增可选项**，无删除：
  新增 `thinkingTokenBudgetField`、`vllmPriority`、`supportsMaxOutputTokens`、
  `supportsMidConvoEffort`、`allowedFallbackModels`。
- 模板用到的键逐个确认仍在 0.1.5 中存在且类型未变：
  `requiresReasoningContentOnAssistantMessages`（`z.boolean()`）、`supportsDeveloperRole`（`z.boolean()`）、
  `api: openai-completions`（仍为合法 api 值）、`defaultContextWindow`、`defaultMaxTokens`、
  `reasoningEfforts`、`apiKeyEnv`、`baseURL`、`displayName`。
- 另：`thinkingTokenBudget` 语义在 0.1.5 有文档级调整（新增 `thinkingTokenBudgetField` 别名，
  「显式字段优先」），本模板未使用该字段，不受影响。

> 结论：**0.1.5-rc.1 上直接照抄本模板即可**，无需任何改写。
> 需要更细的模型侧调优时可考虑 0.1.5 新增的可选 compat 键（如 `supportsMaxOutputTokens`）。

## 🤝 贡献与反馈

小项目，**没有单独的贡献指南** —— 直接开 Issue 或提 PR 就行。

- 欢迎：新的供应商配置模板、重试/限流文档的改进、模板 bug 修复。
- **唯一硬性要求**：提交里**绝不能出现真实 API key**，只用环境变量名（如 `SENSENOVA_API_KEY`）。
- 安全问题请按 [`SECURITY.md`](SECURITY.md) 私下反馈，不要开公开 issue。

## License

MIT — 见 [LICENSE](LICENSE)。