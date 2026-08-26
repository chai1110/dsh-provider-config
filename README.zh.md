# DSH Provider Config — DSH 供应商配置模板与重试机制

> 为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 提供**经过实战验证**的 LLM 供应商配置模板与**限流重试机制**最佳实践。当前聚焦 SenseNova（商汤 Token Plan），结构可扩展到其他 OpenAI 兼容供应商。

## 为什么需要这个项目

DSH 通过 `~/.dsh/settings.yaml` 配置 LLM 供应商。其中最关键、也最容易被忽略的是 **`retryPolicy`（重试策略）**——它直接决定了：

- 遇到限流（HTTP 429 / RATE_LIMIT）时，任务能否自动恢复
- 重试多久后放弃，会不会无限卡死
- 供应商持续故障时，能否及时暴露错误让你排查

本项目把这些配置整理成**可直接套用的模板**，并解释每个参数的含义与权衡。

## 项目内容

| 路径 | 说明 |
|---|---|
| `config/sensenova.yaml` | SenseNova 供应商的**脱敏配置模板**（可复制进 `~/.dsh/settings.yaml`） |
| `docs/retry-policy.md` | 重试机制详解：`normal` vs `always`、指数退避、抖动、次数上限的权衡 |
| `docs/troubleshooting.md` | 限流排查指南：怎么判断是短暂限流还是持续性问题 |

## 快速开始

1. 查看脱敏模板：`config/sensenova.yaml`
2. 阅读重试机制：`docs/retry-policy.md`
3. 按需复制到你的 `~/.dsh/settings.yaml`

## 配置模板（脱敏）

见 [`config/sensenova.yaml`](config/sensenova.yaml)。模板中**不包含任何真实 API key**，key 一律通过环境变量 `SENSENOVA_API_KEY` 引用。

## 重试机制速览

- **推荐** `mode: normal` + `maxRetries: 15` + `retryableCodes: [RATE_LIMIT, TIMEOUT, SERVER, TRANSPORT]`
- 指数退避 `initialDelayMs → maxDelayMs`，叠加抖动（jitter）避免惊群
- 详细的利弊权衡见 [`docs/retry-policy.md`](docs/retry-policy.md)

## License

MIT — 见 [LICENSE](LICENSE)。

## 安全声明

本项目**绝不包含真实 API key**。所有 key 一律通过环境变量引用（如 `SENSENOVA_API_KEY`），配置模板中只出现环境变量名。详见 [SECURITY.md](SECURITY.md)。
