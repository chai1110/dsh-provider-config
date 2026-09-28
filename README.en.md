# DSH Provider Config
> 📖 [中文版](README.md)

> Field-tested LLM **provider configuration templates** and **rate-limit retry best practices** for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Currently focused on SenseNova (商汤 Token Plan), structured to extend to any OpenAI-compatible provider.

> **Versioning**: this repo is pure config templates — **not tied to any specific DSH version** (the config keys work across versions; verified up to **`0.1.7-rc.2`**, the official `latest`, see the compatibility record below); git tags (e.g. `v0.1.7-rc.2`) merely mark template release points.

## Why this project

DSH configures LLM providers through its provider config — **as of 0.1.5 that lives in the profile patch layer `~/.dsh/profiles/web/cordis.patch.yml`** (earlier versions: `~/.dsh/settings.yaml`, which dsh auto-migrates on upgrade — see the compatibility record below). The most critical — yet most overlooked — piece is **`retryPolicy`**. It decides:

- Whether a task auto-recovers when hitting rate limits (HTTP 429 / `RATE_LIMIT`)
- How long retries continue before giving up, and whether it can hang forever
- Whether persistent provider failures surface an error you can actually diagnose

This project distills these settings into ready-to-use templates and explains what every parameter means and the tradeoffs.

## Contents

| Path | Description |
|---|---|
| `config/sensenova.yaml` | Ready-to-use SenseNova provider template (copy into the `llm-pi-ai:` section of `~/.dsh/profiles/web/cordis.patch.yml`; on pre-0.1.5 versions use `~/.dsh/settings.yaml`) |
| `docs/retry-policy.md` | Retry mechanics in depth: `normal` vs `always`, exponential backoff, jitter, retry-count tradeoffs |
| `docs/troubleshooting.md` | Rate-limit troubleshooting: telling short bursts from persistent problems |

## Quick start

1. Open the template: `config/sensenova.yaml`
2. Read the retry mechanics: `docs/retry-policy.md`
3. Copy what you need into your provider config: on **0.1.5+** the `llm-pi-ai:` section of `~/.dsh/profiles/web/cordis.patch.yml`; on **pre-0.1.5** `~/.dsh/settings.yaml`
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
| **`0.1.7-rc.2`** | ✅ **All keys valid; ⚠️ config location moved** | See below |

**0.1.7-rc.2 check (2026-09-26) & model catalog update (2026-09-27)**

- `dsh-llm-retry` still ships `retryableCodes` / `initialDelayMs` / `maxDelayMs` / `jitterRatio` / `backoff`; `dsh-llm-pi-ai` still ships `baseURL` / `defaultContextWindow` / `defaultMaxTokens` / `reasoningEfforts` / `compat` / `displayName` / `apiKeyEnv` — every template key is valid.
- **⚠️ Config location moved (since 0.1.5)**: the provider config migrates from `~/.dsh/settings.yaml` into the profile patch layer **`~/.dsh/profiles/web/cordis.patch.yml`** (the old file is renamed `settings.yaml.imported`). New users should put the template into the `llm-pi-ai:` section of that file.
- **Model catalog (per the SenseNova Token Plan console)**: `deepseek-v4-pro` delisted → removed; `deepseek-flash` (DeepSeek V4.1 Flash) added; **`deepseek-v4-flash` is the default** (adjusted 2026-09-27 after head-to-head testing: the 4.1 endpoint was rejected 3/3 with instant 429s — the new model is congested, both RPM and TPM exceeded — while V4 Flash succeeded 3/3 in ~2s). `deepseek-flash` stays in the list as a fallback for when 4.1 traffic eases (4.1 gets rate-limited at peak; the retry policy auto-backs-off).

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
