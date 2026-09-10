# DSH Provider Config
> 📖 [中文版](README.md)

> Field-tested LLM **provider configuration templates** and **rate-limit retry best practices** for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Currently focused on SenseNova (商汤 Token Plan), structured to extend to any OpenAI-compatible provider.

> **Versioning**: this repo is pure config templates — **not tied to any specific DSH version** (settings.yaml works across versions; verified up to `0.1.5-rc.1`, see the compatibility record below); git tags (e.g. `v0.1.2-rc.1`) merely mark template release points.

## Why this project

DSH configures LLM providers via `~/.dsh/settings.yaml`. The most critical — yet most overlooked — piece is **`retryPolicy`**. It decides:

- Whether a task auto-recovers when hitting rate limits (HTTP 429 / `RATE_LIMIT`)
- How long retries continue before giving up, and whether it can hang forever
- Whether persistent provider failures surface an error you can actually diagnose

This project distills these settings into ready-to-use templates and explains what every parameter means and the tradeoffs.

## Contents

| Path | Description |
|---|---|
| `config/sensenova.yaml` | Ready-to-use SenseNova provider template (copy into `~/.dsh/settings.yaml`) |
| `docs/retry-policy.md` | Retry mechanics in depth: `normal` vs `always`, exponential backoff, jitter, retry-count tradeoffs |
| `docs/troubleshooting.md` | Rate-limit troubleshooting: telling short bursts from persistent problems |

## Quick start

1. Open the template: `config/sensenova.yaml`
2. Read the retry mechanics: `docs/retry-policy.md`
3. Copy what you need into your `~/.dsh/settings.yaml`
4. Restart DSH, and enjoy automatic retry on rate limits

## Configuration template

See [`config/sensenova.yaml`](config/sensenova.yaml). Keys are referenced through the environment variable `SENSENOVA_API_KEY`.

## Retry policy at a glance

- **Recommended**: `mode: normal` + `maxRetries: 15` + `retryableCodes: [RATE_LIMIT, TIMEOUT, SERVER, TRANSPORT]`
- Exponential backoff `initialDelayMs → maxDelayMs` with jitter to avoid thundering-herd
- Full tradeoff analysis in [`docs/retry-policy.md`](docs/retry-policy.md)

## Compatibility record

Every config key comes from the official `dsh-llm` / `dsh-llm-pi-ai` schemas, so only those two need checking.

| DSH version | Result | Basis |
|---|---|---|
| `0.1.2-rc.1` | ✅ Template baseline | — |
| **`0.1.5-rc.1`** | ✅ **No template change needed** | See below |

**Item-by-item check against 0.1.5-rc.1 (2026-09-10)**

- `dsh-llm`'s `lib/types/retry-policy.{js,d.ts}` are **byte-identical** across the two versions →
  `retryPolicy.mode` / `maxRetries` / `retryableCodes` / `backoff.{initialDelayMs,maxDelayMs,jitterRatio}` all remain valid.
- `dsh-llm-pi-ai`'s `compat` keys went **28 → 31**, and **every change is an added optional key**, none removed:
  `thinkingTokenBudgetField`, `vllmPriority`, `supportsMaxOutputTokens`,
  `supportsMidConvoEffort`, `allowedFallbackModels`.
- Every key the template uses is confirmed present and unchanged in type in 0.1.5:
  `requiresReasoningContentOnAssistantMessages` (`z.boolean()`), `supportsDeveloperRole` (`z.boolean()`),
  `api: openai-completions` (still a valid api value), `defaultContextWindow`, `defaultMaxTokens`,
  `reasoningEfforts`, `apiKeyEnv`, `baseURL`, `displayName`.
- Note: `thinkingTokenBudget` semantics were adjusted in 0.1.5 (a new `thinkingTokenBudgetField` alias,
  explicit field wins). This template does not use that field, so it is unaffected.

> Conclusion: **just copy this template as-is on 0.1.5-rc.1** — no rewrite needed.
> For finer model-side tuning, the new optional compat keys in 0.1.5 (e.g. `supportsMaxOutputTokens`) are worth a look.

## License

MIT — see [LICENSE](LICENSE).
