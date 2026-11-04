// ignore-list — დასავიზებელი/ხელმოსაწერი ჩანაწერები, რომლებიც აღარ უნდა ჩანდეს მოლოდინში მყოფებად
// (მაგ. კანცელარიამ დოკუმენტი ვიზის გარეშე გაატარა: ჩანაწერი იდოკში „დასავიზებლად“ რჩება, მაგრამ ვეღარც დავიზდება და ვეღარც წაიშლება).
// მხოლოდ ლოკალური ფაილია — იდოკში არაფერს ცვლის.
//
// ფაილის ადგილი (defaultIgnoreFile):
//   1) EDOC_IGNORE_FILE გარემოს ცვლადი;
//   2) Google Drive-ის კოდის საქაღალდე: <Drive>\AI-transform\edoc-mcp\.data\ignore.json — სინქრონიზდება კომპიუტერებს შორის
//      (წერტილიანი საქაღალდე ჩამტვირთავის ანაბეჭდში არ შედის, ამიტომ ჩაწერა კოდის გადატვირთვას არ იწვევს);
//   3) %LOCALAPPDATA%\edoc-mcp\ignore.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DRIVE_SUB = path.join("AI-transform", "edoc-mcp");

function findDriveCodeDir() {
  const roots = [];
  if (process.platform === "win32") {
    for (const L of "DEFGHIJKLMNOPQRSTUVWXYZ") for (const md of ["My Drive", "Мой диск", "ჩემი Drive"]) roots.push(`${L}:\\${md}`);
  } else {
    const cs = path.join(os.homedir(), "Library", "CloudStorage");
    try { for (const d of fs.readdirSync(cs)) if (d.startsWith("GoogleDrive")) roots.push(path.join(cs, d, "My Drive")); } catch {}
  }
  for (const r of roots) {
    const d = path.join(r, DRIVE_SUB);
    try { if (fs.existsSync(path.join(d, "tools.js"))) return d; } catch {}
  }
  return null;
}

export function defaultIgnoreFile() {
  const v = (process.env.EDOC_IGNORE_FILE || "").trim();
  if (v && !v.includes("${")) return path.normalize(v);
  const drive = findDriveCodeDir();
  if (drive) return path.join(drive, ".data", "ignore.json");
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "edoc-mcp", "ignore.json");
}

/**
 * ფაილი: { version: 1, items: [{ kind: "vise"|"sign", id, task_number, title, from, received_at, reason, added_at }] }
 * ყოველ წაკითხვაზე ფაილიდან იკითხება (სხვა კომპიუტერზე/ხელით შეცვლა მაშინვე ჩანს).
 */
export function createIgnoreStore(file) {
  const read = () => {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
      return Array.isArray(j?.items) ? j.items.filter((x) => x && x.id && (x.kind === "vise" || x.kind === "sign")) : [];
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw new Error(`ignore-list-ის ფაილი ვერ წავიკითხე (${file}): ${e.message}`);
    }
  };
  const write = (items) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, items }, null, 1), "utf8");
    fs.renameSync(tmp, file);
  };
  return {
    file,
    list: (kind) => read().filter((x) => !kind || x.kind === kind),
    map: (kind) => new Map(read().filter((x) => x.kind === kind).map((x) => [x.id, x])),
    add(entry) {
      const items = read();
      const i = items.findIndex((x) => x.kind === entry.kind && x.id === entry.id);
      const e = { ...entry, added_at: i >= 0 ? items[i].added_at : new Date().toISOString() };
      if (i >= 0) items[i] = { ...items[i], ...e }; else items.push(e);
      write(items);
      return { entry: e, existed: i >= 0 };
    },
    remove(kind, ids) {
      const set = new Set(ids);
      const items = read();
      const removed = items.filter((x) => (!kind || x.kind === kind) && set.has(x.id));
      if (removed.length) write(items.filter((x) => !removed.includes(x)));
      return removed;
    },
  };
}
