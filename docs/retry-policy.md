# DSH 限流重试机制详解

DSH 的 LLM 请求重试由 `@deepseek-ai/dsh-llm-retry` 插件执行，策略定义在每个供应商的 `retryPolicy` 配置下。

## 限流如何被识别

当供应商返回 HTTP 429 或消息含 `rate limit` 时，DSH 会把错误归一化为代码 **`RATE_LIMIT`**：

```js
if (/\b429\b|rate.?limit/i.test(message)) return "RATE_LIMIT";
```

`retryPolicy.retryableCodes` 里包含 `RATE_LIMIT`，就会触发重试。

## 两种模式

### `mode: normal`（推荐）

```yaml
retryPolicy:
  mode: normal
  maxRetries: 15
  retryableCodes: [RATE_LIMIT, TIMEOUT, SERVER, TRANSPORT]
  backoff: { initialDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0.3 }
```

- **只对 `retryableCodes` 里的错误重试**（429 限流、超时、5xx、网络错误）
- **有 `maxRetries` 上限**，重试耗尽后失败，向上层暴露错误

### `mode: always`（不推荐）

```yaml
retryPolicy:
  mode: always
  backoff: { initialDelayMs: 1000, maxDelayMs: 15000, jitterRatio: 0.2 }
```

- **所有错误都重试**，不看类型
- **无次数上限**，无限重试

## 指数退避公式

每次重试的等待时间按指数增长，叠加随机抖动：

```
第 1 次：initialDelayMs × 1
第 2 次：initialDelayMs × 2
第 3 次：initialDelayMs × 4
...
封顶：maxDelayMs
```

抖动：`delay × (1 - jitterRatio + 2 × jitterRatio × random())`

## 关键权衡：重试耗尽会发生什么

查 `@deepseek-ai/dsh-agent-loop` 源码，当重试决策不是 `retry`（即耗尽放弃）时：

```js
if (action?.kind !== "retry") throw new LlmError(...)
// 错误被捕获后
turnEnds = { kind: "error", error: error.failure }
```

**重试耗尽 = 当前这一轮（turn）直接以 error 终止**，不是"换个策略继续"。后续的工具调用、继续生成全部中断。

### 两种极端的问题

| 模式 | 短暂限流（几秒恢复） | 持续性问题（配额/余额/封号） |
|---|---|---|
| `normal` + `maxRetries=5` | ❌ 可能熬不过去，任务中断 | ✅ 报错暴露原因，可排查 |
| `always`（无限重试） | ✅ 熬过去，任务跑完 | ❌ 每 15s 试一次，无限空等 |

### 推荐折中

用 `normal` + **较大的 `maxRetries`** + **较长的 `maxDelayMs`**：

- `maxRetries: 15` + 退避到 30s ≈ 覆盖 **8 分钟**短暂限流窗口，绝大多数限流能熬过去
- 持续性问题会在约 8 分钟后失败并报错，方便排查，不会无限空等

## 参考

- 重试执行器：`@deepseek-ai/dsh-llm-retry`
- 策略 schema：`@deepseek-ai/dsh-llm/lib/types/retry-policy.js`（默认 `normal`，`maxRetries=5`，`retryableCodes` 含 `RATE_LIMIT/TIMEOUT/SERVER/TRANSPORT`）
- 429 归一化：`@deepseek-ai/dsh-llm-pi-ai`
