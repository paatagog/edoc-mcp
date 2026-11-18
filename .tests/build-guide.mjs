// GUIDE.md → core/guide.js (ჩამტვირთავი snapshot-ში მხოლოდ .js/.json ფაილებს აკოპირებს, ამიტომ ტექსტი JS-შია ჩადებული).
// GUIDE.md-ის ყოველი ცვლილების შემდეგ: node .tests/build-guide.mjs
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const md = fs.readFileSync(path.join(root, "GUIDE.md"), "utf8");
fs.writeFileSync(path.join(root, "core", "guide.js"),
  "// ავტომატურად შექმნილია GUIDE.md-იდან (node .tests/build-guide.mjs). ხელით ნუ შეცვლი.\nexport const GUIDE = " + JSON.stringify(md) + ";\n");
console.log("core/guide.js", md.length);
