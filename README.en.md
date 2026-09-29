# DSH Provider Config
> 📖 [中文版](README.md)

> Field-tested LLM **provider configuration templates** for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Currently focused on **SenseNova (商汤 Token Plan)**, structured to extend to any OpenAI-compatible provider.

> **Versioning**: this repo is pure config templates — **not tied to any specific DSH version** (the config keys work across versions; verified up to **`0.2.0-rc.1`**, the official `next`); git tags (e.g. `v0.2.0-rc.1`) merely mark template release points.

## What you get

1. **A ready-to-use provider template** — [`config/sensenova.yaml`](config/sensenova.yaml); copy it into your config and go. Ships **5 models** (see the next section)
2. **Two gateway `400001` errors fixed** — SenseNova's gateway has two incompatibilities with thinking models; **leave them unfixed and long conversations will 400 continuously, looking "stuck"** (see "Configuration in detail 1")
3. **Automatic rate-limit retry** — 429s, quota exhaustion, timeouts, 5xx and network blips all back off and retry automatically, **with a retry cap so it can never hang forever** (see "Configuration in detail 2")

## Models included

The template ships these 5 models, **usable as-is — trim as needed**:

| Model ID | Display name | Context | Max output | Notes |
|---|---|---|---|---|
| **`deepseek-v4-flash`** | DeepSeek V4 Flash | 1M | 64K | ⭐ **Template default.** Previous-gen efficient general model (0731 GA), steadier at peak |
| `deepseek-flash` | DeepSeek V4.1 Flash | 1M | 64K | New-gen efficient general model; **fallback**, measured heavy 429s at peak |
| `kimi-k3` | Kimi K3 | 1M | 64K | Kimi's new-gen thinking model |
| `glm-5.2` | GLM-5.2 | 1M | 128K | Thinking model, larger output ceiling |
| `sensenova-6.8-flash-lite` | SenseNova 6.8 Flash Lite | 256K | 64K | Lightweight **multimodal** (text + image input); Flash-Lite credits have a bonus-back promo |

> All but `sensenova-6.8-flash-lite` declare `reasoningEfforts` (`off` / `low` / `medium` / `high`),
> so you can switch reasoning effort right in DSH.

## Quick start

1. Open the template: [`config/sensenova.yaml`](config/sensenova.yaml)
2. Export your key: `export SENSENOVA_API_KEY=<your-key>`
3. Copy the template contents into your provider config (**where it goes — see "Where the config lives"**)
4. Restart DSH — rate limits will now retry automatically

## Configuration in detail

The template has three parts, each with line-by-line comments. Here is **why** it is configured this way.

### 1. Gateway compatibility fix (`compat`) — skip it and long chats hang

DSH's pi-ai adapter treats the SenseNova gateway (`token.sensenova.cn`) as a **standard OpenAI endpoint**,
so two default behaviours trigger `400001` on the gateway's **thinking models**:

| Default behaviour | Why it breaks | This template |
|---|---|---|
| `requiresReasoningContentOnAssistantMessages: false` | pi-ai only auto-fills `reasoning_content` for `provider=deepseek` or a `baseURL` containing `deepseek.com` — SenseNova matches neither. In thinking mode, an assistant history entry with `tool_calls` but no `reasoning_content` makes the gateway return `reasoning_content must be passed back to the API` | set to `true` |
| `supportsDeveloperRole: true` | Once a model is flagged as reasoning, pi-ai rewrites `system` messages to the `developer` role (the OpenAI convention), but the SenseNova gateway only accepts `system` / `assistant` / `user` / `tool` and returns `invalid value: developer` | set to `false` |

**Why you must fix it**: when a conversation grows long enough to trigger **auto-compaction**, the summary request replays the history → the same `400001` fires → **compaction fails and every subsequent request keeps 400-ing, so the session looks "stuck"**. This config fixes both the normal request path and the compaction path.

> Both are **gateway-level** issues, independent of any specific model — every thinking model on the gateway is affected.
> Non-thinking models (`sensenova-6.8-flash-lite`) are unaffected.

**Verification status** (stated honestly — nothing unverified is claimed as verified):

- `developer` role error: **confirmed by live test** (400 reproduced, gone after the fix)
- `reasoning_content` error: **confirmed by the source-code logic chain** (pi-ai's fallback exists precisely for this error), but the original failing session was already cleared and a pure API call could not reproduce it — **pending a final long-conversation + `tool_call` live test**

### 2. Retry policy (`retryPolicy`)

| Parameter | Value here | Purpose |
|---|---|---|
| `mode` | `normal` | Retries only errors in `retryableCodes`, with a cap (`always` retries forever — **not recommended**) |
| `maxRetries` | `15` | Covers roughly 8 minutes of short-lived rate limiting; on exhaustion it fails and surfaces the problem |
| `retryableCodes` | `RATE_LIMIT`, `QUOTA`, `TIMEOUT`, `SERVER`, `TRANSPORT` | See the note below |
| `backoff` | `1000ms → 30000ms`, `jitterRatio: 0.3` | Exponential backoff + ±30% jitter to avoid a thundering herd |

> ⚠️ **Do not drop `QUOTA`.** SenseNova emits **two shapes of 429**, normalised to different codes —
> `429 + "inference tpm exhausted"` becomes `RATE_LIMIT`, while `429 + "Allocated quota exceeded"`
> is matched **first** by `isQuotaExceededError()` and becomes `QUOTA` (that check runs **before** the `\b429\b` test).
> **With only `RATE_LIMIT` and no `QUOTA`, the latter fails outright without retrying.**
> Full derivation in [`docs/retry-policy.md`](docs/retry-policy.md), troubleshooting in [`docs/troubleshooting.md`](docs/troubleshooting.md).

## Where the config lives

| DSH version | Provider config location |
|---|---|
| **0.1.5 and later** | the `llm-pi-ai:` section of `~/.dsh/profiles/web/cordis.patch.yml` |
| Before 0.1.5 | `~/.dsh/settings.yaml` |

> On upgrade DSH **auto-migrates** the old config and renames the original to `settings.yaml.imported`.
> New users can just write to `cordis.patch.yml`.

## Compatibility record

Every config key comes from the official `dsh-llm` / `dsh-llm-pi-ai` schemas, so only those two need checking.

| DSH version | Result | Basis |
|---|---|---|
| `0.1.2-rc.1` | ✅ Template baseline | — |
| **`0.1.5-rc.1`** | ✅ **No template change needed** | See below |
| **`0.1.7-rc.2`** | ✅ **All keys valid; ⚠️ config location moved** | See below |
| **`0.2.0-rc.1`** | ✅ **All keys valid; config location unchanged** | See below |

**Model catalog update (2026-09-27, per the SenseNova Token Plan console)**

- `deepseek-v4-pro` was delisted from the console → removed from the template and the example config (⚠️ the API `/v1/models` still listed that ID, but if the console plan does not include it, it is unusable)
- `deepseek-flash` added (DeepSeek V4.1 Flash, ctx 1M / maxout 65536, tools + json + reasoning)
- **Default model** (adjusted 2026-09-27 after testing): **`deepseek-v4-flash`** — head-to-head test: the 4.1 endpoint was rejected 3/3 with instant 429s (the new model is congested, both RPM and TPM exceeded), while V4 Flash succeeded 3/3 in ~2s. `deepseek-flash` (V4.1 Flash) stays in the list as a fallback for when peak traffic eases

**0.2.0-rc.1 check (2026-09-28)**

- `dsh-llm`'s `lib/types/retry-policy.{js,d.ts}` are **byte-identical** to 0.1.7-rc.2 (matching SHA-256) → `retryPolicy.mode` / `maxRetries` / `retryableCodes` / `backoff.{initialDelayMs,maxDelayMs,jitterRatio}` all remain valid
- `dsh-llm-pi-ai`'s `compat` keys went **26 → 26, zero additions or removals**; both keys this template uses (`requiresReasoningContentOnAssistantMessages`, `supportsDeveloperRole`) are among them
- Every provider / model-level key the template uses (`baseURL` / `apiKeyEnv` / `displayName` / `api` / `defaultContextWindow` / `defaultMaxTokens` / `reasoningEfforts` / `models` / `compat`) **is still present**
- **✅ Config location unchanged**: still `~/.dsh/profiles/web/cordis.patch.yml` (the official `dsh-llm-pi-ai` README states it "remains the single source of truth for what a route serves")
- ⚠️ New users note: `0.2.0-rc.1` is on the official **`next`** channel; `latest` is still `0.1.7-rc.2`. This template works on both — no change needed

**0.1.7-rc.2 check (2026-09-26)**

- `dsh-llm-retry` still ships `retryableCodes` / `initialDelayMs` / `maxDelayMs` / `jitterRatio` / `backoff`; `dsh-llm-pi-ai` still ships `baseURL` / `defaultContextWindow` / `defaultMaxTokens` / `reasoningEfforts` / `compat` / `displayName` / `apiKeyEnv` — **every key is valid**
- **⚠️ Config location moved (since 0.1.5)**: the provider config is auto-migrated into the profile patch layer `~/.dsh/profiles/web/cordis.patch.yml` (the old file is renamed `settings.yaml.imported`). Verified on this machine: after migration, `agent-default-model` still resolves to `sensenova/deepseek-v4-flash` on 0.1.7-rc.2

**Item-by-item check against 0.1.5-rc.1 (2026-09-10)**

- `dsh-llm`'s `lib/types/retry-policy.{js,d.ts}` are **byte-identical** across the two versions → `retryPolicy.mode` / `maxRetries` / `retryableCodes` / `backoff.{initialDelayMs,maxDelayMs,jitterRatio}` all remain valid
- `dsh-llm-pi-ai`'s `compat` keys went **28 → 31**, and **every change is an added optional key**, none removed: `thinkingTokenBudgetField`, `vllmPriority`, `supportsMaxOutputTokens`, `supportsMidConvoEffort`, `allowedFallbackModels`
- Every key the template uses is confirmed present and unchanged in type in 0.1.5: `requiresReasoningContentOnAssistantMessages` (`z.boolean()`), `supportsDeveloperRole` (`z.boolean()`), `api: openai-completions` (still a valid api value), `defaultContextWindow`, `defaultMaxTokens`, `reasoningEfforts`, `apiKeyEnv`, `baseURL`, `displayName`
- Note: `thinkingTokenBudget` semantics were adjusted in 0.1.5 (a new `thinkingTokenBudgetField` alias, explicit field wins). This template does not use that field, so it is unaffected

> Conclusion: **just copy this template as-is on 0.1.5-rc.1** — no rewrite needed.
> For finer model-side tuning, the new optional compat keys in 0.1.5 (e.g. `supportsMaxOutputTokens`) are worth a look.

## 📌 Document status (which files are "latest")

**Target version: DSH `0.2.0-rc.1` (official `next`).**

⚠️ **Not every document in this repo has been rewritten alongside the latest version.** The table below states
each file's actual status — judge reliability by the "Status" column:

| File | Status | Notes |
|---|---|---|
| `config/sensenova.yaml` | ✅ Up to date | Model catalog updated (removed the delisted `deepseek-v4-pro`, added `deepseek-flash`); default model is `deepseek-v4-flash` |
| `README.md` / `README.en.md` | ✅ Up to date | Includes the `0.2.0-rc.1` compatibility check |
| `docs/retry-policy.md` | ➖ Version-independent | Retry mechanics and source-code basis; references no config path or version number, so it **needs no update per version** |
| `docs/troubleshooting.md` | ➖ Version-independent | Rate-limit troubleshooting steps; same as above |
| `SECURITY.md` | ➖ Version-independent | How to report vulnerabilities |

> "Adapted" in this repo means **the config keys are still valid on the target DSH version** (checked key by key
> against the official schemas) — it does **not** mean every document has been rewritten. This repo is
> **not tied to any specific DSH version**: the template works across versions, and the only thing that
> changes is the **config location** (moved to `cordis.patch.yml` as of 0.1.5 — see "Where the config lives").

## 🤝 Contributing & Feedback

Small project — **there is no separate contributing guide**. Just open an Issue or send a PR.

- Welcome: new provider config templates, improvements to the retry/rate-limit docs, and template bug fixes
- **The one hard rule**: never include a real API key — use environment variable names only (e.g. `SENSENOVA_API_KEY`)
- For security issues, follow [`SECURITY.md`](SECURITY.md) and report privately instead of opening a public issue

## License

MIT — see [LICENSE](LICENSE).
