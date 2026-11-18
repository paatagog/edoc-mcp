// იდოკი (eDocument) — MCP ადაპტერი. აქ მხოლოდ „თარგმანია“: MCP ხელსაწყო → core/edoc.js-ის ფუნქცია.
// იდოკის ლოგიკა და უსაფრთხოების წესები — core/edoc.js; VPN — core/vpn.js.
// ამ საქაღალდეს კითხულობს ჩამტვირთავი გაფართოება; ცვლილება მოქმედებს შემდეგივე გამოძახებიდან.
import { createEdoc } from "./core/edoc.js";
import { defaultIgnoreFile } from "./core/ignore.js";
import { GUIDE } from "./core/guide.js";

export const VERSION = "3.5.0";

const edoc = createEdoc({
  base: process.env.EDOC_BASE_URL,
  login: process.env.EDOC_LOGIN,
  password: process.env.EDOC_PASSWORD,
  vpnAuto: (process.env.VPN_AUTO || "true") !== "false",
  vpnProfile: process.env.VPN_PROFILE,
  ignoreFile: defaultIgnoreFile(),
});

const text = (o, isError = false) => ({ ...(isError ? { isError: true } : {}), content: [{ type: "text", text: JSON.stringify(o, null, 1) }] });
// core-ის ფუნქცია → MCP პასუხი. ლოგიკური უარი ({ ok:false }) და გამონაკლისი — isError.
const wrap = (fn) => async (args) => {
  try { const r = await fn(args); return text(r, r && r.ok === false); }
  catch (e) { return text({ error: e.message, ...(e.data ? { data: e.data } : {}) }, true); }
};
const RO = { readOnlyHint: true, openWorldHint: true };
const LOCAL_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

export default function defineTools({ z }) {
  const dir = z.enum(["received", "sent"]).default("received").describe("received = მიღებული, sent = გაცემული");
  return [
    {
      name: "edoc_guide",
      config: {
        title: "იდოკი — გზამკვლევი (წაიკითხე პირველად)",
        description: "Returns the guide for AI agents using these eDocument (იდოკი, Ilia State University) tools: who the user is, the key concepts " +
          "(document vs task, assignment/გადაწერა, resolution, visa, signature, how a memo moves), which tool to use when, the exact step-by-step " +
          "procedure for creating and sending a new task/memo, safety rules for irreversible actions, and answer examples. Call it once at the start " +
          "of any eDocument work if you have not read it in this conversation. Works offline; changes nothing.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      handler: async () => ({ content: [{ type: "text", text: GUIDE }] }),
    },
    {
      name: "edoc_list_tasks",
      config: {
        title: "იდოკის დავალებები",
        description:
          "Returns the most recent N tasks (დავალებები) from Ilia State University's eDocument (იდოკი) as JSON, newest first. " +
          "Logs in automatically. Each task: number, text, status (code/name/Georgian label), is_new, is_overdue, received_at, deadline, " +
          "sender, responsible, related document numbers. With include_details=true also returns linked documents (number, category, sender, " +
          "annotation, files) and status history with comments. Connects the university VPN automatically when needed.",
        inputSchema: {
          n: z.number().int().min(1).max(200).default(10).describe("რამდენი ბოლო დავალება დააბრუნოს"),
          direction: dir,
          only_new: z.boolean().default(false).describe("მხოლოდ ახალი (უნახავი) დავალებები"),
          include_details: z.boolean().default(false).describe("დოკუმენტები, ფაილები და ისტორია თითო დავალებაზე (უფრო ნელია)"),
        },
        annotations: RO,
      },
      handler: wrap(({ n, direction, only_new, include_details }) => edoc.listTasks({ n, direction, onlyNew: only_new, includeDetails: include_details })),
    },
    {
      name: "edoc_list_vises",
      config: {
        title: "იდოკი — დასავიზებელი დოკუმენტები",
        description: "Lists eDocument visa requests (ვიზირება) for the user as JSON, newest first: id, task number, title (folder name), status, pending flag, " +
          "sender, recipients, received date, deadline, comments, document. Received items on the user's ignore-list (see edoc_ignore) are hidden; " +
          "ignored_hidden tells how many. Read-only. Connects the university VPN automatically when needed.",
        inputSchema: {
          n: z.number().int().min(1).max(200).default(15),
          only_pending: z.boolean().default(false).describe("მხოლოდ დასავიზებელი (ჯერ დაუვიზებელი)"),
          direction: dir,
          include_ignored: z.boolean().default(false).describe("ignore-list-ში მყოფებიც (ნიშნით ignored)"),
        },
        annotations: RO,
      },
      handler: wrap(({ n, only_pending, direction, include_ignored }) => edoc.listVises({ n, onlyPending: only_pending, direction, includeIgnored: include_ignored })),
    },
    {
      name: "edoc_vise",
      config: {
        title: "იდოკი — დოკუმენტის დავიზება",
        description: "Vises (ავიზებს) ONE eDocument visa request identified by its id, task number or a unique part of its title. " +
          "Without confirm=true it only returns what would be vised (dry run) and changes nothing. With confirm=true it sets the visa status to Vised " +
          "(irreversible) and then re-reads the list to verify. Only call with confirm=true after the user explicitly approved this exact document.",
        inputSchema: {
          target: z.string().min(1).describe("id, დავალების ნომერი ან სათაურის ნაწილი"),
          comment: z.string().optional().describe("ვიზის კომენტარი (არასავალდებულო)"),
          confirm: z.boolean().default(false).describe("true — მართლა დაავიზოს; false — მხოლოდ აჩვენოს"),
        },
        annotations: DESTRUCTIVE,
      },
      handler: wrap(({ target, comment, confirm }) => edoc.vise({ target, comment, confirm })),
    },
    {
      name: "edoc_list_signs",
      config: {
        title: "იდოკი — ხელმოსაწერი დოკუმენტები",
        description: "Lists eDocument signature requests (ხელმოწერა) for the user as JSON, newest first: id, task number, title, status, pending flag, " +
          "blocked (waiting for visas), esign status, sender, recipients, dates. With include_esign=true also lists documents waiting for an electronic " +
          "signature (ელ. ხელმოსაწერი), which cannot be signed by these tools. Received items on the user's ignore-list (see edoc_ignore) are hidden; " +
          "ignored_hidden tells how many. Read-only. Connects the university VPN automatically when needed.",
        inputSchema: {
          n: z.number().int().min(1).max(200).default(15),
          only_pending: z.boolean().default(false).describe("მხოლოდ ხელმოსაწერი (ჯერ ხელმოუწერელი)"),
          direction: dir,
          include_esign: z.boolean().default(false).describe("ელ. ხელმოსაწერი დოკუმენტებიც"),
          include_ignored: z.boolean().default(false).describe("ignore-list-ში მყოფებიც (ნიშნით ignored)"),
        },
        annotations: RO,
      },
      handler: wrap(({ n, only_pending, direction, include_esign, include_ignored }) =>
        edoc.listSigns({ n, onlyPending: only_pending, direction, includeEsign: include_esign, includeIgnored: include_ignored })),
    },
    {
      name: "edoc_ignore",
      config: {
        title: "იდოკი — ignore-list (დასავიზებელი/ხელმოსაწერი)",
        description: "Manages the user's local ignore-list of received visa (kind=vise) and signature (kind=sign) requests that must no longer be treated as " +
          "pending — e.g. the chancellery already processed the document without the user's visa, so it can neither be vised nor deleted in eDocument. " +
          "action=list shows the list (works offline); action=add adds ONE received item identified by id, task number or a unique part of its title; " +
          "action=remove takes one back out. Ignored items are hidden from edoc_list_vises / edoc_list_signs and refused by edoc_vise / edoc_sign. " +
          "Changes only a local file, never eDocument; reversible. Add only items the user named.",
        inputSchema: {
          action: z.enum(["list", "add", "remove"]).default("list"),
          kind: z.enum(["vise", "sign"]).optional().describe("vise = დასავიზებელი, sign = ხელმოსაწერი (add/remove-ისთვის სავალდებულო)"),
          target: z.string().optional().describe("id, დავალების ნომერი ან სათაურის ნაწილი"),
          reason: z.string().optional().describe("მიზეზი, მაგ. „კანცელარიამ ვიზის გარეშე გაატარა“"),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      handler: wrap(({ action, kind, target, reason }) => edoc.ignore({ action, kind, target, reason })),
    },
    {
      name: "edoc_sign",
      config: {
        title: "იდოკი — დოკუმენტზე ხელის მოწერა",
        description: "Signs (ხელს აწერს) ONE eDocument signature request (regular, non-electronic) identified by its id, task number or a unique part of its title. " +
          "Without confirm=true it only returns what would be signed (dry run) and changes nothing. Refuses requests still blocked by pending visas and " +
          "electronic-signature requests (those need the user's certificate/PIN in eDocument). With confirm=true it sets the status to Signed (irreversible) " +
          "and re-reads the list to verify. Only call with confirm=true after the user explicitly approved this exact document.",
        inputSchema: {
          target: z.string().min(1).describe("id, დავალების ნომერი ან სათაურის ნაწილი"),
          comment: z.string().optional().describe("კომენტარი (არასავალდებულო)"),
          confirm: z.boolean().default(false).describe("true — მართლა მოაწეროს ხელი; false — მხოლოდ აჩვენოს"),
        },
        annotations: DESTRUCTIVE,
      },
      handler: wrap(({ target, comment, confirm }) => edoc.sign({ target, comment, confirm })),
    },
    {
      name: "edoc_create_task",
      config: {
        title: "იდოკი — ახალი დავალების (მოხსენებითის) შექმნა",
        description: "Creates a new internal eDocument task (e.g. a memo / მოხსენებითი ბარათი) and sends it for signature: task title, addressee(s), " +
          "files from this computer (first/kind=main must be a Word .doc/.docx; others are attachments), signatory (default: the user, own main position). " +
          "Optional visa authors (vise_authors, same name format): their visa requests are sent immediately on creation and the signature waits for them " +
          "(sign_block). Addressees: \"surname [first name] [| part of position]\"; someone on leave is replaced by their delegate (reported). " +
          "Without confirm=true it only resolves people/files and returns a preview — nothing is created. With confirm=true it creates the task in eDocument " +
          "(cannot be deleted by these tools) and puts it into the signatory's signature list; it reaches the addressee only after signing (edoc_sign). " +
          "Only call with confirm=true after the user explicitly approved this exact preview.",
        inputSchema: {
          title: z.string().min(1).describe("დავალების სათაური (მაგ. „ABET-ის ინვოისის გადახდა“)"),
          addressees: z.array(z.string().min(1)).min(1).describe("ადრესატები: „გვარი [სახელი] [| თანამდებობის ნაწილი]“"),
          files: z.array(z.object({
            path: z.string().min(1).describe("ფაილის სრული გზა ამ კომპიუტერზე"),
            kind: z.enum(["main", "attachment"]).optional().describe("main = ძირითადი (Word), attachment = დანართი; ნაგულისხმევად პირველი main"),
            name: z.string().optional().describe("სახელი იდოკში (ნაგულისხმევად ფაილის სახელი)"),
          })).min(1),
          signer: z.string().optional().describe("ხელმომწერი, თუ თავად მომხმარებელი არ არის: „გვარი სახელი [| თანამდებობა]“"),
          vise_authors: z.array(z.string().min(1)).default([]).describe("ვიზიორები: „გვარი [სახელი] [| თანამდებობა]“ (პარალელურად, ერთ დონეზე)"),
          sign_block: z.enum(["completed", "confirmed", "none"]).default("completed").describe("ვიზიორების არსებობისას ხელმოწერა დაიბლოკოს: completed — ვიზირების დასრულებამდე, confirmed — ვიზების დადასტურებამდე, none — არა"),
          signer_position: z.string().optional().describe("საკუთარი თანამდებობის ნაწილი, თუ რამდენიმე გაქვს (მაგ. „დირექტორი“)"),
          deadline_days: z.number().int().min(1).max(365).default(14),
          comment: z.string().optional().describe("დავალების კომენტარი"),
          confirm: z.boolean().default(false).describe("true — მართლა შექმნას; false — მხოლოდ preview"),
        },
        annotations: DESTRUCTIVE,
      },
      handler: wrap(({ title, addressees, files, vise_authors, sign_block, signer, signer_position, deadline_days, comment, confirm }) =>
        edoc.createTask({ title, addressees, files, viseAuthors: vise_authors, signBlock: sign_block, signer, signerPosition: signer_position, deadlineDays: deadline_days, comment, confirm })),
    },
    {
      name: "edoc_task_card",
      config: {
        title: "იდოკი — დავალების ბარათი (ვინ ვის გადააწერა, ვიზები, კომენტარები)",
        description: "Full card of ONE eDocument task by task number or id (received or sent, also tasks seen only as a visa/signature request). " +
          "Use it to answer 'who assigned what to whom' (ვინ ვის რა დაავალა) and to get file ids. Returns: " +
          "assignments — this task's movement: each line from (who assigned) → to (to whom), text (the resolution/instruction), assigned_at, status, " +
          "comments (how it was closed), depth (0 = first addressee), history; " +
          "document_movement — OTHER tasks linked to this task's registered documents, each with its own assignments. IMPORTANT: for a task the user SENT, " +
          "assignments shows only the user's own line; what the addressees (e.g. the rector) then assigned to others is in document_movement with " +
          "relation='request' (the task the chancellery created on the registered document) — that is the document's full movement; " +
          "vises — visa authors with status/dates/who requested; signatures; folders — working folders (memo drafts) with files; documents — registered " +
          "documents with files (files[].id → edoc_download). Read-only. If unsure how eDocument works, call edoc_guide first.",
        inputSchema: {
          target: z.string().min(1).describe("დავალების ნომერი (მაგ. 53163) ან id"),
          include_history: z.boolean().default(true).describe("თითო ადრესატის/ვიზიორის/ხელმომწერის სტატუსების ისტორია (უფრო ნელია)"),
          include_related: z.boolean().default(true).describe("document_movement — მიბმული დოკუმენტების სხვა დავალებების მოძრაობა"),
        },
        annotations: RO,
      },
      handler: wrap(({ target, include_history, include_related }) => edoc.taskCard({ target, includeHistory: include_history, includeRelated: include_related })),
    },
    {
      name: "edoc_download",
      config: {
        title: "იდოკი — ფაილების გადმოწერა და დათვალიერება",
        description: "Downloads eDocument files to this computer (default folder: Downloads\\edoc\\<task number>) and returns their paths. Either file_ids " +
          "(ids from edoc_task_card or edoc_list_tasks include_details) or task (task number/id → all its files: by default the registered document's files, " +
          "or the working-folder files if the task has no registered document yet; source=all for everything). Text of Word .docx and plain-text files is " +
          "returned inline (text); PDFs and others are only saved — read them from the returned path. Changes nothing in eDocument.",
        inputSchema: {
          file_ids: z.array(z.string().min(1)).default([]).describe("ფაილების id-ები"),
          task: z.string().optional().describe("დავალების ნომერი ან id — მისი ყველა ფაილი"),
          kind: z.enum(["auto", "document", "working", "task"]).default("auto").describe("file_ids-ის წყარო: document = რეგისტრირებული დოკუმენტი, working = სამუშაო საქაღალდე, task = დავალების ფაილი"),
          source: z.enum(["auto", "documents", "working", "all"]).default("auto").describe("task-ისთვის: რომელი ფაილები"),
          only_main: z.boolean().default(false).describe("task-ისთვის: მხოლოდ დედანი/ძირითადი"),
          dir: z.string().optional().describe("შესანახი საქაღალდე (ნაგულისხმევად Downloads\\edoc)"),
          extract_text: z.boolean().default(true).describe("Word-ის (.docx) ტექსტის დაბრუნება პასუხში"),
        },
        annotations: LOCAL_WRITE,
      },
      handler: wrap(({ file_ids, task, kind, source, only_main, dir, extract_text }) =>
        edoc.download({ fileIds: file_ids, task, kind, source, onlyMain: only_main, dir, extract: extract_text })),
    },
    {
      name: "vpn_connect",
      config: {
        title: "ილიაუნის VPN-ის ჩართვა",
        description:
          "Makes sure eDocument is reachable: does nothing on the university network or when the VPN is already up; otherwise connects the " +
          "Ilia State University VPN (FortiClient, vpn.iliauni.edu.ge) on this Windows computer without the mouse, using the launch method remembered for " +
          "this computer. edoc tools also do this automatically.",
        inputSchema: {},
        annotations: { readOnlyHint: false, openWorldHint: true },
      },
      handler: wrap(() => edoc.vpn()),
    },
    {
      name: "edoc_discover",
      config: {
        title: "იდოკის სერვისის მეთოდების ძებნა (დიაგნოსტიკა)",
        description: "Read-only diagnostic: lists eDocument service operations whose names match a regex (from the service WSDL) with their parameters, " +
          "and code snippets from the eDocument web app that call them. Changes nothing.",
        inputSchema: {
          pattern: z.string().default("Vise|Visa").describe("regex, მაგ. Vise|Sign"),
          types: z.array(z.string()).default([]).describe("WSDL ტიპების სახელები, რომელთა ველებიც უნდა ვნახოთ"),
          skip_js: z.boolean().default(false),
        },
        annotations: RO,
      },
      handler: wrap(({ pattern, types, skip_js }) => edoc.discover(pattern, { types, skipJs: skip_js })),
    },
    {
      name: "edoc_wsdl_types",
      config: {
        title: "იდოკის სერვისის ტიპები (დიაგნოსტიკა)",
        description: "Read-only diagnostic: returns the fields (complex types) or enum values (simple types) of the given eDocument service WSDL type names.",
        inputSchema: { types: z.array(z.string()).min(1).describe("ტიპების სახელები, მაგ. TaskViseAuthorInfo") },
        annotations: RO,
      },
      handler: wrap(({ types }) => edoc.wsdlTypes(types)),
    },
  ];
}
