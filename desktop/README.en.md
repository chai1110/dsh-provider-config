# Desktop (DeepSeek Harness Desktop) Configuration Guide

> **Platform status**: the config itself is **platform-independent** (Windows / macOS / Linux all use
> `~/.dsh/profiles/desktop/`), and it has been **verified on Windows (`0.2.0-rc.2`, 2026-09-29)**.
> The platform-specific part is *how the patches get into the asar* — see
> [`dsh-custom-patches/desktop/`](https://github.com/chai1110/dsh-custom-patches/blob/main/desktop/README.md).

The desktop app is an Electron application — **it does not use npm**. Its `dsh` command directory,
process, port (desktop `127.0.0.1:19387`) and profile are all separate from the web build;
**only the `~/.dsh` root is shared**.

---

## 1. Where the config lives

| Purpose | Path |
|---|---|
| **Desktop patch layer (the source in this folder)** | `~/.dsh/profiles/desktop/cordis.patch.yml` |
| Patch layer for the web build / VSCode plugin | `~/.dsh/profiles/web/cordis.patch.yml` |
| Old root config, migrated by the official app | `~/.dsh/settings.yaml.imported` (**don't edit — it's inert**) |
| Credentials (API keys, shared by both) | `~/.dsh/.credentials.yaml` |

**There is no `settings.yaml` in the root on purpose**: DSH renames it to `settings.yaml.imported`
during migration and keeps settings per profile (`join(profile.home, "settings.yaml")` in the code).
Nothing was lost. Also `~/.dsh/cordis.yml` is always `[]`; the plugin tree is
profile `package.json` `bundles` + `cordis.patch.yml` + `--patch` layers.

### ⚠️ The two profiles are independent

`profiles/desktop/` and `profiles/web/` each have **their own `cordis.patch.yml`** — changing one does
**not** affect the other. Models / theme / chat settings edited on the desktop side won't move the web
build or the VSCode plugin, and vice versa.

**The one exception is the SenseNova provider block**: it is bracketed by two marker lines (§4) and is
pushed to every profile by `tools/dsh-profile-sync.mjs` from `config/sensenova.yaml`, so **both ends
stay identical automatically**. Every other section still has to be **applied to both profiles by hand**.

---

## 2. Source (snapshot of the live local config)

```
desktop/
├── README.md                 # Chinese version
├── README.en.md              # this file
└── config/
    └── cordis.patch.yml      # local snapshot, 2026-09-29, 7894 bytes / 167 lines, 7 sections
                              # copied back after tools/dsh-profile-sync.mjs ran; includes the 2 sync markers
```

Contents:

| Section (`id`) | Purpose |
|---|---|
| `ui-settings-general` | `welcomeNoticeVersion` |
| `llm-pi-ai` | **SenseNova provider** (**5 models**, key from `SENSNOVA_API_KEY`) + `retryPolicy` 15 retries + compatibility-fix comments |
| `agent-default-model` | default model → `sensenova/deepseek-v4-flash` |
| `ui-theme` | dark theme + 14px font size |
| `ui-settings-account` | account page |
| `ui-chat` | chat area |
| `ui-settings` | remaining settings page |

> The provider template and key instructions live in the repo root
> [`config/sensenova.yaml`](../config/sensenova.yaml); this file is the result of **wiring it into the desktop profile**.

**Usage**: prefer the sync tool (§4). The copy-paste below is the bootstrap / fallback path.

```powershell
Copy-Item dsh-provider-config\desktop\config\cordis.patch.yml `
          "$HOME\.dsh\profiles\desktop\cordis.patch.yml" -Force
# then fully quit and reopen the desktop app
```

Back up first:

```powershell
Copy-Item "$HOME\.dsh\profiles\desktop\cordis.patch.yml" `
          "$HOME\.dsh\profiles\desktop\cordis.patch.yml.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

---

## 3. Shared data vs isolated config (why both ends show the same messages)

| | Shared? |
|---|---|
| Sessions `~/.dsh/sessions/--H-dsh--/` | ✅ shared (18 sessions here — same messages on both ends) |
| Session cache `~/.dsh/storages/session_projcache/` | ✅ shared |
| Credentials `~/.dsh/.credentials.yaml` | ✅ shared (SenseNova key configured once) |
| Provider block of `cordis.patch.yml` | ⚠️ **auto-synced** (marker-bounded, see §4) |
| Remaining `cordis.patch.yml` sections (theme / chat / settings…) | ❌ one per profile — keep aligned by hand |
| Runtime config (models / retry / theme) | ❌ one per profile (`retryPolicy` rides along with the provider block) |

**By design**: config isolated, data shared.

---

## 4. Keeping both in sync

Never hand-edit the provider block (`sensenova:` under `llm-pi-ai → config → providers:`).
Edit the template and let the tool push it:

```bash
# template (single source of truth): config/sensenova.yaml — edit here
# pushes to every face that carries the markers (web + desktop locally; headless has none)
node tools/dsh-profile-sync.mjs --dry-run   # preview
node tools/dsh-profile-sync.mjs             # write
node tools/dsh-profile-sync.mjs --check     # verify only, exit 1 on drift
node tools/dsh-profile-sync.mjs --list      # which faces are wired up
```

The markers bound the region (inside `llm-pi-ai → config → providers:`, around `sensenova:`):

```yaml
      # >>> dsh-provider-config:begin
      sensenova:
        ...
      # <<< dsh-provider-config:end
```

Three hard guarantees verified on 2026-09-29: the YAML **still parses**, `sensenova` is
**deep-equal to the template**, and every line **outside the markers is byte-identical**
(theme / chat / settings sections untouched).

Quick smoke check for the sections you edit on both ends:

```powershell
$a = "$HOME\.dsh\profiles\web\cordis.patch.yml"
$b = "$HOME\.dsh\profiles\desktop\cordis.patch.yml"
if ((Get-FileHash $a).Hash -eq (Get-FileHash $b).Hash) { "identical ✅" } else { "DIFFERS ⚠️ sync the non-provider sections" }
```

> The provider block is generated by the same sync run, so its content matches on both sides —
> the whole-file hash can still differ (other sections, timestamps). Treat the hash as a rough filter.

---

## 5. Platform differences (config side vs install side)

| | Config side (this repo) | Install side (patches) |
|---|---|---|
| Windows | `~/.dsh/profiles/desktop/` ✅ verified | `apply-desktop-asar-patches.js` ✅ verified |
| macOS | same path (home layout identical, **no difference expected**) | `.app/Contents/Resources/app.asar` + **code signing / quarantine** ⏳ to verify |
| Linux | same path | `/opt/DeepSeek Harness/resources/app.asar` ⏳ to verify |

So on macOS you only need to re-verify **how the patches land in the asar**; this config file can be
reused as-is. If both platforms end up with the same workflow, the patch script becomes a single
shared one; the config needs no merge either way.
