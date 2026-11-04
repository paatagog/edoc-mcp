#!/usr/bin/env node
// იდოკის MCP — ჩამტვირთავი. ხელსაწყოების კოდს კითხულობს საქაღალდიდან (EDOC_CODE_DIR, ნაგულისხმევად Documents\edoc-mcp)
// და ყოველ გამოძახებაზე ამოწმებს, შეიცვალა თუ არა — ასე კოდის შეცვლა გაფართოების ხელახლა დაყენებას არ საჭიროებს.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOADER_VERSION = "2.4.0";
const log = (...a) => console.error("[edoc-loader]", ...a);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(HERE, "seed");

// კოდის საქაღალდის არჩევა:
// 1) პარამეტრებში ხელით მითითებული (თუ ძველი ნაგულისხმევი Documents\edoc-mcp არ არის);
// 2) Google Drive-ზე ავტომატურად ნაპოვნი "My Drive\AI-transform\edoc-mcp" (ნებისმიერ დისკზე / macOS-ის CloudStorage-ში);
// 3) Documents\edoc-mcp (ცარიელს seed-ით ავსებს).
const DRIVE_SUB = path.join("AI-transform", "edoc-mcp");
const LEGACY_DEFAULT = path.join(os.homedir(), "Documents", "edoc-mcp");
const hasCode = (d) => { try { return fs.existsSync(path.join(d, "tools.js")); } catch { return false; } };
function findDrive() {
  const roots = [];
  if (process.platform === "win32") {
    for (const L of "DEFGHIJKLMNOPQRSTUVWXYZ") for (const md of ["My Drive", "Мой диск", "ჩემი Drive"]) roots.push(`${L}:\\${md}`);
  } else {
    const cs = path.join(os.homedir(), "Library", "CloudStorage");
    try { for (const d of fs.readdirSync(cs)) if (d.startsWith("GoogleDrive")) roots.push(path.join(cs, d, "My Drive")); } catch {}
  }
  for (const r of roots) { const d = path.join(r, DRIVE_SUB); if (hasCode(d)) return d; }
  return null;
}
function codeDir() {
  const v = (process.env.EDOC_CODE_DIR || "").trim();
  const explicit = v && !v.includes("${") ? path.normalize(v) : null;
  const isLegacy = explicit && explicit.toLowerCase() === path.normalize(LEGACY_DEFAULT).toLowerCase();
  if (explicit && !isLegacy) return { dir: explicit, how: "პარამეტრებიდან", kind: "explicit" };
  const drive = findDrive();
  if (drive) return { dir: drive, how: "Google Drive (ავტომატურად)", kind: "drive" };
  return { dir: LEGACY_DEFAULT, how: "Documents (Drive ვერ ვიპოვე)", kind: "documents" };
}
const { dir: DIR, how: DIR_HOW, kind: DIR_KIND } = codeDir();

// პირველი გაშვება: საქაღალდე ცარიელია — ვავსებთ გაფართოებასთან მოყოლილი კოდით
if (!fs.existsSync(path.join(DIR, "tools.js"))) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.cpSync(SEED, DIR, { recursive: true, force: false, errorOnExist: false });
  log("საქაღალდე შეივსო:", DIR);
}

// განახლება: Documents-ის საქაღალდეში (თანამშრომლის კომპიუტერი, Drive-ის გარეშე) კოდი გაფართოებასთან ერთად ახლდება.
// თუ გაფართოებაში ჩადებული კოდის ვერსია (VERSION) უფრო ახალია — ძველს სარეზერვოდ ვინახავთ და ახლით ვცვლით.
// Drive-ისა და ხელით მითითებულ საქაღალდეს არ ვეხებით — იქ კოდს თავად ვაახლებთ.
const verOf = (f) => { try { return (fs.readFileSync(f, "utf8").match(/export const VERSION = "([\d.]+)"/) || [])[1] || "0"; } catch { return "0"; } };
const cmpVer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
let SEED_UPDATE = null;
if (DIR_KIND === "documents") {
  try {
    const sv = verOf(path.join(SEED, "tools.js")), dv = verOf(path.join(DIR, "tools.js"));
    if (cmpVer(sv, dv) > 0) {
      const backup = `${DIR}.backup-${dv}-${new Date().toISOString().slice(0, 10)}`;
      fs.cpSync(DIR, backup, { recursive: true, force: true });
      fs.cpSync(SEED, DIR, { recursive: true, force: true });
      SEED_UPDATE = { from: dv, to: sv, backup };
      log("კოდი განახლდა:", dv, "→", sv, "; ძველი:", backup);
    }
  } catch (e) { log("განახლება ვერ მოხერხდა:", e.message); }
}

function listFiles(d, base = d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else if (/\.(m?js|json)$/i.test(e.name)) out.push(p);
  }
  return out;
}
function stampOf() {
  const h = crypto.createHash("sha1");
  for (const f of listFiles(DIR).sort()) { const st = fs.statSync(f); h.update(`${f}|${st.size}|${st.mtimeMs}\n`); }
  return h.digest("hex").slice(0, 12);
}

// ყოველი ვერსია ცალკე ასლში იტვირთება, რომ Node-ის მოდულების ქეშმა ძველი კოდი არ დაგვიტოვოს
const SNAP_ROOT = path.join(os.tmpdir(), "edoc-mcp-snapshots");
let current = { stamp: null, version: null, tools: new Map() };
let lastError = null;

async function load() {
  let st;
  try { st = stampOf(); } catch (e) { lastError = `საქაღალდე ვერ წავიკითხე (${DIR}): ${e.message}`; return current; }
  if (st === current.stamp) return current;
  try {
    const snap = path.join(SNAP_ROOT, st);
    if (!fs.existsSync(path.join(snap, "tools.js"))) {
      fs.mkdirSync(snap, { recursive: true });
      for (const f of listFiles(DIR)) { const t = path.join(snap, path.relative(DIR, f)); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(f, t); }
      fs.writeFileSync(path.join(snap, "package.json"), JSON.stringify({ type: "module" }));
    }
    const mod = await import(pathToFileURL(path.join(snap, "tools.js")).href);
    const list = await mod.default({ z });
    if (!Array.isArray(list)) throw new Error("tools.js-მა სია არ დააბრუნა");
    current = { stamp: st, version: mod.VERSION || null, tools: new Map(list.map((t) => [t.name, t])) };
    lastError = null;
    log("ჩაიტვირთა ვერსია", current.version, st);
    try { for (const d of fs.readdirSync(SNAP_ROOT)) if (d !== st) fs.rmSync(path.join(SNAP_ROOT, d), { recursive: true, force: true }); } catch {}
  } catch (e) {
    lastError = `ახალი კოდი ვერ ჩაიტვირთა (ვიყენებ წინა ვერსიას): ${e.stack || e.message}`;
    current = { ...current, stamp: current.stamp }; // წინა ვერსია რჩება
    log(lastError);
  }
  return current;
}

const server = new McpServer({ name: "edoc", version: LOADER_VERSION });
const registered = new Map(); // name -> { handle, stamp }

// კლიენტს ვაცნობებთ ხელსაწყოების სიის/პარამეტრების ცვლილებას: ახალს ვარეგისტრირებთ, შეცვლილს ვაახლებთ, წაშლილს ვხსნით.
function syncTools() {
  for (const [name, reg] of registered) {
    if (!current.tools.has(name)) { try { reg.handle.remove(); } catch {} registered.delete(name); }
  }
  for (const [name, t] of current.tools) {
    const reg = registered.get(name);
    if (reg) {
      if (reg.stamp !== current.stamp) {
        const c = t.config || {};
        reg.handle.update({ title: c.title, description: c.description, paramsSchema: c.inputSchema || {}, annotations: c.annotations });
        reg.stamp = current.stamp;
      }
      continue;
    }
    const h = server.registerTool(name, t.config, async (args, extra) => {
      const c = await load();
      syncTools();
      const tool = c.tools.get(name);
      if (!tool) return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: `ხელსაწყო ${name} კოდში აღარ არის`, load_error: lastError }) }] };
      try {
        const r = await tool.handler(args, extra);
        if (lastError && r && Array.isArray(r.content)) r.content.push({ type: "text", text: JSON.stringify({ load_error: lastError }) });
        return r;
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: e.message, load_error: lastError }) }] };
      }
    });
    registered.set(name, { handle: h, stamp: current.stamp });
  }
}

server.registerTool(
  "edoc_reload",
  {
    title: "იდოკის კოდის ხელახლა ჩატვირთვა",
    description: "Reloads the eDocument tool code from its folder on this computer and reports the loaded version, the folder, the available tools and any load error. " +
      "Use after the code was changed; newly added tools are announced to the client (if the client does not show them, restart Claude).",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    await load();
    syncTools();
    return { content: [{ type: "text", text: JSON.stringify({ loader: LOADER_VERSION, code_dir: DIR, code_dir_source: DIR_HOW, seed_update: SEED_UPDATE, code_version: current.version, stamp: current.stamp, tools: [...current.tools.keys()], load_error: lastError }, null, 1) }] };
  }
);

await load();
syncTools();
await server.connect(new StdioServerTransport());
log("ჩამტვირთავი გაშვებულია; კოდი:", DIR, "—", DIR_HOW);
