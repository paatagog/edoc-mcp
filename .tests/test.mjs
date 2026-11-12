// core/edoc.js-ის ტესტები „ყალბ“ იდოკზე (ნამდვილ სისტემას არ ეხება).  გაშვება: node .tests/test.mjs
import assert from "node:assert/strict";
import { startMock } from "./mock.mjs";
import { createEdoc } from "../core/edoc.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { srv, state } = startMock(18199);
const edoc = createEdoc({ base: "http://localhost:18199", login: "p", password: "pw", vpnAuto: false, log: () => {} });
const t = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "—", e.message); process.exitCode = 1; } };

await t("შესვლა + დავალებები", async () => {
  const r = await edoc.listTasks({ n: 5, includeDetails: true });
  assert.equal(r.user, "გოგიშვილი პაატა"); assert.equal(r.tasks.length, 2);
  assert.equal(r.tasks[0].is_new, true); assert.equal(r.tasks[1].is_overdue, true);
  assert.equal(r.tasks[0].details.documents[0].number, "35/1");
});
await t("ვიზები: მხოლოდ მოლოდინში", async () => { assert.equal((await edoc.listVises({ onlyPending: true })).vises.length, 2); });
await t("დავიზება: რამდენიმე დამთხვევა → უარი", async () => { const r = await edoc.vise({ target: "ვიზა", confirm: true }); assert.equal(r.ok, false); assert.equal(state.vises[0].CurrentStatus, 1); });
await t("დავიზება: confirm-ის გარეშე → მხოლოდ preview", async () => { const r = await edoc.vise({ target: "100" }); assert.equal(r.dry_run, true); assert.equal(state.vises[0].CurrentStatus, 1); });
await t("დავიზება: confirm → სტატუსი 10 და გადამოწმება", async () => { const r = await edoc.vise({ target: "100", confirm: true }); assert.equal(r.ok, true); assert.equal(state.vises[0].CurrentStatus, 10); });
await t("დავიზება: უკვე დავიზებული → უარი", async () => { assert.equal((await edoc.vise({ target: "100", confirm: true })).ok, false); });
await t("ხელმოწერა: ვიზებს ელოდება → უარი", async () => { const r = await edoc.sign({ target: "201", confirm: true }); assert.equal(r.ok, false); assert.equal(state.signs[1].CurrentStatus, 1); });
await t("ხელმოწერა: ელექტრონული → უარი", async () => { const r = await edoc.sign({ target: "202", confirm: true }); assert.equal(r.ok, false); assert.equal(state.signs[2].CurrentStatus, 1); });
await t("ხელმოწერა: confirm → სტატუსი 12", async () => { const r = await edoc.sign({ target: "200", confirm: true }); assert.equal(r.ok, true); assert.equal(state.signs[0].CurrentStatus, 12); });
// ---------- ignore-list ----------
const ignDir = fs.mkdtempSync(path.join(os.tmpdir(), "edoc-ign-"));
const ignFile = path.join(ignDir, "sub", "ignore.json");
const ed2 = createEdoc({ base: "http://localhost:18199", login: "p", password: "pw", vpnAuto: false, log: () => {}, ignoreFile: ignFile });
await t("ignore: ცარიელი სია (ფაილი ჯერ არ არსებობს)", async () => { const r = await ed2.ignore({ action: "list" }); assert.equal(r.ok, true); assert.equal(r.total, 0); });
await t("ignore: რამდენიმე დამთხვევა → უარი", async () => { const r = await ed2.ignore({ action: "add", kind: "vise", target: "ვიზა" }); assert.equal(r.ok, false); assert.equal(r.candidates.length, 2); });
await t("ignore: kind-ის გარეშე → უარი", async () => { assert.equal((await ed2.ignore({ action: "add", target: "101" })).ok, false); });
await t("ignore: დამატება → სიაში აღარ ჩანს", async () => {
  const a = await ed2.ignore({ action: "add", kind: "vise", target: "101", reason: "კანცელარიამ გაატარა" }); assert.equal(a.ok, true); assert.equal(a.entry.id, "v2");
  const r = await ed2.listVises({ onlyPending: true }); assert.equal(r.vises.length, 0); assert.equal(r.ignored_hidden, 1);
  const r2 = await ed2.listVises({ onlyPending: true, includeIgnored: true }); assert.equal(r2.vises[0].ignored.reason, "კანცელარიამ გაატარა");
});
await t("ignore: გაცემულებზე არ მოქმედებს", async () => { const r = await ed2.listVises({ direction: "sent" }); assert.equal(r.ignored_hidden, undefined); });
await t("ignore: დავიზების მცდელობა → უარი, სტატუსი უცვლელი", async () => {
  const r = await ed2.vise({ target: "101", confirm: true }); assert.equal(r.ok, false); assert.match(r.error, /ignore-list/); assert.equal(state.vises[1].CurrentStatus, 2);
});
await t("ignore: ignore-list-ის გარეშე ინსტანცია ჩვეულებრივ ხედავს", async () => { assert.equal((await edoc.listVises({ onlyPending: true })).vises.length, 1); });
await t("ignore: ხელმოსაწერი + ფაილიდან წაკითხვა ახალ ინსტანციაში", async () => {
  assert.equal((await ed2.ignore({ action: "add", kind: "sign", target: "201" })).ok, true);
  const ed3 = createEdoc({ base: "http://localhost:18199", login: "p", password: "pw", vpnAuto: false, log: () => {}, ignoreFile: ignFile });
  const r = await ed3.listSigns({ onlyPending: true }); assert.equal(r.ignored_hidden, 1); assert.ok(!r.signs.some((x) => x.id === "s2"));
  assert.equal((await ed3.ignore({ action: "list" })).total, 2); assert.equal((await ed3.ignore({ action: "list", kind: "sign" })).total, 1);
});
await t("ignore: ხელახლა დამატება → დუბლიკატი არ ჩნდება", async () => { const r = await ed2.ignore({ action: "add", kind: "vise", target: "v2" }); assert.equal(r.ok, true); assert.equal((await ed2.ignore({ action: "list" })).total, 2); });
await t("ignore: ამოღება → ისევ ჩანს", async () => {
  assert.equal((await ed2.ignore({ action: "remove", kind: "vise", target: "101" })).ok, true);
  assert.equal((await ed2.listVises({ onlyPending: true })).vises.length, 1);
  assert.equal((await ed2.ignore({ action: "remove", kind: "vise", target: "101" })).ok, false);
});
fs.rmSync(ignDir, { recursive: true, force: true });


// ---------- ახალი დავალების შექმნა ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edoc-ct-"));
const docx = path.join(tmp, "memo.docx"), pdf = path.join(tmp, "inv.pdf");
fs.writeFileSync(docx, "DOCX"); fs.writeFileSync(pdf, "PDF");
await t("create: confirm-ის გარეშე → preview, არაფერი იქმნება", async () => {
  const r = await edoc.createTask({ title: "ტესტი", addressees: ["ტვილდიანი"], files: [{ path: docx }, { path: pdf }] });
  assert.equal(r.dry_run, true); assert.equal(r.will_create.addressees[0].employee_id, "L"); assert.equal(r.will_create.signer.position_id, "P");
  assert.equal(r.will_create.files[1].kind, "დანართი"); assert.equal(state.created.length, 0);
});
await t("create: ძირითადი არა-Word → უარი", async () => { const r = await edoc.createTask({ title: "x", addressees: ["ტვილდიანი"], files: [{ path: pdf }] }); assert.equal(r.ok, false); });
await t("create: ფაილი არ არსებობს → უარი", async () => { const r = await edoc.createTask({ title: "x", addressees: ["ტვილდიანი"], files: [{ path: docx + "z" }] }); assert.equal(r.ok, false); });
await t("create: ორაზროვანი ადრესატი → უარი კანდიდატებით", async () => { const r = await edoc.createTask({ title: "x", addressees: ["ბერიძე"], files: [{ path: docx }] }); assert.equal(r.ok, false); assert.equal(r.problems[0].candidates.length, 2); });
await t("create: ვიზიორი → ჯერ არ არის მხარდაჭერილი", async () => { const r = await edoc.createTask({ title: "x", addressees: ["ტვილდიანი"], files: [{ path: docx }], viseAuthors: ["ა"] }); assert.equal(r.ok, false); });
await t("create: შვებულებაში მყოფი → შემცვლელი", async () => { const r = await edoc.createTask({ title: "x", addressees: ["დარახველიძე ქეთევან"], files: [{ path: docx }] }); assert.equal(r.will_create.addressees[0].employee_id, "M"); assert.ok(r.will_create.notes[0].includes("შვებულ")); });
await t("create: საკუთარი მეორე თანამდებობით", async () => { const r = await edoc.createTask({ title: "x", addressees: ["ტვილდიანი"], files: [{ path: docx }], signerPosition: "ხარისხის" }); assert.equal(r.will_create.signer.position_id, "P2"); });
await t("create: confirm → სრული თანმიმდევრობა და ხელმოსაწერებში ჩნდება", async () => {
  const r = await edoc.createTask({ title: "ტესტი", addressees: ["ტვილდიანი ლია"], files: [{ path: pdf, kind: "attachment" }, { path: docx, kind: "main" }], confirm: true });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.created.task_number, "60001"); assert.equal(r.sign_item.task_number, "60001");
  const seq = state.calls.filter((c) => ["saveTask", "CreateTaskWorkingFolder", "Upload", "CheckTaskWorkingFolderIsEditable", "CreateTaskWorkingFolderInternalContact", "SaveTaskSignatoryChanges"].includes(c));
  assert.deepEqual(seq, ["saveTask", "CreateTaskWorkingFolder", "Upload", "Upload", "CheckTaskWorkingFolderIsEditable", "CreateTaskWorkingFolderInternalContact", "SaveTaskSignatoryChanges"]);
  assert.deepEqual(state.uploads.map((u) => u.type), ["1", "2"]); assert.equal(state.uploads[0].folder, "NF"); assert.equal(state.uploads[0].session, "S");
  const sg = state.created.find((c) => c.signers).signers[0]; assert.equal(sg.SignatoryPositionID, "P"); assert.equal(sg.AutoSignMode, 1);
  assert.equal(state.created.find((c) => c.folder).folder.taskWorkingFolder.DocumentType, 3);
  assert.ok(!state.calls.includes("ChangeSignatoryStatus") || state.calls.filter((c) => c === "ChangeSignatoryStatus").length === 1, "ხელს არ აწერს");
});
fs.rmSync(tmp, { recursive: true, force: true });
await t("ცვლილების ბრძანებები მხოლოდ confirm-ით", async () => {
  assert.deepEqual(state.calls.filter((c) => c.startsWith("Change")), ["ChangeViseAuthorStatus", "ChangeSignatoryStatus"]);
});
srv.close();
