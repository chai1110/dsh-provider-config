# 桌面版（DeepSeek Harness Desktop）配置指南

> **平台状态**：配置本身**与平台无关**（Windows / macOS / Linux 都是 `~/.dsh/profiles/desktop/`），
> 已在 **Windows（`0.2.0-rc.2`，2026-09-29）** 实测。
> 真正有平台差异的是「补丁怎么打进 asar」—— 那部分见
> [`dsh-custom-patches/desktop/`](https://github.com/chai1110/dsh-custom-patches/blob/main/desktop/README.md)。

桌面版是 Electron 应用，**不走 npm**：`dsh` 命令目录、进程、端口（桌面 `127.0.0.1:19387`）、
profile 都与网页版独立，**只有 `~/.dsh` 根目录共享**。

---

## 一、配置文件放哪

| 用途 | 路径 |
|---|---|
| **桌面版补丁层（本目录的源码）** | `~/.dsh/profiles/desktop/cordis.patch.yml` |
| 网页版 / VSCode 插件用的补丁层 | `~/.dsh/profiles/web/cordis.patch.yml` |
| 官方已迁移的旧根配置 | `~/.dsh/settings.yaml.imported`（**别改，已失效**） |
| 凭据（API key 等，两端共用） | `~/.dsh/.credentials.yaml` |

**根目录没有 `settings.yaml` 是官方行为**：DSH 升级时把根配置改名成 `settings.yaml.imported`，
配置从此按 profile 存放（代码里是 `join(profile.home, "settings.yaml")`）。不是文件丢了。
另外 `~/.dsh/cordis.yml` 恒为 `[]`，插件树 = profile `package.json` 的 `bundles` + `cordis.patch.yml` + `--patch` 层。

### ⚠️ 两个 profile 互相独立

`profiles/desktop/` 与 `profiles/web/` **各有一份 `cordis.patch.yml`，改一边不会影响另一边**：
桌面版改了模型/重试/主题，网页版和 VSCode 插件照旧跑它自己那份；反过来同理。

**唯一例外是 SenseNova provider 段**：它被两行标记括起来（见第四节），
由 `tools/dsh-profile-sync.mjs` 从 `config/sensenova.yaml` 统一下发，**两端自动保持一致**。
其余各段（主题、聊天、设置……）仍然要**两边各改一次**。

---

## 二、源码（本机已生效配置的快照）

```
desktop/
├── README.md                 # 本文件
├── README.en.md              # 英文版
└── config/
    └── cordis.patch.yml      # 本机 2026-09-29 快照，7894 字节 / 167 行，7 段
                              # 由 tools/dsh-profile-sync.mjs 同步后回拷，含两行同步标记
```

覆盖内容：

| 段（id） | 作用 |
|---|---|
| `ui-settings-general` | `welcomeNoticeVersion` 欢迎提示版本 |
| `llm-pi-ai` | **SenseNova provider**（**5 个模型**，key 走 `SENSNOVA_API_KEY`）+ `retryPolicy` 15 次重试 + 兼容性修复注释 |
| `agent-default-model` | 默认模型 → `sensenova/deepseek-v4-flash` |
| `ui-theme` | 深色主题 + 14px 字号 |
| `ui-settings-account` | 账号页设置 |
| `ui-chat` | 聊天区设置 |
| `ui-settings` | 设置页其余项 |

> provider 的完整写法与密钥说明在仓库根 [`config/sensenova.yaml`](../config/sensenova.yaml)；
> 本文件是「**把它接进桌面 profile**」之后的实际落盘结果。

**用法**：优先用第四节的同步工具；下面的覆盖法是「首次接入 / 兜底」路径。

```powershell
Copy-Item dsh-provider-config\desktop\config\cordis.patch.yml "$HOME\.dsh\profiles\desktop\cordis.patch.yml" -Force
# 然后完全退出桌面应用再打开（改完务必重启）
```

改前先备份：

```powershell
Copy-Item "$HOME\.dsh\profiles\desktop\cordis.patch.yml" `
          "$HOME\.dsh\profiles\desktop\cordis.patch.yml.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

---

## 三、数据共享 / 配置隔离（为什么两端看到同一批消息）

| | 是否共享 |
|---|---|
| 会话消息 `~/.dsh/sessions/--H-dsh--/` | ✅ 共享（本机 18 个会话，两端看到的是同一批） |
| 会话缓存 `~/.dsh/storages/session_projcache/` | ✅ 共享 |
| 凭据 `~/.dsh/.credentials.yaml` | ✅ 共享（所以 SenseNova key 只配一次） |
| 补丁层 `cordis.patch.yml` 的 provider 段 | ⚠️ **自动同步**（见第四节，由标记区间统一） |
| 补丁层 `cordis.patch.yml` 的其余各段（主题/聊天/设置…） | ❌ 各一份，需手工保持一致 |
| 模型/重试/主题等运行配置 | ❌ 各一份（provider 内的 `retryPolicy` 除外，随 provider 段一起同步） |

**这是设计如此**：配置隔离、数据共享。在网页端发的消息，桌面端能看到，反之亦然。

---

## 四、怎么保持两边一致

provider 段（`llm-pi-ai` 下的 `sensenova:`）**不要手改 profile**，改模板后让工具下发：

```bash
# 模板（唯一数据源）：config/sensenova.yaml —— 改这里
# 下发到所有带标记的面（本机为 web + desktop；headless 无标记，不参与）
node tools/dsh-profile-sync.mjs --dry-run   # 预览差异
node tools/dsh-profile-sync.mjs             # 写入
node tools/dsh-profile-sync.mjs --check     # 只校验，不一致退出码 1
node tools/dsh-profile-sync.mjs --list      # 看哪些面已接入
```

标记由 profile 里这两行界定（写在 `llm-pi-ai → config → providers:` 下、`sensenova:` 前后）：

```yaml
      # >>> dsh-provider-config:begin
      sensenova:
        ...
      # <<< dsh-provider-config:end
```

校验工具的三条硬性质（2026-09-29 实测）：**YAML 仍可解析**、**`sensenova` 与模板深度相等**、
**标记区间之外的行逐字节未动**（主题/聊天/设置各段完全不受影响）。

非 provider 段（两边各改的那部分）改完做个快速比对：

```powershell
$a = "$HOME\.dsh\profiles\web\cordis.patch.yml"
$b = "$HOME\.dsh\profiles\desktop\cordis.patch.yml"
if ((Get-FileHash $a).Hash -eq (Get-FileHash $b).Hash) { "一致 ✅" } else { "不一致 ⚠️ 需要同步（provider 段的注释/格式差异属正常）" }
```

> 注意：两份文件的 provider 段由同一次同步生成，**内容一致但整文件 hash 可能不同**
> （各段排列、快照时间不同）——真正要比的是各段语义，hash 只是快速粗筛。

---

## 五、平台差异（配置侧 vs 安装侧）

| | 配置侧（本仓库） | 安装侧（补丁） |
|---|---|---|
| Windows | `~/.dsh/profiles/desktop/` ✅ 已实测 | `apply-desktop-asar-patches.js` ✅ 已实测 |
| macOS | 同样是 `~/.dsh/profiles/desktop/`（家目录布局一致，**预计无差异**） | `.app/Contents/Resources/app.asar` + **代码签名/quarantine** ⏳ 待实测 |
| Linux | 同上 | `/opt/DeepSeek Harness/resources/app.asar` ⏳ 待实测 |

也就是说：**mac 那边你只需要重新验证「补丁怎么打进 asar」，配置这一份可以原样复用**。
两边跑通后如果流程一致，就把补丁脚本合并成共用版本；配置这份本来就无需合并。
