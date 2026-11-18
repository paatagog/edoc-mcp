// იდოკის „ყალბი“ სერვისი ტესტებისთვის
import http from "node:http";
const D = (ms) => `/Date(${ms}+0400)/`;
const now = Date.UTC(2026, 10, 2, 12);
// მინიმალური zip (stored) — ტესტის .docx-ისთვის
export function makeZip(name, content) {
  const nb = Buffer.from(name), data = Buffer.from(content);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(0, 42);
  const local = Buffer.concat([lh, nb, data]); const central = Buffer.concat([cd, nb]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}
const DOCX = makeZip("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>მოხსენებითი ბარათი</w:t></w:r></w:p><w:p><w:r><w:t>გთხოვთ &amp; განიხილოთ</w:t></w:r></w:p></w:body></w:document>");
export function startMock(port) {
  const state = {
    tasks: [
      { ID: "t1", Number: 50563, NumberMasked: "50563", CurrentStatus: 1, StartDate: D(now), DeadlineDate: D(now + 864e6), CreatorInfo: "ყაველაშვილი ნიკოლოზ", CreatorEmployeeID: "e1", ResponsibleInfo: "გოგიშვილი პაატა", ResponsibleID: "r1", RelatedDocuments: "17500-35" },
      { ID: "t2", Number: 49224, NumberMasked: "49224", TaskText: "ტექსტი", CurrentStatus: 2, StartDate: D(now - 864e5), DeadlineDate: D(now - 1000), CreatorInfo: "გვალია გიორგი", ResponsibleID: "r2", RelatedDocuments: "16960-35" },
    ],
    vises: [
      { ID: "v1", TaskNumber: 100, TaskNumberMasked: "100", FolderName: "პირველი ვიზა", CurrentStatus: 1, EntryDate: D(now), Deadline: D(now + 1e9), CreatorInfo: "ა", TaskID: "tv1", FolderID: "f1" },
      { ID: "v2", TaskNumber: 101, TaskNumberMasked: "101", FolderName: "მეორე ვიზა", CurrentStatus: 2, EntryDate: D(now - 1e6), CreatorInfo: "ბ" },
      { ID: "v3", TaskNumber: 102, TaskNumberMasked: "102", FolderName: "ძველი დავიზებული", CurrentStatus: 10, EntryDate: D(now - 2e6) },
    ],
    signs: [
      { ID: "s1", TaskNumber: 200, TaskNumberMasked: "200", FolderName: "ხელმოსაწერი", CurrentStatus: 2, BlockedState: 1, eSignStatus: 1, EntryDate: D(now) },
      { ID: "s2", TaskNumber: 201, TaskNumberMasked: "201", FolderName: "დაბლოკილი", CurrentStatus: 1, BlockedState: 2, eSignStatus: 1, EntryDate: D(now - 1e6) },
      { ID: "s3", TaskNumber: 202, TaskNumberMasked: "202", FolderName: "ელექტრონული", CurrentStatus: 1, BlockedState: 1, eSignStatus: 2, EntryDate: D(now - 2e6) },
    ],
    calls: [], created: [], uploads: [],
    emps: [
      { EmployeeID: "E", PositionID: "P", OrgStructureID: "O", EmployeeLastName: "გოგიშვილი", EmployeeFirstName: "პაატა", PositionTypeName: "ტექნოლოგიების სკოლის დირექტორი", OrgStructureName: "ფაკულტეტი", EmployeeInfo: "გოგიშვილი პაატა", EmployeeWorkInfo: "გოგიშვილი პაატა - დირექტორი", IsActive: true },
      { EmployeeID: "E", PositionID: "P2", OrgStructureID: "O", EmployeeLastName: "გოგიშვილი", EmployeeFirstName: "პაატა", PositionTypeName: "ხარისხის მენეჯერი", OrgStructureName: "ცენტრი", EmployeeInfo: "გოგიშვილი პაატა", IsActive: true },
      { EmployeeID: "L", PositionID: "LP", OrgStructureID: "O", EmployeeLastName: "ტვილდიანი", EmployeeFirstName: "ლია", PositionTypeName: "ხარისხის მენეჯერი", OrgStructureName: "ფაკულტეტი", EmployeeInfo: "ტვილდიანი ლია", IsActive: true },
      { EmployeeID: "K", PositionID: "KP", OrgStructureID: "A", EmployeeLastName: "დარახველიძე", EmployeeFirstName: "ქეთევან", PositionTypeName: "ადმინისტრაციის ხელმძღვანელი", OrgStructureName: "ადმინისტრაცია", EmployeeInfo: "დარახველიძე ქეთევან", IsActive: true,
        DelegateEmployeeID: "M", DelegatePositionID: "MP", DelegateEmployeeLastName: "მოსეშვილი", DelegateEmployeeFirstName: "თამარ" },
      { EmployeeID: "M", PositionID: "MP", OrgStructureID: "A", EmployeeLastName: "მოსეშვილი", EmployeeFirstName: "თამარ", PositionTypeName: "მოადგილე", OrgStructureName: "ადმინისტრაცია", EmployeeInfo: "მოსეშვილი თამარ", IsActive: true },
      { EmployeeID: "N1", PositionID: "N1P", OrgStructureID: "A", EmployeeLastName: "ბერიძე", EmployeeFirstName: "ნინო", PositionTypeName: "ა", EmployeeInfo: "ბერიძე ნინო", IsActive: true },
      { EmployeeID: "N2", PositionID: "N2P", OrgStructureID: "A", EmployeeLastName: "ბერიძე", EmployeeFirstName: "ნიკა", PositionTypeName: "ბ", EmployeeInfo: "ბერიძე ნიკა", IsActive: true },
    ],
  };
  const ok = (o) => ({ IsSucceeded: true, ...o });
  const h = {
    PreAuthenticateUser: () => ok({ Item: Buffer.from("KEY;rest").toString("base64") }),
    AuthenticateUser: (b) => b.key === "KEY" && Buffer.from(b.encodedCredentials, "base64").toString() === "pw" ? ok({ Item: { Credential: { a: 1 } } }) : { IsSucceeded: false, ErrorMessage: "bad" },
    AuthorizeUser: () => ok({ Credential: { UserSessionID: "S", UserID: "U" }, UserInfo: { EmployeeID: "E", PositionID: "P", LastName: "გოგიშვილი", FirstName: "პაატა", FullName: "გოგიშვილი პაატა" } }),
    ListTasksForRegistry: () => ok({ Items: state.tasks }),
    ListViseAuthorsForUser: () => ok({ Items: state.vises }),
    ListSignatoriesForUser: () => ok({ Items: state.signs }),
    ListDocumentsForESign: () => ok({ Items: [] }),
    ChangeViseAuthorStatus: (b) => { const v = state.vises.find((x) => x.ID === b.viseAuthor.ID); v.CurrentStatus = b.viseAuthor.CurrentStatus; return ok({}); },
    ChangeSignatoryStatus: (b) => { const v = state.signs.find((x) => x.ID === b.signatory.ID); v.CurrentStatus = b.signatory.CurrentStatus; return ok({}); },
    ListTaskFiles: () => ok({ Items: [{ ID: "fa", FileName: "a.pdf" }] }),
    ListStatusHistoryForTask: () => ok({ Items: [{ CreateDate: D(now), CreatorLastName: "X", Status: 2 }] }),
    ListRelatedDocumentsForTask: () => ok({ Items: [{ DocumentID: "d1", DocumentType: 3 }] }),
    GetInternalDocumentForCard: () => ok({ Item: { MaskedNumber: "35/2" } }),
    GetInternalDocumentInfoForUser: () => ok({ Item: { MaskedNumber: "35/1", Annotation: "ანოტაცია" } }),
    ListEmployeesForUser: (b) => ok({ Items: state.emps.filter((e) => e.EmployeeLastName.startsWith(b.prefix)) }),
    saveTask: (b) => { state.created.push({ task: b }); return ok({ ResultTask: { ID: "NT", RootID: "NT", Number: 60001 } }); },
    CreateTaskWorkingFolder: (b) => { state.created.push({ folder: b }); return ok({ ID: "NF" }); },
    saveViseAuthorChanges: (b) => { state.created.push({ vises: b.viseAuthors }); return ok({ Items: b.viseAuthors.map((v) => ({ ...v, ID: "V" + v.AuthorEmployeeID, SaveResult: 1 })) }); },
    CheckTaskWorkingFolderIsEditable: () => ok({ Item: true }),
    CreateTaskWorkingFolderInternalContact: (b) => { state.created.push({ contact: b.taskWorkingFolderInternalContact }); return ok({ ID: "C" + state.created.length }); },
    SaveTaskSignatoryChanges: (b) => { state.created.push({ signers: b.signatures }); const g = b.signatures[0];
      state.signs.unshift({ ID: "ns", TaskID: b.taskID, FolderID: g.FolderID, TaskNumber: 60001, TaskNumberMasked: "60001", FolderName: "ახალი", CurrentStatus: 1, BlockedState: 1, eSignStatus: 1, EntryDate: D(now + 5) });
      return ok({ Items: [{ ...g, SaveResult: true }] }); },
    ListFilesForDocument: () => ok({ Items: [{ ID: "df", FileName: "doc.pdf", FileTypeCaption: "დედანი" }] }),
    ListDocumentCommentsForCard: () => ok({ Items: [{ Text: "agil@iliauni.edu.ge", Author: "გურგენიძე ანა", CreateDate: D(now), IsDeleted: false }] }),
    GetTaskForCard: (b) => ok({ Item: b.taskID === "REG" ? { ID: "REG", Number: 49224, NumberMasked: "49224", Creator: "საქმის წარმოების სამმართველო", CurrentStatus: 1 }
      : { ID: b.taskID, Number: 53163, NumberMasked: "53163", Creator: "კანცელარია", TaskText: "განცხადება", CurrentStatus: 1 } }),
    ListTaskRelatedDocumentByDocument: (b) => ok({ Items: b.documentID === "d1" ? [{ TaskID: "REG", DocumentID: "d1", DocumentType: 3, RelationType: 2 }, { TaskID: "t1", DocumentID: "d1", DocumentType: 3, RelationType: 1 }] : [] }),
    ListResponsiblesByTaskForCard: (b) => b.taskID === "REG" ? ok({ Items: [{ ResponsibleID: "G0", ResponsibleEmployeeID: "DOB", ResponsibleLastName: "დობორჯგინიძე", ResponsibleFirstName: "ნინო", ResponsiblePosition: "რექტორი", Status: 7, StartDate: D(now), Comments: "შესრულდა 1-03 დოკუმენტით",
      ChildResponsibles: [{ ResponsibleID: "G1", ResponsibleEmployeeID: "DAL", ResponsibleLastName: "ცქიტიშვილი", ResponsibleFirstName: "დალი", ResponsiblePosition: "სამსახურის უფროსი", Status: 7, StartDate: D(now + 1000), CreatorEmployeeID: "DOB", TaskText: "გთხოვთ, მისცეთ მსვლელობა",
        ChildResponsibles: [{ ResponsibleID: "G2", ResponsibleEmployeeID: "EBR", ResponsibleLastName: "ებრალიძე", ResponsibleFirstName: "თამარ", Status: 7, StartDate: D(now + 2000), CreatorEmployeeID: "DAL", TaskText: "მოამზადეთ ბრძანება" }] }] }] }) : ok({ Items: [{ ResponsibleID: "R0", ResponsibleEmployeeID: "DOB", ResponsibleLastName: "დობორჯგინიძე", ResponsibleFirstName: "ნინო", ResponsiblePosition: "რექტორი", Status: 3, StartDate: D(now),
      ChildResponsibles: [
        { ResponsibleID: "R1", ResponsibleEmployeeID: "KAV", ResponsibleLastName: "ყაველაშვილი", ResponsibleFirstName: "ნიკოლოზ", Status: 3, StartDate: D(now + 1000), TaskText: "გთხოვთ, განიხილოთ", CreatorEmployeeID: "DOB",
          ChildResponsibles: [{ ResponsibleID: "R2", ResponsibleEmployeeID: "E", ResponsibleLastName: "გოგიშვილი", ResponsibleFirstName: "პაატა", Status: 2, StartDate: D(now + 2000), CreatorEmployeeID: "KAV" }] }] }] }),
    ListStatusHistoryForResponsible: (b) => ok({ Items: b.responsibleID === "R1" ? [{ Status: 3, CreatorLastName: "ყაველაშვილი", CreatorFirstName: "ნიკოლოზ", CreateDate: D(now + 3000), Comments: "გადაწერა" }, { Status: 1, CreatorLastName: "დობორჯგინიძე", CreateDate: D(now + 1000) }] : [] }),
    ListFoldersForCard: () => ok({ Items: [{ ID: "F1", FolderName: "პასუხი", Status: 15, StatusComment: "გატარებულია N1-35", Files: [{ ID: "W1", DocumentName: "memo.docx", TaskWorkingDocumentType: 1, FileSizeString: "1 კბ." }] }] }),
    ListViseAuthorsForCard: () => ok({ Items: [{ ID: "F1", FolderName: "პასუხი", ViseAuthors: [{ ID: "VA1", AuthorLastName: "გოგიშვილი", AuthorFirstName: "პაატა", CurrentStatus: 10, StatusChangedDate: D(now + 5000), EntryDate: D(now), CreatorEmployeeID: "KAV", Comments: "თანახმა ვარ" }] }] }),
    ListTaskViseAuthorsStatusVersions: () => ok({ Items: [{ CurrentStatus: 10, StatusChangedDate: D(now + 5000), CreatorName: "გოგიშვილი პაატა" }, { CurrentStatus: 1, StatusChangedDate: D(now), CreatorName: "ლორთქიფანიძე გვანცა" }] }),
    ListSignaturesForCard: () => ok({ Items: [{ ID: "F1", FolderName: "პასუხი", Signatories: [{ ID: "SG1", SignatoryLastName: "ლორთქიფანიძე", SignatoryFirstName: "გვანცა", CurrentStatus: 12, BlockedState: 1, eSignStatus: 1, EntryDate: D(now) }] }] }),
    ListTaskSignatoryStatusHistory: () => ok({ Items: [] }),
    GetDocumentFile: (b) => (b.id === "df" ? ok({ Item: { Content: [...Buffer.from("%PDF-1.7 test")], DocumentFileName: "doc.pdf", Extension: "application/pdf" } }) : { IsSucceeded: false, ErrorMessage: "not found" }),
    GetTaskWorkingDocument: (b) => (b.id === "W1" ? ok({ Item: { DocumentFile: DOCX.toString("base64"), DocumentName: "memo.docx", DocumentContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } }) : { IsSucceeded: false, ErrorMessage: "not found" }),
    GetTaskFile: (b) => (b.id === "fa" ? ok({ Item: { Content: [...Buffer.from("A")], FileName: "a.pdf" } }) : { IsSucceeded: false, ErrorMessage: "not found" }),
  };
  const srv = http.createServer((req, res) => {
    if (req.method === "GET") { res.end(req.url.includes("singleWsdl") ? '<xs:element name="ListViseAuthorsForUser"><xs:complexType><xs:sequence><xs:element name="credential" type="q:ClientCredential"/></xs:sequence>' : "<html></html>"); return; }
    if (req.url.includes("TaskWorkingFilesUploadHandler")) {
      const ch = []; req.on("data", (d) => ch.push(d)); req.on("end", () => {
        const b = Buffer.concat(ch).toString("latin1"); state.calls.push("Upload");
        const f = (n) => (b.match(new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1];
        state.uploads.push({ type: f("TaskWorkingDocumentType"), task: f("TaskID"), folder: f("FolderID"), session: f("UserSessionID") });
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ SaveResult: true, ID: "F" + state.uploads.length }));
      }); return;
    }
    let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
      const m = req.url.split("/").pop(); state.calls.push(m);
      const f = h[m]; res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(f ? f(JSON.parse(body)) : { IsSucceeded: false, ErrorMessage: "no " + m }));
    });
  }).listen(port);
  return { srv, state };
}
