# იდოკის MCP — დეველოპერის გზამკვლევი

> **Claude-ს:** ამ სერვერის ნებისმიერ ცვლილებამდე ჯერ ეს ფაილი წაიკითხე. ცვლილების შემდეგ განაახლე „ისტორია“ და, საჭიროებისას, დანარჩენი ნაწილები.

## რა არის
Claude Desktop-ის გაფართოება „იდოკი (eDocument)“: Ilia State University-ის eDocument სისტემასთან (`http://edoc.uninet.local`) მუშაობა ბრაუზერის გარეშე — დავალებები, ვიზირება, ხელმოწერა — და FortiClient VPN-ის ავტომატური ჩართვა. მფლობელი: პაატა გოგიშვილი.

## არქიტექტურა (ორი ნაწილი)
1. **ჩამტვირთავი** (`.loader/server/index.js`, ინსტალირდება `.mcpb`-ით, იცვლება იშვიათად — მხოლოდ ხელახლა ინსტალაციით).
   - კოდის საქაღალდის არჩევა: (1) პარამეტრი `code_dir`, თუ ცარიელი ან ძველი `Documents\edoc-mcp` არ არის; (2) ავტომატურად `<ნებისმიერი დისკი>:\My Drive\AI-transform\edoc-mcp` (macOS: `~/Library/CloudStorage/GoogleDrive-*/My Drive/...`); (3) `Documents\edoc-mcp` — ცარიელს ავსებს `seed`-ით, ძველ ვერსიას ცვლის უფრო ახალი `seed`-ით (სარეზერვო: `edoc-mcp.backup-<ver>-<date>`).
   - ყოველ გამოძახებაზე ითვლის საქაღალდის `.js/.json` ფაილების ანაბეჭდს (სახელი+ზომა+mtime; წერტილით დაწყებული საქაღალდეები და `node_modules` გამოტოვებულია). შეცვლისას აკოპირებს `%TEMP%\edoc-mcp-snapshots\<stamp>\`-ში და იქიდან `import()`-ავს (Node-ის მოდულების ქეშის გამო).
   - ჩატვირთვის შეცდომისას — წინა ვერსია რჩება, შეცდომა ემატება პასუხს (`load_error`).
   - ხელსაწყოების სინქრონიზაცია: ახალი → `registerTool`, შეცვლილი → `handle.update()` (პარამეტრებიც), წაშლილი → `remove()`. კლიენტს ეგზავნება `tools/list_changed`. **Claude Desktop ახალ ხელსაწყოს ხშირად მხოლოდ თავიდან გახსნის შემდეგ ხედავს.**
   - საკუთარი ხელსაწყო: `edoc_reload` (ვერსია, საქაღალდე, ხელსაწყოები, load_error, seed_update).
   - პარამეტრები (manifest `user_config` → გარემოს ცვლადები): `EDOC_LOGIN`, `EDOC_PASSWORD` (sensitive), `EDOC_BASE_URL`, `VPN_PROFILE`, `VPN_AUTO`, `EDOC_CODE_DIR`.
2. **კოდი** — ეს საქაღალდე (`I:\My Drive\AI-transform\edoc-mcp` პაატას კომპიუტერებზე; Google Drive-ით სინქრონიზდება). **ფენებად (3.0.0-დან):**
   ```
   tools.js (MCP ადაპტერი)   cli.js (ბრძანების ხაზი)   [მომავალში: HTTP/REST ადაპტერი]
                 \                 |                  /
                  core/edoc.js — იდოკის კლიენტი: შესვლა, სიები, დავიზება/ხელმოწერა, უსაფრთხოების წესები, დიაგნოსტიკა
                  core/vpn.js  — VPN (LAN/VPN-ის შემოწმება, FortiClient)
                  core/ignore.js — ignore-list (ლოკალური JSON ფაილი)
   ```
   - `core/edoc.js` — `createEdoc({ base, login, password, vpnAuto, vpnProfile, log })` → `{ listTasks, listVises, vise, listSigns, sign, ignore, createTask, ignoreFile, vpn, discover, wsdlTypes, call, user }` (`cfg.ignoreFile` — ignore-list-ის ფაილი). MCP/AI-ის შესახებ არაფერი იცის. **შეუქცევადი მოქმედებების წესები აქაა** (`guardedAction`), ამიტომ ყველა ადაპტერი მათ იღებს. ლოგიკური უარი ბრუნდება როგორც `{ ok:false, error, candidates|document }`, ინფრასტრუქტურული — `EdocError`.
   - `tools.js` — მხოლოდ „თარგმანი“: `export const VERSION`, `export default function defineTools({ z })` → `[{ name, config, handler }]`; პარამეტრები გარემოს ცვლადებიდან. `z` (zod) ჩამტვირთავი აწვდის — **npm პაკეტებს ვერ შემოიტან** (მხოლოდ Node-ის ჩაშენებული მოდულები).
   - `cli.js` — `node cli.js tasks|vises|signs|vise|sign|vpn|discover …` (EDOC_LOGIN/EDOC_PASSWORD გარემოდან; vise/sign `--confirm`-ით კლავიატურიდან „კი“-ს ითხოვს, `--yes` — ავტომატიზაციისთვის). n8n-ის, Telegram-ის ბოტის, სკრიპტებისთვის.
   - `vpn.js` (root) — მხოლოდ თავსებადობის შიმი (`export * from "./core/vpn.js"`), შეიძლება წაიშალოს.
   - `.tests/` — `mock.mjs` (ყალბი იდოკი) და `test.mjs`: `node .tests/test.mjs`. **ყოველი ცვლილების შემდეგ გაუშვი.**
   - `DEVELOPMENT.md` (ეს), `README.txt` (მოკლე).

## იდოკის სერვისი
- ყველაფერი: `POST {BASE}/spaService/Services/DocManagementSPAService.svc/<Method>`, JSON. WCF თარიღები `"/Date(ms+0400)/"` (`wcfDate()` გარდაქმნის).
- შესვლა: `PreAuthenticateUser`(login) → `Item` base64 → `key` = პირველი ნაწილი `;`-მდე → `AuthenticateUser`(key, base64 პაროლი) → `AuthorizeUser`(credential) → `Credential` + `UserInfo` (EmployeeID, Positions). Client=4, ClientVersion "5.11.0.0", Language=1. მეორე ფაქტორი — არ არის მხარდაჭერილი (შეცდომა).
- სესია მხოლოდ მეხსიერებაში; `IsSucceeded=false` → ერთხელ თავიდან შესვლა.
- მეთოდების/ტიპების საძიებლად: `edoc_discover` (WSDL `?singleWsdl`, ოპერაციები regex-ით) და `edoc_wsdl_types` (ტიპის ველები / enum). ვებ-აპლიკაციის JS-ში მეთოდების სახელები არ ჩანს (main.js ზარმაცად ტვირთავს) — WSDL საკმარისია.
- გამოყენებული მეთოდები:
  | მიზანი | მეთოდი | შენიშვნა |
  |---|---|---|
  | დავალებები | `ListTasksForRegistry`(employeeID, positionIDs, direction 1/2, …) | + `ListTaskFiles`, `ListStatusHistoryForTask`, `ListRelatedDocumentsForTask`, `Get{Incoming,Outgoing,Internal,Order}DocumentInfoForUser`, `ListFilesForDocument` |
  | ვიზირების სია | `ListViseAuthorsForUser`(…, direction: TaskViseDirection 1=Sent,2=Received) | ტიპი `TaskViseAuthorInfo` |
  | დავიზება | `ChangeViseAuthorStatus`({…item, CurrentStatus: 10}) | **გამოცდილია** 2026-11-02 (N 49224) |
  | ხელმოწერის სია | `ListSignatoriesForUser` | ტიპი `TaskSignatoryInfo`; `BlockedState` 1=არა, 2/3=ვიზებს ელოდება; `eSignStatus` 1=Draft, 2=SendToSignature, 3=Signed |
  | ხელმოწერა | `ChangeSignatoryStatus`({…item, CurrentStatus: 12}) | **გამოცდილია** მრავალჯერ (მაგ. 2026-11-04, N 51106) |
  | ელ. ხელმოსაწერი | `ListDocumentsForESign` | მხოლოდ სია; ხელმოწერა — პაატა თავად (სერტიფიკატი/PIN) |
  | ახალი დავალება (`createTask`, ხელსაწყო `edoc_create_task`, 3.2.0) | `ListEmployeesForUser`(prefix…) → `saveTask`(task, responsibles=[თავად]) → `CreateTaskWorkingFolder`(DocumentType 3, TemplateID `e8b991b5-…`, RelationType 3) → ფაილები `POST /spaService/Pages/TaskWorkingFiles/TaskWorkingFilesUploadHandler.ashx` (multipart: DocumentFile, UserSessionID, ClientVersionID, ServiceVersionID, UserID, TaskID, FolderID, TaskWorkingDocumentType 1=ძირითადი/2=დანართი, DocumentText "", DocumentName, Comment, IsImportedFromDRS) → `CheckTaskWorkingFolderIsEditable` → `CreateTaskWorkingFolderInternalContact` (ადრესატი) → `SaveTaskSignatoryChanges`(taskID, signatures, AutoSignMode 1=მექანიკური) | ჩაწერილია ვებ-აპლიკაციის ქსელიდან 2026-11-12 (52346 — ბოლომდე, 52355 — ხელმომწერამდე). `saveTask` უკვე ქმნის დავალებას ნომრით (ვებში ეს ხდება ოსტატის 1-ლ „წინ“-ზე). `SaveTaskSignatoryChanges`-ის შემდეგ დოკუმენტი ხელმომწერის „ხელმოსაწერებშია“; ადრესატთან მიდის **ხელმოწერის** შემდეგ (52346: ხელმოწერა → „შესრულდა 18197-35 დოკუმენტით“). ვიზირება (`saveViseAuthorChanges`(taskID, viseAuthors) + `continueViseAuthorProcesses`) — ჯერ არ არის. ვებ-აპლიკაციის წყარო გაუმინიფიცირებელია `app/js-bundle3?5.11.0.0`-ში (≈9.6 MB) — ველების საძიებლად იქ ეძებე. **MCP-ით რეალურად ჯერ არ გამოცდილა.** |
  | შესაძლო შემდეგი ნაბიჯი | `ContinueViseAuthorProcess(folderID)`, `ContinueSignatoriesProcess(folderID)` | ჯერ არ გამოიყენება; თუ დოკუმენტი შემდეგ ეტაპზე არ გადადის — აქ ვეძებოთ |
- სტატუსები (`TaskStatusTypes`) — `STATUS` ცხრილი `tools.js`-ში (1 ახალი, 2 ნანახი, 9 ვიზირებაზე, 10 დავიზებული, 12 ხელმოწერილი, 13 ხელმოსაწერად…).

## უსაფრთხოების წესები (არ დაარღვიო)
- შეუქცევადი ხელსაწყოები (`edoc_vise`, `edoc_sign`): `confirm=false` → მხოლოდ preview; ზუსტად ერთი დამთხვევა; შემდეგ სიის ხელახლა წაკითხვით გადამოწმება; `annotations.readOnlyHint=false, destructiveHint=true`. Claude ამას იძახებს მხოლოდ პაატას მიერ ამ კონკრეტული დოკუმენტის პირდაპირი დადასტურების შემდეგ.
- წამკითხველ ხელსაწყოებს — `readOnlyHint: true` (Claude Desktop ამით ყოფს უფლებებს).
- პაროლი არასოდეს იწერება ფაილში/ლოგში; `vpn.js`-ის `cleanEnv()` ქვეპროცესებს არ გადასცემს `EDOC_*` ცვლადებს.
- იდოკთან კავშირი `http://`-ია (იდოკის მოწყობა) — მხოლოდ VPN/LAN იცავს.

## ignore-list (`core/ignore.js`, ხელსაწყო `edoc_ignore`, 3.1.0-დან)
- რატომ: კანცელარია ზოგჯერ დოკუმენტს პაატას ვიზის/ხელმოწერის გარეშე ატარებს — ჩანაწერი იდოკში სამუდამოდ „მოლოდინში“ რჩება, მაგრამ ვეღარც დავიზდება/ხელმოიწერება და ვეღარც წაიშლება.
- `edoc_ignore` action=`list|add|remove`, kind=`vise|sign`, target (id / დავალების ნომერი / სათაურის ნაწილი), reason. `add` — ზუსტად ერთი დამთხვევა **მიღებულ** ჩანაწერებს შორის (ნებისმიერი სტატუსით); `remove` — ignore-list-ის ჩანაწერებს შორის; `list` — ქსელის გარეშე მუშაობს. იდოკში არაფერს ცვლის → `destructiveHint:false`.
- გასაღები — ჩანაწერის `ID` (ViseAuthor/Signatory-ს ID). ინახება აგრეთვე task_number, title, from, received_at, status_at_add, reason, added_at.
- მოქმედება: `edoc_list_vises`/`edoc_list_signs` (მიღებულები) მალავს მათ და აბრუნებს `ignored_hidden`-ს; `include_ignored=true` — აჩვენებს ნიშნით `ignored`. `edoc_vise`/`edoc_sign` ignore-list-ში მყოფზე უარს ამბობს (ჯერ `remove`). გაცემულებზე (`sent`) არ მოქმედებს.
- ფაილი (`defaultIgnoreFile()`): `EDOC_IGNORE_FILE` → Drive-ის კოდის საქაღალდე `…\AI-transform\edoc-mcp\.data\ignore.json` (სინქრონიზდება კომპიუტერებს შორის; წერტილიანი საქაღალდე ჩამტვირთავის ანაბეჭდში არ შედის) → `%LOCALAPPDATA%\edoc-mcp\ignore.json`. ყოველ გამოძახებაზე ფაილიდან იკითხება; ჩაწერა ატომურია (tmp + rename). ხელითაც შეიძლება რედაქტირება.
- CLI: `node cli.js ignore [list|add|remove] [vise|sign] <target> [--reason "..."]`; `vises`/`signs` `--ignored`.

## VPN (`vpn.js`)
- `edocReachable(base)`: DNS + `GET /app/index.html` (3 წმ). თუ პასუხობს — VPN არ სჭირდება (უნივერსიტეტის LAN ან უკვე ჩართული VPN). `tools.js` ამოწმებს მაქსიმუმ 60 წამში ერთხელ (`lastOkAt`).
- `connectVpn`: PowerShell სკრიპტი (`PS_SCRIPT`) იწერება დროებით `.ps1`-ად (UTF-8 BOM) და ეშვება `-File`-ით — **`-EncodedCommand` არ გამოიყენო** (Windows-ის 32K ზღვარი → `spawn ENAMETOOLONG`).
- FortiClient GUI = Electron. Connect ღილაკს ვპოულობთ MSAA-ით, შემდეგ UI Automation-ით; თუ მხოლოდ „Chrome Legacy Window“ ჩანს — FortiClient.exe თავიდან `--force-renderer-accessibility`-ით.
- კომპიუტერებს შორის განსხვავება: სამსახურის (`amigo2026`) — `FortiClientConsole.exe`-ს Windows-ის Program Compatibility Assistant ბლოკავს, მუშაობს `FortiClient.exe` პირდაპირ; სახლის (`sairme`) — `FortiClient.exe` პირდაპირ ვარდება („Cannot read properties of null (reading 'TraceLog')“), მუშაობს `FortiClientConsole.exe`. ამიტომ:
  - გამარჯვებული გზა ინახება ლოკალურად: `%LOCALAPPDATA%\edoc-mcp\vpn-state.json` და შემდეგ ჯერზე პირველი ეშვება;
  - FortiClient-ის შეცდომის დიალოგი (`#32770`) იხურება, ჩავარდნილი პროცესი ჩერდება და მაშინვე შემდეგი გზა იცდება.
- პასუხის ველები: `used`, `skipped`, `remembered`, `computer`; `stage: "no_vpn_client"` — FortiClient არ არის / არა-Windows.

## ინსტალაცია / ხელახლა დაყენება
- Drive-იან კომპიუტერებზე (`amigo2026`, `sairme`) `.mcpb`-ის ხელახლა დაყენება **არ სჭირდება** — კოდი Drive-იდან იტვირთება. ხელახლა დაყენება მხოლოდ ჩამტვირთავის (`LOADER_VERSION`) შეცვლისას.
- ახალი `.mcpb`: Claude Desktop-ში გამოიყენე გაფართოების **განახლება (update)** — პარამეტრები (login, პაროლი) რჩება. წაშლა + ხელახლა ინსტალაცია პარამეტრებს **ხელახლა ითხოვს** (ორივე გადამოწმდა 2026-11-04).

## სხვა AI კლიენტზე მიერთება
- სერვერი ჩვეულებრივი stdio MCP-ია: გაშალე `.mcpb` (zip) მუდმივ საქაღალდეში; კლიენტის MCP კონფიგურაციაში `command: "node"`, `args: ["<საქაღალდე>\\server\\index.js"]`, `env` — ქვემოთ. საჭიროა Node.js ≥ 20. ვებ-კლიენტები (ბრაუზერში) ვერ მიუერთდება — იდოკი მხოლოდ VPN/LAN-იდანაა.
- პარამეტრების ფორმა (Settings-ის ფანჯარა) Claude Desktop-ისაა — manifest-ის `user_config`-დან; სხვა კლიენტებში ჩვეულებრივ არ არის → პარამეტრები კლიენტის კონფიგურაციაში ხელით (VS Code-ში პაროლი — `inputs`-ით, დაცულად). Claude Desktop ინახავს: `%APPDATA%\Claude\Claude Extensions Settings\<id>.json`, პაროლს — დაშიფრულად (გადასამოწმებელი; ხელით არ შეცვალო).
- გარემოს ცვლადები: `EDOC_LOGIN`, `EDOC_PASSWORD` (აუცილებელი); `EDOC_BASE_URL` (http://edoc.uninet.local), `VPN_AUTO` (true), `VPN_PROFILE` (vpn.iliauni.edu.ge), `EDOC_CODE_DIR` (ავტომატურად Drive), `EDOC_IGNORE_FILE` (Drive-ის `.data\ignore.json`) — არასავალდებულო.

## როგორ ვცვალოთ
1. იდოკის ლოგიკა → `core/edoc.js`; VPN → `core/vpn.js`; ახალი MCP ხელსაწყო → `tools.js`-ში თხელი ჩანაწერი core-ის ფუნქციაზე (და, საჭიროებისას, `cli.js`-ში ბრძანება). გაზარდე `VERSION` (`tools.js`). `node --check` + `node .tests/test.mjs` (ახალ ფუნქციას — ახალი ტესტი და mock-ში მეთოდი).
2. ატვირთვისას ჯერ `core/`, ბოლოს `tools.js` (თუ `tools.js` ახალ core-ს ადრე ჩავა, ჩამტვირთავი წინა ვერსიას დატოვებს და `load_error`-ს აჩვენებს — საშიში არაა). ჩატიდან ამ საქაღალდეზე წვდომა: `device_request_folder_access` (`I:\My Drive\AI-transform\edoc-mcp`). Google Drive-ის საქაღალდე Claude-ის device shell-ში ხშირად **არ მაუნთდება** — მაშინ: `device_stage_files` → სამუშაო გარემოში რედაქტირება → `device_commit_files` (force) → **`device_list_dir`-ით ზომის შემოწმება** (ერთხელ ძველი ვერსია ჩაიწერა).
3. `edoc_reload` → უნდა ჩანდეს ახალი `code_version`, `load_error: null`.
4. ახალი ხელსაწყო → პაატამ Claude თავიდან გახსნას. მანამდე შემოწმება — დროებით სხვა ხელსაწყოდან (ბოლოს ამოიღე).
5. **კოდის ახალ ვერსიაზეც** (არა მხოლოდ ჩამტვირთავის ცვლილებისას) ააწყე `.dist/edoc-<კოდის ვერსია>.mcpb` — Drive-ის გარეშე კომპიუტერები ახალ კოდს მხოლოდ seed-ით იღებენ. სახელი = seed-ის კოდის ვერსია; manifest-ის `version` = იგივე, `tools` სიაც განაახლე; ჩამტვირთავის ვერსია (`LOADER_VERSION`) — უცვლელი, თუ `.loader/server/index.js` არ შეცვლილა.
6. ჩამტვირთავის ცვლილება: `.loader/`-ში შეცვალე, `seed`-ში ჩადე ახლანდელი `tools.js`/`vpn.js`, აწყე `.mcpb` (იხ. `.loader/BUILD.txt`), ჩადე `.dist/`-ში.

## ისტორია
- 1.4.0 — პირველი ვერსია (სხვა კომპიუტერზე): დავალებები + VPN.
- 1.4.1–1.4.3 — VPN: ცარიელი PID სია → FindWindow შეცდომა; FortiClient.exe-ის უპირატესობა; UIA; `--force-renderer-accessibility`.
- 1.4.4–1.4.5 — `edoc_discover`.
- 2.0.0 — ჩამტვირთავი + კოდი საქაღალდიდან.
- 2.1.0 — `edoc_list_vises`, `edoc_vise`. 2.2.0 — `edoc_list_signs`, `edoc_sign`. 2.2.2 — `EDOC_*` არ გადაეცემა PowerShell-ს.
- 2.3.0 — ჩამტვირთავი: Drive-ის ავტოძებნა, პარამეტრების ცოცხალი განახლება; VPN: გზის დამახსოვრება, შეცდომის დიალოგის დახურვა, `.ps1` ფაილით გაშვება.
- 3.0.0 — ფენებად დაყოფა: `core/edoc.js` (კლიენტი + წესები), `core/vpn.js`, `tools.js` (თხელი MCP ადაპტერი), `cli.js` (ბრძანების ხაზი), `.tests/` (mock + 10 ტესტი). ქცევა იგივეა (გადამოწმდა ძველ ვერსიასთან შედარებით mock-ზე); პასუხებს ემატება `ok` ველი.
- 3.1.0 — ignore-list: `core/ignore.js`, ხელსაწყო `edoc_ignore` (list/add/remove), სიებში დამალვა + `include_ignored`, vise/sign-ის უარი ignore-list-ში მყოფზე; CLI `ignore`; +10 ტესტი (სულ 20). რეალურ იდოკზე გამოცდილია 2026-11-04 (№ 23187-25 დაემატა, სიიდან დაიმალა). `.dist/edoc-3.1.0.mcpb` (ჩამტვირთავი 2.4.0, seed 3.1.0).
- 2.4.0 — `edocReachable` (LAN/VPN-ის რეალური შემოწმება), გასაგები შეტყობინებები; ჩამტვირთავი: `Documents`-ის კოდის განახლება ახალი seed-ით.
- 2026-11-07 (კოდი არ შეცვლილა, 3.1.0) — ცნობილი ხარვეზი ჩამტვირთავში (2.4.0): თუ snapshot-ის შექმნისას Drive-ის ფაილი ჯერ ჩამოტვირთული არ არის (online-only), `%TEMP%\edoc-mcp-snapshots\<stamp>\tools.js` NUL ბაიტებით ივსება → `SyntaxError: Invalid or unexpected token`, `tools: []`. stamp (სახელი+ზომა+mtime) არ იცვლება, ამიტომ ცუდი snapshot მუდმივად რჩება. დროებითი გამოსავალი: ფაილის mtime-ის განახლება (იგივე შიგთავსით ხელახლა ჩაწერა) → `edoc_reload`. მუდმივი გამოსავალი (TODO, ჩამტვირთავის ახალი ვერსია): snapshot-ის ვალიდაცია (ზომის შედარება + NUL-ის შემოწმება) და ხელახლა კოპირება; რეკომენდაცია — Drive-ში საქაღალდე „Available offline“.
- 3.1.1 (2026-11-11) — `edoc_discover`/`edoc_wsdl_types`: WSDL-ის ჩამოტვირთვის ვადა 8 წმ → 90 წმ და პროცესის მეხსიერებაში ქეშირება (VPN-ით WSDL 8 წამში ვერ ჩამოდიოდა → ცარიელი შედეგი „operation was aborted due to timeout“). ტესტები გავიდა (20). `.mcpb` და GitHub — ჯერ არ განახლებულა (გაკეთდეს შემდეგ ვერსიასთან ერთად).
- 3.2.0 (2026-11-12) — `edoc_create_task` (core `createTask`, CLI `create`): ახალი შიდა დავალება/მოხსენებითი — ადრესატ(ებ)ი („გვარი [სახელი] [| თანამდებობა]“, შვებულებაში მყოფი → შემცვლელი), ფაილები კომპიუტერიდან (პირველი/main — Word), ხელმომწერი (ნაგულისხმევად თავად, ძირითადი თანამდებობით; `signer_position`), ვადა 14 დღე. `confirm=false` — მხოლოდ preview; `confirm=true` — ქმნის და აგზავნის ხელმოსაწერად (ხელს არ აწერს). შეცდომისას ნაწილობრივ შექმნილის ID/ნომერს აბრუნებს (`partial`). ვიზიორები — ჯერ არა (უარი). +8 ტესტი (სულ 28). სესიაში ემატება `positionID`, `lastName`, `firstName`. დარჩა სატესტო მონახაზი N 52355 (ხელმომწერის გარეშე).
- 2026-11-11 — დავალების შექმნა/გაგზავნა (TODO — 3.2.0-ში გაკეთდა, იხ. ზემოთ). WSDL-დან ნაპოვნი კანდიდატი მეთოდები: `CreateTaskWithFullInfo`(task:TaskInfo, responsibles:TaskResponsiblePersonInfo[], documents:TaskDocumentRelationInfo[]), `SaveTask`, `CreateTaskFile`(TaskSourceFileInfo: Content base64, FileName, MimeType, TaskID), `CreateTaskWorkingFolder`(taskWorkingFolder:TaskWorkingFoldersInfo — შიგნით `Files` (TaskWorkingDocumentsInfo: DocumentFile base64, DocumentName, TaskWorkingDocumentType Main=1/Attachment=2/Working=3), `Signatories`, `ViseAuthors`, `DocumentType`; getRecipientList; systemClientsForExportIDs), `CreateTaskWorkingDocument[WithResult]`, `CreateTaskWorkingFolderInternalContact` (ადრესატი: EmployeeID, PositionID, OrgStructureID, FolderID), `SaveViseAuthorChanges`(taskID, viseAuthors), `SaveTaskSignatoryChanges`(taskID, signatures). **გამოძახებების რეალური თანმიმდევრობა და სავალდებულო ველები უცნობია** — ვებ-აპლიკაციის JS-ში (requirejs მოდულები) `edoc_discover` ვერ პოულობს. სწორი გზა: ერთი რეალური დავალების შექმნისას Chrome-ში ქსელის მოთხოვნების ჩაწერა (`read_network_requests`) და მათგან ხელსაწყოს აწყობა; ბრმად წარმოების სისტემაზე არ ვცადოთ (ნახევრად შექმნილი ჩანაწერი შეიძლება ვეღარ წაიშალოს).

