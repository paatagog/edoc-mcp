// edoc-core — Ilia State University-ის eDocument (იდოკი) კლიენტი.
// არ იცის MCP-ის / AI-ის შესახებ: ჩვეულებრივი ბიბლიოთეკაა, რომელსაც ნებისმიერი „ადაპტერი“ იყენებს
// (MCP — tools.js, ბრძანების ხაზი — cli.js, მომავალში HTTP/REST).
// შეუქცევადი მოქმედებების უსაფრთხოების წესები (dry-run, ზუსტად ერთი დამთხვევა, შემდგომი შემოწმება) აქაა,
// ამიტომ ყველა ადაპტერი მათ ავტომატურად იღებს.
import { ensureVpn, edocReachable } from "./vpn.js";
import { createIgnoreStore } from "./ignore.js";

export class EdocError extends Error {
  constructor(message, data) { super(message); this.data = data; }
}

// ---------- სტატუსები ----------
const STATUS = {
  1: ["Created", "ახალი"], 2: ["Reviewed", "ნანახი"], 3: ["ReRegistered", "გადაწერილია"],
  4: ["Suspended", "შეჩერებულია"], 5: ["PreCompleted", "შესრულებულია"],
  6: ["SentToConfirmation", "გაგზავნილია დასადასტურებლად"], 7: ["CompletionConfirmed", "დადასტურებულია"],
  8: ["ConfirmationRejected", "დადასტურება უარყოფილია"], 9: ["SentToVise", "გაგზავნილია ვიზირებაზე"],
  10: ["Vised", "დავიზებულია"], 11: ["ViseRefused", "ვიზაზე უარი"], 12: ["Signed", "ხელმოწერილია"],
  13: ["SentForSignature", "გაგზავნილია ხელმოსაწერად"], 14: ["SignRejected", "ხელმოწერაზე უარი"],
  15: ["Registered", "რეგისტრირებულია"], 16: ["RegistrationRejected", "რეგისტრაცია უარყოფილია"],
  17: ["InProcess", "მიმდინარე"], 18: ["Canceled", "გაუქმებულია"], 19: ["CreatedBySchema", "შექმნილია სქემით"],
  20: ["eSign_Request", "ელ. ხელმოწერის მოთხოვნა"], 21: ["eSign_Completed", "ელ. ხელმოწერა დასრულდა"],
  22: ["eSign_Reviewd", "ელ. ხელმოწერა ნანახია"], 23: ["eSign_Rejected", "ელ. ხელმოწერა უარყოფილია"],
  24: ["Sent", "ახალი"], 25: ["Registration_Process", "რეგისტრაციის პროცესში"],
};
const NEW_STATUSES = new Set([1, 24]);
const OPEN_STATUSES = new Set([1, 2, 4, 17, 24]);
const DOC_TYPES = { 1: ["Incoming", "შემოსული"], 2: ["Outgoing", "გასული"], 3: ["Internal", "შიდა"], 4: ["Order", "ბრძანება"] };

// "/Date(1793348082513+0400)/" -> "2026-10-30T12:14:42+04:00"
function wcfDate(v) {
  if (!v || typeof v !== "string") return null;
  const m = v.match(/Date\((-?\d+)([+-]\d{4})?\)/);
  if (!m) return v;
  const ms = Number(m[1]);
  const off = m[2] || "+0400";
  const sign = off[0] === "-" ? -1 : 1;
  const offMin = sign * (Number(off.slice(1, 3)) * 60 + Number(off.slice(3, 5)));
  const d = new Date(ms + offMin * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}${off.slice(0, 3)}:${off.slice(3)}`;
}
const wcfMs = (v) => { const m = typeof v === "string" && v.match(/Date\((-?\d+)/); return m ? Number(m[1]) : null; };
const clean = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() || null : s ?? null);

const CLIENT = 4; // SPAClient
const CLIENT_VERSION = "5.11.0.0";
const LANGUAGE = 1; // ქართული
const TIMEOUT_MS = 20000;

function shapeTask(t) {
  const st = t.CurrentStatus;
  const deadlineMs = wcfMs(t.DeadlineDate);
  return {
    id: t.ID,
    number: t.NumberMasked || String(t.Number),
    text: clean(t.TaskText),
    status: { code: st, name: STATUS[st]?.[0] || "Unknown", label: STATUS[st]?.[1] || `სტატუსი ${st}`, comment: clean(t.CurrentStatusComments) },
    is_new: NEW_STATUSES.has(st),
    is_overdue: deadlineMs != null && deadlineMs < Date.now() && OPEN_STATUSES.has(st),
    initiated_by_me: !!t.IsTaskInitiated,
    received_at: wcfDate(t.StartDate),
    deadline: wcfDate(t.DeadlineDate),
    from: { name: clean(t.CreatorInfo), employee_id: t.CreatorEmployeeID },
    responsible: { name: clean(t.ResponsibleInfo), responsible_id: t.ResponsibleID },
    related_document_numbers: (t.RelatedDocuments || "").split(";").map((s) => s.trim()).filter(Boolean),
    indicator: t.IndicatorName ? { name: t.IndicatorName, color: t.IndicatorColor } : null,
  };
}

const VISE_PENDING = new Set([1, 2, 9, 17, 24]); // ახალი / ნანახი / გაგზავნილია ვიზირებაზე / მიმდინარე
function shapeVise(v) {
  const st = v.CurrentStatus;
  return {
    id: v.ID,
    task_number: v.TaskNumberMasked || (v.TaskNumber != null ? String(v.TaskNumber) : null),
    title: clean(v.FolderName),
    status: { code: st, name: STATUS[st]?.[0] || "Unknown", label: STATUS[st]?.[1] || `სტატუსი ${st}`, comment: clean(v.CurrentStatusComments) },
    pending: VISE_PENDING.has(st),
    from: clean(v.CreatorInfo),
    recipients: clean(v.RecipientsMasked),
    received_at: wcfDate(v.EntryDate),
    deadline: wcfDate(v.Deadline),
    comments: clean(v.Comments),
    document_id: v.DocumentID || null,
    document_type: DOC_TYPES[v.DocumentType]?.[1] || null,
    task_id: v.TaskID || null,
    folder_id: v.FolderID || null,
  };
}
function matchItems(items, q) {
  const k = String(q).trim();
  return items.filter((v) => v.ID === k || v.TaskNumberMasked === k || String(v.TaskNumber) === k ||
    (k.length >= 4 && (v.FolderName || "").toLowerCase().includes(k.toLowerCase())));
}

const SIGN_PENDING = new Set([1, 2, 13, 17, 24]); // ახალი / ნანახი / გაგზავნილია ხელმოსაწერად / მიმდინარე
const SIGN_BLOCK = { 1: null, 2: "დაბლოკილია, სანამ ვიზირება არ დასრულდება", 3: "დაბლოკილია, სანამ ვიზები არ დადასტურდება" };
const ESIGN = { 1: "მონახაზი", 2: "გაგზავნილია ელ. ხელმოსაწერად", 3: "ელექტრონულად ხელმოწერილია" };
function shapeSign(v) {
  const st = v.CurrentStatus;
  const blocked = SIGN_BLOCK[v.BlockedState] ?? (v.BlockedState && v.BlockedState !== 1 ? `დაბლოკილია (${v.BlockedState})` : null);
  return {
    id: v.ID,
    task_number: v.TaskNumberMasked || (v.TaskNumber != null ? String(v.TaskNumber) : null),
    title: clean(v.FolderName),
    status: { code: st, name: STATUS[st]?.[0] || "Unknown", label: STATUS[st]?.[1] || `სტატუსი ${st}`, comment: clean(v.CurrentStatusComments) },
    pending: SIGN_PENDING.has(st),
    blocked,
    esign: v.eSignStatus && v.eSignStatus !== 1 ? ESIGN[v.eSignStatus] || `ელ. სტატუსი ${v.eSignStatus}` : null,
    from: clean(v.CreatorInfo),
    recipients: clean(v.RecipientsMasked),
    received_at: wcfDate(v.EntryDate),
    deadline: wcfDate(v.Deadline),
    comments: clean(v.Comments),
    task_id: v.TaskID || null,
    folder_id: v.FolderID || null,
  };
}
// ელ. ხელმოსაწერის ჩანაწერის სტრუქტურა უცნობია — ვაბრუნებთ მოკლე ტექსტურ/თარიღის ველებს
function shapeLoose(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (v == null || v === "" || typeof v === "object") continue;
    if (/Facsimil|Base64|Content|Bytes/i.test(k)) continue;
    out[k] = typeof v === "string" && v.startsWith("/Date(") ? wcfDate(v) : typeof v === "string" ? v.slice(0, 200) : v;
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const byEntryDesc = (a, b) => (wcfMs(b.EntryDate) || 0) - (wcfMs(a.EntryDate) || 0);
const dirCode = (d) => (d === "sent" || d === 1 ? 1 : 2);

/**
 * იდოკის კლიენტი.
 * @param {object} cfg
 * @param {string} cfg.login, cfg.password
 * @param {string} [cfg.base]        — ნაგულისხმევად http://edoc.uninet.local
 * @param {boolean} [cfg.vpnAuto]    — იდოკი თუ არ პასუხობს, VPN-ის ავტომატური ჩართვა (Windows, FortiClient)
 * @param {string} [cfg.vpnProfile]  — FortiClient-ის პროფილი
 * @param {function} [cfg.log]
 * @param {string} [cfg.ignoreFile]  — ignore-list-ის JSON ფაილი (იხ. core/ignore.js); არ არის → ignore-list გამორთულია
 */
export function createEdoc(cfg = {}) {
  const BASE = (cfg.base || "http://edoc.uninet.local").replace(/\/+$/, "");
  const SVC = `${BASE}/spaService/Services/DocManagementSPAService.svc/`;
  const HOST = new URL(BASE).hostname;
  const VPN_AUTO = cfg.vpnAuto !== false;
  const VPN_PROFILE = cfg.vpnProfile || "vpn.iliauni.edu.ge";
  const log = cfg.log || ((...a) => console.error("[edoc]", ...a));
  const ign = cfg.ignoreFile ? createIgnoreStore(cfg.ignoreFile) : null;
  const ignMap = (kind) => (ign ? ign.map(kind) : new Map());
  const ignInfo = (e) => (e ? { reason: e.reason || null, added_at: e.added_at || null } : null);

  let session = null;   // { credential, employeeID, positionIDs, fullName } — მხოლოდ მეხსიერებაში
  let vpnTried = false; // ერთ ოპერაციაზე VPN-ს მხოლოდ ერთხელ ვცდით
  let lastOkAt = 0;     // ბოლო წარმატებული მოთხოვნის დრო

  // ---------- HTTP ----------
  async function post(method, body) {
    // ხელმისაწვდომობას ვამოწმებთ მხოლოდ მაშინ, თუ ბოლო წარმატებული მოთხოვნიდან 60 წამზე მეტი გავიდა
    if (VPN_AUTO && !vpnTried && Date.now() - lastOkAt > 60000 && !(await edocReachable(BASE))) {
      vpnTried = true;
      const r = await ensureVpn(HOST, { profile: VPN_PROFILE, base: BASE });
      if (!r.ok && r.stage === "no_vpn_client") throw new EdocError(r.message);
      if (!r.ok) throw new EdocError(`VPN ვერ ჩაირთო: ${r.message}${r.screen ? " — ეკრანზე: " + r.screen : ""}${r.detail ? " — " + r.detail : ""}`);
      log("VPN:", r.message);
    }
    let res;
    try {
      res = await fetch(SVC + method, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      lastOkAt = 0;
      throw new EdocError(`იდოკი (${BASE}) მიუწვდომელია — სავარაუდოდ VPN (vpn.iliauni.edu.ge) არ არის ჩართული. დეტალი: ${e.cause?.code || e.message}`);
    }
    if (!res.ok) throw new EdocError(`${method}: HTTP ${res.status}`);
    lastOkAt = Date.now();
    return res.json();
  }

  // ---------- სესია ----------
  async function login() {
    if (!cfg.login || !cfg.password) throw new EdocError("იდოკის მომხმარებელი/პაროლი არ არის მითითებული.");
    const pre = await post("PreAuthenticateUser", {
      credential: null, login: cfg.login, client: CLIENT, clientVersion: CLIENT_VERSION, osVersion: "Windows 10", language: LANGUAGE,
    });
    if (!pre?.IsSucceeded || !pre.Item) throw new EdocError(`PreAuthenticateUser: ${pre?.ErrorMessage || "უცნობი შეცდომა"}`);
    const key = Buffer.from(pre.Item, "base64").toString("utf8").split(";")[0];

    const auth = await post("AuthenticateUser", {
      credential: null, key, encodedCredentials: Buffer.from(cfg.password, "utf8").toString("base64"),
      client: CLIENT, clientVersion: CLIENT_VERSION, osVersion: "Windows 10", language: LANGUAGE,
    });
    if (!auth?.IsSucceeded || !auth.Item?.Credential) throw new EdocError(`შესვლა ვერ მოხერხდა: ${auth?.ErrorMessage || "არასწორი მონაცემები"}`);
    if (auth.Item.SecondFactor && auth.Item.SecondFactor.ID) throw new EdocError("იდოკი მეორე ფაქტორს (კოდს) ითხოვს — ავტომატური შესვლა ამ შემთხვევაში ვერ ხერხდება.");

    const az = await post("AuthorizeUser", { credential: auth.Item.Credential, factorID: null, factorValue: null });
    if (!az?.IsSucceeded || !az.Credential?.UserSessionID || !az.UserInfo) throw new EdocError(`AuthorizeUser: ${az?.ErrorMessage || "უცნობი შეცდომა"}`);

    const c = { ...az.Credential };
    c.Language = c.Language || LANGUAGE;
    c.Client = c.Client || CLIENT;
    c.ClientVersionID = c.ClientVersionID || CLIENT_VERSION;
    if (!c.EncodedCredential) {
      const raw = [c.UserSessionID, c.UserID, CLIENT, c.ClientVersionID, c.Service, c.ServiceVersionID, c.Language].join("/");
      c.EncodedCredential = Buffer.from(encodeURIComponent(raw), "utf8").toString("base64");
    }
    const u = az.UserInfo;
    const positionIDs = Array.isArray(u.Positions) && u.Positions.length ? u.Positions.map((p) => p.PositionID) : [u.PositionID].filter(Boolean);
    session = { credential: c, employeeID: u.EmployeeID, positionIDs, fullName: u.FullName || [u.LastName, u.FirstName].filter(Boolean).join(" ") };
    log("შესვლა წარმატებულია:", session.fullName);
    return session;
  }

  // სერვისის გამოძახება სესიით; სესიის ვადის გასვლისას — ერთხელ თავიდან შესვლა.
  async function call(method, params, retried = false) {
    if (!session) await login();
    const r = await post(method, { credential: session.credential, ...params });
    if (r && r.IsSucceeded === false) {
      if (!retried) { session = null; return call(method, params, true); }
      throw new EdocError(`${method}: ${r.ErrorMessage || "შეცდომა"} (FaultCode ${r.FaultCode})`);
    }
    return r;
  }
  const me = async () => session || (await login());
  // ყოველი საჯარო ოპერაცია: VPN-ის მცდელობის მთვლელის განულება
  const op = (fn) => async (...a) => { vpnTried = false; return fn(...a); };

  // ---------- დავალებები ----------
  async function taskDetails(raw) {
  const det = { documents: [], task_files: [], history: [] };
  const errs = [];
  const safe = async (label, f) => { try { return await f(); } catch (e) { errs.push(`${label}: ${e.message}`); return null; } };

  const files = await safe("ListTaskFiles", () => call("ListTaskFiles", { taskID: raw.ID }));
  det.task_files = (files?.Items || []).map((f) => ({ id: f.ID, name: clean(f.FileName || f.FullName), comments: clean(f.Comments) }));

  const hist = await safe("ListStatusHistoryForTask", () => call("ListStatusHistoryForTask", { taskID: raw.ID }));
  det.history = (hist?.Items || []).map((h) => ({
    date: wcfDate(h.CreateDate),
    by: clean([h.CreatorLastName, h.CreatorFirstName].filter(Boolean).join(" ")),
    status: { code: h.Status, label: STATUS[h.Status]?.[1] || `სტატუსი ${h.Status}` },
    comments: clean(h.Comments || h.CurrentStatusComments),
  }));

  const rel = await safe("ListRelatedDocumentsForTask", () => call("ListRelatedDocumentsForTask", { taskID: raw.ID }));
  for (const rd of rel?.Items || []) {
    const tn = DOC_TYPES[rd.DocumentType];
    const doc = { id: rd.DocumentID, type: tn ? { code: rd.DocumentType, name: tn[0], label: tn[1] } : { code: rd.DocumentType } };
    if (tn) {
      const info = await safe(`Get${tn[0]}DocumentInfoForUser`, () =>
        call(`Get${tn[0]}DocumentInfoForUser`, { documentID: rd.DocumentID, taskID: raw.ID, responsibleID: raw.ResponsibleID }));
      const d = info?.Item;
      if (d) Object.assign(doc, {
        number: d.MaskedNumber || d.Number || null,
        registration_date: wcfDate(d.RegistrationDate),
        category: clean(d.Category),
        sender_external: clean(d.OuterContactsMasked),
        sender_internal: clean(d.InternalContactsMasked),
        recipients: clean(d.ResponsiblesMasked),
        annotation: clean(d.Annotation),
        comments: clean(d.Comments),
        original_number: clean(d.OriginalNumber),
        original_date: wcfDate(d.OriginalDate),
        page_count: d.PageCount ?? null,
        deadline: wcfDate(d.DeadlineDate),
        needs_answer: d.NeedsAnswer ?? null,
        under_control: d.IsUnderControl ?? null,
      });
    }
    const fl = await safe("ListFilesForDocument", () => call("ListFilesForDocument", { documentID: rd.DocumentID, documentType: rd.DocumentType, fileType: null }));
    doc.files = (fl?.Items || []).map((f) => ({
      id: f.ID, name: clean(f.FileName || f.FullName), kind: clean(f.FileTypeCaption), mime: f.Extension || null, comments: clean(f.Comments),
    }));
    det.documents.push(doc);
  }
  if (errs.length) det.errors = errs;
  return det;
  }

  async function listTasks({ n = 10, direction = "received", onlyNew = false, includeDetails = false } = {}) {
    const s = await me();
    const d = dirCode(direction);
    const r = await call("ListTasksForRegistry", {
      employeeID: s.employeeID, positionIDs: s.positionIDs, direction: d,
      startDateFrom: null, startDateTo: null, filterExtendedText: null, filterID: null,
    });
    let items = (r.Items || []).slice().sort((a, b) => (wcfMs(b.StartDate) || 0) - (wcfMs(a.StartDate) || 0));
    if (onlyNew) items = items.filter((t) => NEW_STATUSES.has(t.CurrentStatus));
    const total = items.length;
    items = items.slice(0, n);
    const tasks = items.map(shapeTask);
    if (includeDetails) {
      const dets = await mapLimit(items, 4, (raw) => taskDetails(raw));
      tasks.forEach((t, i) => (t.details = dets[i]));
    }
    return { user: s.fullName, direction: d === 2 ? "received" : "sent", fetched_at: wcfDate(`/Date(${Date.now()}+0400)/`), total_available: total, returned: tasks.length, tasks };
  }

  // ---------- ვიზირება ----------
  async function visesRaw(direction = "received") {
    const s = await me();
    const r = await call("ListViseAuthorsForUser", {
      employeeID: s.employeeID, positionIDs: s.positionIDs, direction: dirCode(direction),
      entryDateFrom: null, entryDateTo: null, filterExtendedText: null, filterID: null,
    });
    return (r.Items || []).slice().sort(byEntryDesc);
  }
  // ignore-list: მიღებულებიდან ignore-list-ში მყოფებს ვმალავთ (includeIgnored=true — ვაჩვენებთ ნიშნით `ignored`).
  function applyIgnore(items, kind, direction, includeIgnored) {
    if (dirCode(direction) !== 2) return { items, hidden: 0 };
    const m = ignMap(kind);
    if (!m.size) return { items, hidden: 0 };
    if (includeIgnored) return { items, hidden: 0, mark: (shaped) => (m.has(shaped.id) ? { ...shaped, ignored: ignInfo(m.get(shaped.id)) } : shaped) };
    const kept = items.filter((v) => !m.has(v.ID));
    return { items: kept, hidden: items.length - kept.length };
  }

  async function listVises({ n = 15, onlyPending = false, direction = "received", includeIgnored = false } = {}) {
    let items = await visesRaw(direction);
    if (onlyPending) items = items.filter((v) => VISE_PENDING.has(v.CurrentStatus));
    const g = applyIgnore(items, "vise", direction, includeIgnored);
    const out = { user: session?.fullName, total_available: g.items.length, vises: g.items.slice(0, n).map(shapeVise).map(g.mark || ((x) => x)) };
    if (g.hidden) out.ignored_hidden = g.hidden;
    return out;
  }

  // ---------- ხელმოწერა ----------
  async function signsRaw(direction = "received") {
    const s = await me();
    const r = await call("ListSignatoriesForUser", {
      employeeID: s.employeeID, positionIDs: s.positionIDs, direction: dirCode(direction),
      entryDateFrom: null, entryDateTo: null, filterExtendedText: null, filterID: null,
    });
    return (r.Items || []).slice().sort(byEntryDesc);
  }
  async function listSigns({ n = 15, onlyPending = false, direction = "received", includeEsign = false, includeIgnored = false } = {}) {
    let items = await signsRaw(direction);
    if (onlyPending) items = items.filter((v) => SIGN_PENDING.has(v.CurrentStatus));
    const g = applyIgnore(items, "sign", direction, includeIgnored);
    const out = { user: session?.fullName, total_available: g.items.length, signs: g.items.slice(0, n).map(shapeSign).map(g.mark || ((x) => x)) };
    if (g.hidden) out.ignored_hidden = g.hidden;
    if (includeEsign) {
      try {
        const s = await me();
        const r = await call("ListDocumentsForESign", { filterID: null, employeeID: s.employeeID, positionIDs: s.positionIDs, dateFrom: null, dateTo: null, filter: null });
        const e = r.Items || [];
        out.esign_total = e.length; out.esign = e.slice(0, n).map(shapeLoose);
      } catch (err) { out.esign_error = err.message; }
    }
    return out;
  }

  // ---------- შეუქცევადი მოქმედებები: საერთო წესები ----------
  // 1) ზუსტად ერთი დამთხვევა მოლოდინში მყოფებს შორის; 2) დამატებითი შემოწმება (blocked/esign);
  // 3) confirm=false → მხოლოდ preview; 4) მოქმედების შემდეგ სიის ხელახლა წაკითხვით გადამოწმება.
  // შედეგი: { ok, ... } ან { ok:false, error, candidates|document }.
  async function guardedAction({ target, comment, confirm, kind }) {
    const K = kind === "vise"
      ? { raw: visesRaw, pending: VISE_PENDING, shape: shapeVise, method: "ChangeViseAuthorStatus", param: "viseAuthor", status: 10,
          done: "დავიზებულია", none: "დასავიზებელი დოკუმენტი ასეთი არ მოიძებნა", previewKey: "will_vise", hint: "დასავიზებლად" }
      : { raw: signsRaw, pending: SIGN_PENDING, shape: shapeSign, method: "ChangeSignatoryStatus", param: "signatory", status: 12,
          done: "ხელმოწერილია", none: "ხელმოსაწერი დოკუმენტი ასეთი არ მოიძებნა", previewKey: "will_sign", hint: "ხელის მოსაწერად" };
    const all = await K.raw("received");
    const ig = ignMap(kind);
    const pendAll = matchItems(all.filter((v) => K.pending.has(v.CurrentStatus)), target);
    const pend = pendAll.filter((v) => !ig.has(v.ID));
    if (pend.length !== 1) {
      const onlyIgnored = !pend.length && pendAll.length > 0;
      const mark = (v) => (ig.has(v.ID) ? { ...K.shape(v), ignored: ignInfo(ig.get(v.ID)) } : K.shape(v));
      return { ok: false,
        error: pend.length ? "რამდენიმე დოკუმენტი ემთხვევა — დააზუსტე (id ან ნომერი)"
          : onlyIgnored ? "ეს დოკუმენტი ignore-list-შია — ჯერ ამოიღე (edoc_ignore action=remove), თუ მართლა გინდა" : K.none,
        candidates: (pend.length ? pend : pendAll.length ? pendAll : matchItems(all, target)).slice(0, 10).map(mark) };
    }
    const v = pend[0];
    const shaped = K.shape(v);
    if (kind === "sign") {
      if (shaped.blocked) return { ok: false, error: `ხელს ვერ მოვაწერ: ${shaped.blocked}`, document: shaped };
      if (v.eSignStatus === 2) return { ok: false, error: "ეს დოკუმენტი ელექტრონულ ხელმოწერას ითხოვს — ხელი იდოკში თავად მოაწერე", document: shaped };
    }
    if (!confirm) return { ok: true, dry_run: true, [K.previewKey]: shaped, comment: comment || null, note: `არაფერი შეცვლილა. ${K.hint} გამოიძახე იგივე confirm=true-ით.` };
    const payload = { ...v, CurrentStatus: K.status };
    if (comment) payload.Comments = comment;
    const r = await call(K.method, { [K.param]: payload });
    const after = (await K.raw("received")).find((x) => x.ID === v.ID);
    const ok = !!after && after.CurrentStatus === K.status;
    return { ok, message: ok ? K.done : `სერვისმა მიიღო, მაგრამ სტატუსი არ შეიცვალა '${K.done}'-ზე — შეამოწმე იდოკში`,
      service_reply: { IsSucceeded: r?.IsSucceeded, ErrorMessage: r?.ErrorMessage || null }, before: shaped, after: after ? K.shape(after) : null };
  }

  // ---------- ignore-list (ლოკალური ფაილი; იდოკში არაფერს ცვლის) ----------
  // action: "list" | "add" | "remove"; kind: "vise" | "sign" (list-ისთვის არასავალდებულო).
  // add — target ზუსტად ერთ მიღებულ ჩანაწერს უნდა ემთხვეოდეს (ნებისმიერი სტატუსით); remove — ignore-list-ის ჩანაწერებს შორის.
  async function ignore({ action = "list", kind, target, reason } = {}) {
    if (!ign) return { ok: false, error: "ignore-list გამორთულია (ფაილი არ არის მითითებული)" };
    if (kind && kind !== "vise" && kind !== "sign") return { ok: false, error: "kind უნდა იყოს vise ან sign" };
    if (action === "list") {
      const items = ign.list(kind);
      return { ok: true, file: ign.file, total: items.length, items };
    }
    if (!kind) return { ok: false, error: "მიუთითე kind: vise (დასავიზებელი) ან sign (ხელმოსაწერი)" };
    if (!target || !String(target).trim()) return { ok: false, error: "მიუთითე target: id, დავალების ნომერი ან სათაურის ნაწილი" };
    const k = String(target).trim();
    if (action === "add") {
      const all = await (kind === "vise" ? visesRaw : signsRaw)("received");
      const m = matchItems(all, k);
      const shape = kind === "vise" ? shapeVise : shapeSign;
      if (m.length !== 1) {
        return { ok: false, error: m.length ? "რამდენიმე დოკუმენტი ემთხვევა — დააზუსტე (id ან ნომერი)" : "ასეთი დოკუმენტი მიღებულებში არ მოიძებნა",
          candidates: m.slice(0, 10).map(shape) };
      }
      const s = shape(m[0]);
      const { entry, existed } = ign.add({ kind, id: s.id, task_number: s.task_number, title: s.title, from: s.from,
        received_at: s.received_at, status_at_add: s.status.label, reason: reason ? String(reason).slice(0, 500) : null });
      return { ok: true, message: existed ? "უკვე ignore-list-ში იყო (განახლდა)" : "დაემატა ignore-list-ში — სიებში აღარ გამოჩნდება მოლოდინში მყოფად",
        entry, file: ign.file, note: "იდოკში არაფერი შეცვლილა." };
    }
    if (action === "remove") {
      const ent = ign.list(kind).filter((x) => x.id === k || x.task_number === k ||
        (k.length >= 4 && (x.title || "").toLowerCase().includes(k.toLowerCase())));
      if (ent.length !== 1) {
        return { ok: false, error: ent.length ? "რამდენიმე ჩანაწერი ემთხვევა — დააზუსტე (id)" : "ignore-list-ში ასეთი ჩანაწერი არ არის",
          candidates: (ent.length ? ent : ign.list(kind)).slice(0, 20) };
      }
      const removed = ign.remove(kind, [ent[0].id]);
      return { ok: true, message: "ამოღებულია ignore-list-იდან", removed, file: ign.file };
    }
    return { ok: false, error: "action უნდა იყოს list, add ან remove" };
  }

  // ---------- დიაგნოსტიკა (მხოლოდ კითხულობს) ----------
  async function getText(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(url.includes("wsdl") ? 8000 : TIMEOUT_MS) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }
  async function discover(pattern = "Vise", { types = [], skipJs = false } = {}) {
    if (VPN_AUTO && !(await edocReachable(BASE))) { const v = await ensureVpn(HOST, { profile: VPN_PROFILE, base: BASE }); if (!v.ok) throw new EdocError("VPN: " + v.message); }
  const re = new RegExp(pattern, "i");
  const out = { wsdl_operations: {}, js_snippets: [], errors: [] };
  // 1) WSDL — ოპერაციების სახელები და პარამეტრები
  for (const q of ["?singleWsdl", "?wsdl"]) {
    try {
      const x = await getText(SVC.replace(/\/$/, "") + q);
      for (const m of x.matchAll(/<xs:element name="([A-Za-z0-9_]+)">\s*<xs:complexType>\s*<xs:sequence>([\s\S]*?)<\/xs:sequence>/g)) {
        if (!re.test(m[1]) || /Response$/.test(m[1])) continue;
        out.wsdl_operations[m[1]] = [...m[2].matchAll(/name="([^"]+)"[^>]*type="([^"]+)"/g)].map((a) => `${a[1]}:${a[2].replace(/^.*:/, "")}`);
      }
      if (types.length && !(out.types && Object.values(out.types).some(Boolean))) {
        out.types = {};
        for (const t of types) {
          const ct = x.match(new RegExp(`<xs:complexType name="${t}">([\\s\\S]*?)</xs:complexType>`));
          if (ct) { out.types[t] = { base: (ct[1].match(/base="[^:"]*:?([^"]+)"/) || [])[1] || null,
            fields: [...ct[1].matchAll(/<xs:element[^>]*name="([^"]+)"[^>]*type="([^"]+)"/g)].map((a) => `${a[1]}:${a[2].replace(/^.*:/, "")}`) }; continue; }
          const sp = x.match(new RegExp(`<xs:simpleType name="${t}">([\\s\\S]*?)</xs:simpleType>`));
          if (sp) { out.types[t] = { enum: [...sp[1].matchAll(/<xs:enumeration value="([^"]+)"[\s\S]*?(?:EnumerationValue[^>]*>(-?\d+)<|\/>)/g)].map((a) => a[2] != null ? `${a[1]}=${a[2]}` : a[1]) }; continue; }
          out.types[t] = null;
        }
      }
      if (Object.keys(out.wsdl_operations).length) break;
    } catch (e) { out.errors.push(`wsdl${q}: ${e.message}`); }
  }
  if (skipJs) return out;
  // 2) ვებ-აპლიკაციის JS — ყველა სკრიპტი, მათ შორის ზარმაცად ჩატვირთული (JS-ში ნახსენები .js ფაილები)
  try {
    const html = await getText(`${BASE}/app/index.html`);
    const queue = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => new URL(m[1], `${BASE}/app/`).href);
    const seen = new Set(); out.files = [];
    const g = new RegExp(`.{0,0}(${pattern})`, "gi");
    while (queue.length && seen.size < 80) {
      const u = queue.shift(); if (seen.has(u) || !u.startsWith(BASE)) continue; seen.add(u);
      let js; try { js = await getText(u); } catch (e) { out.errors.push(`${u.replace(BASE, "")}: ${e.message}`); continue; }
      out.files.push(`${u.replace(BASE, "")} ${js.length}`);
      for (const m of js.matchAll(/["']([\w\/.\-]+\.js)(?:\?[^"']*)?["']/g)) {
        for (const base of [u, `${BASE}/app/`, `${BASE}/`]) { try { const v = new URL(m[1], base).href; if (!seen.has(v)) queue.push(v); } catch {} }
      }
      let k = 0;
      for (const m of js.matchAll(g)) {
        if (out.js_snippets.length >= 30 || k++ >= 12) break;
        const a = Math.max(0, m.index - 200), b = Math.min(js.length, m.index + 500);
        out.js_snippets.push({ file: u.replace(BASE, ""), code: js.slice(a, b).replace(/\s+/g, " ") });
      }
    }
  } catch (e) { out.errors.push(`index.html: ${e.message}`); }
  return out;
  }


  return {
    base: BASE,
    get user() { return session?.fullName || null; },
    listTasks: op(listTasks),
    listVises: op(listVises),
    vise: op((a) => guardedAction({ ...a, kind: "vise" })),
    listSigns: op(listSigns),
    sign: op((a) => guardedAction({ ...a, kind: "sign" })),
    ignore: op(ignore),
    ignoreFile: ign?.file || null,
    vpn: op(() => ensureVpn(HOST, { profile: VPN_PROFILE, base: BASE })),
    discover: op(discover),
    wsdlTypes: op(async (types) => { const r = await discover("^$", { types, skipJs: true }); return { types: r.types, errors: r.errors }; }),
    /** დაბალი დონის წვდომა ახალი ფუნქციების საცდელად (სესიით) */
    call: op(call),
  };
}

export { STATUS, DOC_TYPES, wcfDate };
