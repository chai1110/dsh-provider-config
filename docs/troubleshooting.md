# 限流排查指南

当 DSH 报 `RATE_LIMIT` 或请求频繁失败时，按以下步骤判断是**短暂限流**还是**持续性问题**。

## 第一步：看重试日志

DSH 在每次重试时会追加事件 `llm/retry` 和 `llm/retry-started`。观察：

- **能重试几次然后成功** → 短暂限流，属于正常现象，当前配置能处理
- **重试 15 次后仍失败**（`mode: normal`）→ 可能是持续性问题，需要排查

## 第二步：判断问题类型

| 症状 | 可能原因 | 处理 |
|---|---|---|
| 偶尔 429，重试后恢复 | 短时 QPS 突发 | 正常，无需处理 |
| 持续 429，15 次都失败 | Token 套餐 QPS 配额低 | 降并发 / 升级套餐 / 增大退避间隔 |
| 报 402/403 配额或余额 | 余额不足 / 账号冻结 | 充值 / 联系供应商 |
| 报 401 认证失败 | API key 错误 | 检查 `SENSENOVA_API_KEY` 环境变量 |
| 报连接超时/网络错误 | 网络或防火墙 | 检查网络连通性 |

## 第三步：对症调整

### 短暂限流，但想提高成功率

调大 `maxRetries` 和 `maxDelayMs`：

```yaml
retryPolicy:
  mode: normal
  maxRetries: 20
  retryableCodes: [RATE_LIMIT, TIMEOUT, SERVER, TRANSPORT]
  backoff:
    initialDelayMs: 2000
    maxDelayMs: 60000
    jitterRatio: 0.3
```

### 怀疑持续性问题，想快速失败暴露

调小 `maxRetries`（比如 3），让问题尽快暴露：

```yaml
retryPolicy:
  mode: normal
  maxRetries: 3
  retryableCodes: [RATE_LIMIT, TIMEOUT, SERVER, TRANSPORT]
  backoff:
    initialDelayMs: 1000
    maxDelayMs: 10000
    jitterRatio: 0.3
```

### 尽量避免 `mode: always`

无限重试在持续性问题下会**无限空等**，且不暴露错误。除非你确定供应商限流总是短暂的，否则不要用。

## 通用建议

1. **不要把 key 写进配置**，用环境变量 `SENSENOVA_API_KEY` 引用
2. 修改配置后重启 `dsh web` 生效
3. 观察 `llm/retry` 事件判断重试是否生效
