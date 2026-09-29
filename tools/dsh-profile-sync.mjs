#!/usr/bin/env node
// dsh-profile-sync.mjs —— 把 config/sensenova.yaml 同步进各「面」的 cordis.patch.yml。
//
// ─────────────────────────── 为什么需要这个工具 ───────────────────────────
// DSH 的每个「面」（profile）有各自的 ~/.dsh/profiles/<面>/cordis.patch.yml，
// **互不继承**。所以同一份供应商配置要在多处各写一遍：
//
//   ~/.dsh/profiles/web/cordis.patch.yml      ← 浏览器 / dsh web
//   ~/.dsh/profiles/desktop/cordis.patch.yml  ← 桌面版 Harness.app
//   ~/.dsh/profiles/headless/cordis.patch.yml ← headless
//
// 手工同步的后果是**静默漂移**：2026-09-29 实测就发现模板里 sensenova-6.8-flash-lite
// 多了一条 `description:`、而两个 profile 都没有；`off:` 的写法也各不相同。
// 这类漂移不会报错，只会在某天「为什么这个面的模型少一个字段」时才发现。
//
// 本工具把 config/sensenova.yaml 定为**唯一数据源**，渲染进每个 profile 的标记区间：
//
//       # >>> dsh-provider-config:begin
//       sensenova:
//         displayName: ...
//       # <<< dsh-provider-config:end
//
// 只替换标记之间的内容，**其余部分一个字符都不动**（每个面自己的
// agent-default-model / ui-chat 等配置完全不受影响）。
//
// 模板顶部的整段注释（「复制本文件的内容到…」）是模板自身的说明，不会写进 profile；
// 模板内部的注释（如 compat 那两段）会一并带过去，让 profile 自解释。
//
// ──────────────────────────────── 用法 ────────────────────────────────
//   node tools/dsh-profile-sync.mjs              # 同步（写入）
//   node tools/dsh-profile-sync.mjs --check      # 只检测漂移，有漂移退出码 1（可用于巡检/CI）
//   node tools/dsh-profile-sync.mjs --dry-run    # 预览将要写入的内容，不落盘
//   node tools/dsh-profile-sync.mjs --list       # 列出发现的面及标记状态
//
//   --profiles <dir>   指定 profile 根目录（默认 ~/.dsh/profiles）
//   -h, --help         显示本说明
//
// 退出码：0 = 一致 / 同步成功；1 = --check 发现漂移；2 = 用法或环境错误。
//
// 零依赖：只用 node 标准库。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SRC = path.join(REPO, 'config', 'sensenova.yaml');

const RED = '\x1b[0;31m'; const GREEN = '\x1b[0;32m'; const YELLOW = '\x1b[1;33m';
const DIM = '\x1b[2m'; const NC = '\x1b[0m';
const say = (...a) => console.log(a.join(''));

// 标记行：允许任意缩进（缩进量决定渲染时的缩进），也允许标记后追加说明文字
const RE_BEGIN = /^(\s*)#\s*>>>\s*dsh-provider-config:begin\b/;
const RE_END = /^(\s*)#\s*<<<\s*dsh-provider-config:end\b/;

function usage() {
  const text = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const lines = text.split('\n');
  const out = [];
  for (const l of lines) {
    if (!l.startsWith('//')) continue;
    out.push(l.replace(/^\/\/ ?/, ''));
  }
  // 去掉「用法」之后的 shebang/代码分隔噪音：只取到「退出码」那段
  console.log(out.join('\n'));
}

/** 读出模板正文：去掉顶部整段注释与空行（那是模板自身说明），保留其余内容（含内部注释）。 */
function readSourceBody() {
  if (!fs.existsSync(SRC)) {
    say(`${RED}找不到模板：${SRC}${NC}`);
    process.exit(2);
  }
  const raw = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trimStart().startsWith('#'))) i++;
  const body = lines.slice(i);
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
  if (body.length === 0) {
    say(`${RED}模板正文为空：${SRC}${NC}`);
    process.exit(2);
  }
  return body;
}

/** 按给定缩进渲染模板正文（空行保持空，不留尾随空格）。 */
function render(body, indent) {
  return body.map((l) => (l.trim() === '' ? '' : indent + l));
}

/** 只用于「差异展示」的归一化：去掉行尾注释与多余空白，避免把纯注释差异报成内容差异。 */
function normalizeForDiff(line) {
  let s = line.trim();
  const i = s.indexOf(' #');          // 行尾注释（模板里惯用「值 + 空格 + # 注释」写法）
  if (i >= 0) s = s.slice(0, i).trimEnd();
  return s.replace(/\s+/g, ' ');
}

/** 找到标记区间；返回 {beginIdx, endIdx, indent} 或 null。 */
function findRegion(lines) {
  let beginIdx = -1; let endIdx = -1; let indent = '';
  for (let i = 0; i < lines.length; i++) {
    const mb = lines[i].match(RE_BEGIN);
    if (mb && beginIdx === -1) { beginIdx = i; indent = mb[1]; continue; }
    const me = lines[i].match(RE_END);
    if (me && beginIdx !== -1) { endIdx = i; break; }
  }
  if (beginIdx === -1 || endIdx === -1) return null;
  return { beginIdx, endIdx, indent };
}

/** 用渲染结果替换标记区间内的内容，返回新文本。 */
function applyRegion(lines, region, rendered) {
  return [
    ...lines.slice(0, region.beginIdx + 1),
    ...rendered,
    ...lines.slice(region.endIdx),
  ].join('\n');
}

// ─────────────────────────────── 主流程 ───────────────────────────────
const argv = process.argv.slice(2);
let mode = 'sync';
let profilesRoot = path.join(os.homedir(), '.dsh', 'profiles');

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--check') mode = 'check';
  else if (a === '--dry-run') mode = 'dryrun';
  else if (a === '--list') mode = 'list';
  else if (a === '--profiles') { profilesRoot = argv[++i] ?? profilesRoot; }
  else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  else { say(`${RED}未知参数：${a}${NC}（用 --help 看用法）`); process.exit(2); }
}

const body = readSourceBody();

if (!fs.existsSync(profilesRoot)) {
  say(`${RED}找不到 profile 根目录：${profilesRoot}${NC}`);
  process.exit(2);
}

const targets = fs.readdirSync(profilesRoot)
  .map((name) => path.join(profilesRoot, name, 'cordis.patch.yml'))
  .filter((p) => fs.existsSync(p))
  .sort();

if (targets.length === 0) {
  say(`${YELLOW}在 ${profilesRoot} 下没有找到任何 cordis.patch.yml${NC}`);
  process.exit(0);
}

say(`${DIM}模板（唯一数据源）: ${SRC}${NC}`);
say(`${DIM}profile 根目录    : ${profilesRoot}${NC}`);
say('');

const noMarker = []; const drifted = []; const ok = []; const changed = [];

for (const file of targets) {
  const name = path.basename(path.dirname(file));
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const region = findRegion(lines);

  if (!region) { noMarker.push({ name, file }); continue; }

  const rendered = render(body, region.indent);
  const next = applyRegion(lines, region, rendered);

  if (mode === 'list') {
    ok.push({ name, file, current: lines.length, next: next.split('\n').length });
    continue;
  }

  if (next === text) { ok.push({ name, file, current: lines.length, next: lines.length }); continue; }

  drifted.push({ name, file });

  if (mode === 'check') {
    const cur = lines.slice(region.beginIdx + 1, region.endIdx);
    const curKeys = new Set(cur.map(normalizeForDiff).filter((l) => l !== '' && !l.startsWith('#')));
    const newKeys = new Set(rendered.map(normalizeForDiff).filter((l) => l !== '' && !l.startsWith('#')));
    // 内容差异（忽略注释）：这才是真正会影响 DSH 行为的漂移
    const add = [...newKeys].filter((l) => !curKeys.has(l));
    const del = [...curKeys].filter((l) => !newKeys.has(l));
    // 注释差异：不影响行为，但会让「同一份配置」看起来不一样
    const curCmt = new Set(cur.map((l) => l.trim()).filter((l) => l.startsWith('#')));
    const newCmt = new Set(rendered.map((l) => l.trim()).filter((l) => l.startsWith('#')));
    const cmtAdd = [...newCmt].filter((l) => !curCmt.has(l)).length;
    const cmtDel = [...curCmt].filter((l) => !newCmt.has(l)).length;

    say(`${YELLOW}⚠ ${name} 有漂移${NC}  ${DIM}${file}${NC}`);
    if (add.length) {
      say(`  ${GREEN}模板有、profile 没有（${add.length} 行内容）${NC}`);
      add.slice(0, 8).forEach((l) => say(`    + ${l}`));
      if (add.length > 8) say(`    ${DIM}…还有 ${add.length - 8} 行${NC}`);
    }
    if (del.length) {
      say(`  ${RED}profile 有、模板没有（${del.length} 行内容）${NC}`);
      del.slice(0, 8).forEach((l) => say(`    - ${l}`));
      if (del.length > 8) say(`    ${DIM}…还有 ${del.length - 8} 行${NC}`);
    }
    if (add.length === 0 && del.length === 0) {
      say(`  ${DIM}内容一致，仅注释/格式不同（+${cmtAdd} / -${cmtDel} 行注释）${NC}`);
    }
    say('');
  } else if (mode === 'dryrun') {
    say(`${YELLOW}── ${name} 将写入的内容（${file}）──${NC}`);
    say(rendered.join('\n'));
    say(`${YELLOW}── ${name} 结束 ──${NC}`);
    say('');
  } else {
    fs.writeFileSync(file, next, 'utf8');
    changed.push({ name, file });
    say(`${GREEN}✓ 已同步${NC} ${name}  ${DIM}${file}${NC}`);
  }
}

// ─────────────────────────────── 汇总 ───────────────────────────────
if (mode === 'list') {
  say('发现的面：');
  for (const t of ok) say(`  ${GREEN}●${NC} ${t.name.padEnd(12)} 标记已就位  ${DIM}${t.file}${NC}`);
  for (const t of noMarker) say(`  ${YELLOW}○${NC} ${t.name.padEnd(12)} 缺少标记区间（不会被同步）  ${DIM}${t.file}${NC}`);
  say('');
  say(`${DIM}缺少标记的面如需纳入同步，请在其 llm-pi-ai 的 providers: 下加入这两行：${NC}`);
  say(`${DIM}      # >>> dsh-provider-config:begin${NC}`);
  say(`${DIM}      # <<< dsh-provider-config:end${NC}`);
  process.exit(0);
}

if (mode === 'check') {
  say('');
  if (drifted.length === 0) {
    say(`${GREEN}✅ 全部一致（${ok.length} 个面）${NC}`);
    if (noMarker.length) {
      say(`${YELLOW}   ${noMarker.length} 个面缺少标记区间，未纳入同步：${noMarker.map((t) => t.name).join(', ')}${NC}`);
    }
    process.exit(0);
  }
  say(`${RED}⚠️  ${drifted.length} 个面与模板不一致${NC}（一致 ${ok.length} 个）`);
  say(`   修复：${YELLOW}node tools/dsh-profile-sync.mjs${NC}（写入）`);
  say(`   或先预览：${YELLOW}node tools/dsh-profile-sync.mjs --dry-run${NC}`);
  process.exit(1);
}

if (mode === 'dryrun') {
  say(`${DIM}（--dry-run：未写入任何文件）${NC}`);
  process.exit(0);
}

// sync
if (changed.length === 0) {
  say(`${GREEN}✅ 全部已是最新（${ok.length} 个面），未修改任何文件${NC}`);
} else {
  say(`${GREEN}✅ 已同步 ${changed.length} 个面：${changed.map((t) => t.name).join(', ')}${NC}`);
  say(`   ${YELLOW}重启对应界面后生效：${NC}`);
  say(`     • 浏览器：pkill -f 'dsh web'; dsh web  （然后硬刷新页面）`);
  say(`     • 桌面版：退出后重新 open Harness.app`);
}
if (noMarker.length) {
  say(`${YELLOW}⚠️  ${noMarker.length} 个面缺少标记区间，未纳入同步：${noMarker.map((t) => t.name).join(', ')}${NC}`);
  say(`   （用 --list 查看需要补哪两行标记）`);
}
