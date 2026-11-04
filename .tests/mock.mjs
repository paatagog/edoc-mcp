// იდოკის „ყალბი“ სერვისი ტესტებისთვის
import http from "node:http";
const D = (ms) => `/Date(${ms}+0400)/`;
const now = Date.UTC(2026, 10, 2, 12);
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
    calls: [],
  };
  const ok = (o) => ({ IsSucceeded: true, ...o });
  const h = {
    PreAuthenticateUser: () => ok({ Item: Buffer.from("KEY;rest").toString("base64") }),
    AuthenticateUser: (b) => b.key === "KEY" && Buffer.from(b.encodedCredentials, "base64").toString() === "pw" ? ok({ Item: { Credential: { a: 1 } } }) : { IsSucceeded: false, ErrorMessage: "bad" },
    AuthorizeUser: () => ok({ Credential: { UserSessionID: "S", UserID: "U" }, UserInfo: { EmployeeID: "E", PositionID: "P", FullName: "გოგიშვილი პაატა" } }),
    ListTasksForRegistry: () => ok({ Items: state.tasks }),
    ListViseAuthorsForUser: () => ok({ Items: state.vises }),
    ListSignatoriesForUser: () => ok({ Items: state.signs }),
    ListDocumentsForESign: () => ok({ Items: [] }),
    ChangeViseAuthorStatus: (b) => { const v = state.vises.find((x) => x.ID === b.viseAuthor.ID); v.CurrentStatus = b.viseAuthor.CurrentStatus; return ok({}); },
    ChangeSignatoryStatus: (b) => { const v = state.signs.find((x) => x.ID === b.signatory.ID); v.CurrentStatus = b.signatory.CurrentStatus; return ok({}); },
    ListTaskFiles: () => ok({ Items: [{ ID: "fa", FileName: "a.pdf" }] }),
    ListStatusHistoryForTask: () => ok({ Items: [{ CreateDate: D(now), CreatorLastName: "X", Status: 2 }] }),
    ListRelatedDocumentsForTask: () => ok({ Items: [{ DocumentID: "d1", DocumentType: 3 }] }),
    GetInternalDocumentInfoForUser: () => ok({ Item: { MaskedNumber: "35/1", Annotation: "ანოტაცია" } }),
    ListFilesForDocument: () => ok({ Items: [{ ID: "df", FileName: "doc.pdf" }] }),
  };
  const srv = http.createServer((req, res) => {
    if (req.method === "GET") { res.end(req.url.includes("singleWsdl") ? '<xs:element name="ListViseAuthorsForUser"><xs:complexType><xs:sequence><xs:element name="credential" type="q:ClientCredential"/></xs:sequence>' : "<html></html>"); return; }
    let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
      const m = req.url.split("/").pop(); state.calls.push(m);
      const f = h[m]; res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(f ? f(JSON.parse(body)) : { IsSucceeded: false, ErrorMessage: "no " + m }));
    });
  }).listen(port);
  return { srv, state };
}
