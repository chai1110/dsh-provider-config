# DSH Provider Config
> 📖 [English](README.en.md)

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 提供**经过实战验证**的 LLM 供应商配置模板与**限流重试机制**最佳实践。当前聚焦 SenseNova（商汤 Token Plan），结构可扩展到其他 OpenAI 兼容供应商。

> **版本管理**：本仓库为纯配置模板，**不依赖特定 DSH 版本**（settings.yaml 配置通用于各版本，已核对到 `0.1.5-rc.1`，见下方「兼容性记录」）；git tag（如 `v0.1.2-rc.1`）仅用于标记模板自身的发布点。

## 为什么需要这个项目

DSH 通过 `~/.dsh/settings.yaml` 配置 LLM 供应商。其中最关键、也最容易被忽略的是 **`retryPolicy`（重试策略）**——它直接决定了：

- 遇到限流（HTTP 429 / RATE_LIMIT）时，任务能否自动恢复
- 重试多久后放弃，会不会无限卡死
- 供应商持续故障时，能否及时暴露错误让你排查

本项目把这些配置整理成**可直接套用的模板**，并解释每个参数的含义与权衡。

## 项目内容

| 路径 | 说明 |
|---|---|
| `config/sensenova.yaml` | SenseNova 供应商的**配置模板**（可复制进 `~/.dsh/settings.yaml`） |
| `docs/retry-policy.md` | 重试机制详解：`normal` vs `always`、指数退避、抖动、次数上限的权衡 |
| `docs/troubleshooting.md` | 限流排查指南：怎么判断是短暂限流还是持续性问题 |

## 快速开始

1. 查看配置模板：`config/sensenova.yaml`
2. 阅读重试机制：`docs/retry-policy.md`
3. 按需复制到你的 `~/.dsh/settings.yaml`
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
- 模板与示例配置同步更新；默认模型仍为 `deepseek-v4-flash`（实测出话正常）。
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

## License

MIT — 见 [LICENSE](LICENSE)。