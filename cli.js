#!/usr/bin/env node
// იდოკი — ბრძანების ხაზის ადაპტერი (იგივე core/edoc.js, AI-ის გარეშე: სკრიპტები, n8n, Telegram-ის ბოტი...).
// მომხმარებელი/პაროლი — გარემოს ცვლადებიდან: EDOC_LOGIN, EDOC_PASSWORD (არასავალდებულო: EDOC_BASE_URL, VPN_AUTO, VPN_PROFILE).
//
//   node cli.js tasks [N] [--new] [--details] [--sent]
//   node cli.js vises [N] [--pending] [--sent] [--ignored]
//   node cli.js signs [N] [--pending] [--esign] [--sent] [--ignored]
//   node cli.js vise <ნომერი|id|სათაური> [--comment "..."] [--confirm]
//   node cli.js sign <ნომერი|id|სათაური> [--comment "..."] [--confirm]
//   node cli.js ignore [list|add|remove] [vise|sign] [<ნომერი|id|სათაური>] [--reason "..."]
//   node cli.js vpn
//   node cli.js discover <regex>
//
// --confirm-ის გარეშე vise/sign მხოლოდ აჩვენებს. --confirm-ით კლავიატურიდან „კი“-ს ითხოვს (ავტომატიზაციისთვის: --yes).
import readline from "node:readline/promises";
import { createEdoc } from "./core/edoc.js";
import { defaultIgnoreFile } from "./core/ignore.js";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const pos = argv.slice(1).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--comment" && all[i - 1] !== "--reason");
const num = (d) => (pos[0] && /^\d+$/.test(pos[0]) ? Number(pos[0]) : d);
const direction = flag("--sent") ? "sent" : "received";

const edoc = createEdoc({
  base: process.env.EDOC_BASE_URL, login: process.env.EDOC_LOGIN, password: process.env.EDOC_PASSWORD,
  vpnAuto: (process.env.VPN_AUTO || "true") !== "false", vpnProfile: process.env.VPN_PROFILE,
  ignoreFile: defaultIgnoreFile(),
  log: () => {},
});

async function guarded(kind) {
  const target = pos[0];
  if (!target) throw new Error(`მიუთითე დოკუმენტი: node cli.js ${kind} <ნომერი|id|სათაური>`);
  const fn = kind === "vise" ? edoc.vise : edoc.sign;
  const preview = await fn({ target, comment: opt("--comment"), confirm: false });
  if (!flag("--confirm") || preview.ok === false) return preview;
  if (!flag("--yes")) {
    console.error(JSON.stringify(preview, null, 1));
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const a = (await rl.question(`${kind === "vise" ? "დავავიზო" : "ხელი მოვაწერო"}? (კი/არა): `)).trim().toLowerCase();
    rl.close();
    if (!["კი", "ki", "yes", "y"].includes(a)) return { ok: false, error: "გაუქმდა" };
  }
  return fn({ target, comment: opt("--comment"), confirm: true });
}

const commands = {
  tasks: () => edoc.listTasks({ n: num(10), direction, onlyNew: flag("--new"), includeDetails: flag("--details") }),
  vises: () => edoc.listVises({ n: num(15), direction, onlyPending: flag("--pending"), includeIgnored: flag("--ignored") }),
  signs: () => edoc.listSigns({ n: num(15), direction, onlyPending: flag("--pending"), includeEsign: flag("--esign"), includeIgnored: flag("--ignored") }),
  vise: () => guarded("vise"),
  sign: () => guarded("sign"),
  ignore: () => edoc.ignore({ action: pos[0] || "list", kind: pos[1], target: pos.slice(2).join(" ") || undefined, reason: opt("--reason") }),
  vpn: () => edoc.vpn(),
  discover: () => edoc.discover(pos[0] || "Vise", { skipJs: true }),
};

if (!commands[cmd]) {
  console.error("ბრძანებები: " + Object.keys(commands).join(", ") + "\nდეტალები — cli.js-ის თავში.");
  process.exit(2);
}
try {
  const r = await commands[cmd]();
  console.log(JSON.stringify(r, null, 1));
  process.exit(r && r.ok === false ? 1 : 0);
} catch (e) {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
}
