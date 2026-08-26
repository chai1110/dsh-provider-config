# DSH Provider Config

> Field-tested LLM **provider configuration templates** and **rate-limit retry best practices** for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Currently focused on SenseNova (商汤 Token Plan), structured to extend to any OpenAI-compatible provider.

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

See [`config/sensenova.yaml`](config/sensenova.yaml). The template contains **no real API keys** — keys are referenced exclusively through the environment variable `SENSENOVA_API_KEY`.

## Retry policy at a glance

- **Recommended**: `mode: normal` + `maxRetries: 15` + `retryableCodes: [RATE_LIMIT, TIMEOUT, SERVER, TRANSPORT]`
- Exponential backoff `initialDelayMs → maxDelayMs` with jitter to avoid thundering-herd
- Full tradeoff analysis in [`docs/retry-policy.md`](docs/retry-policy.md)

## License

MIT — see [LICENSE](LICENSE).

## Security

This project **never contains real API keys**. Keys are referenced only by environment-variable name (e.g. `SENSENOVA_API_KEY`); templates contain nothing but the env-var name. See [SECURITY.md](SECURITY.md).