// FortiClient VPN-ის ჩართვა: Connect ღილაკს ვპოულობთ Chromium-ის MSAA ხეში და ვაჭერთ accDoDefaultAction-ით (მაუსის გარეშე).
// FortiClient-ის ამ ვერსიას ბრძანების ხაზის კლიენტი არ აქვს, ამიტომ GUI-ს ვმართავთ PowerShell-იდან.
import { spawn } from "node:child_process";
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const log = (...a) => console.error("[vpn]", ...a);

// რიგით ვცდით: ჯერ FortiClient.exe (ზოგ Windows-ზე FortiClientConsole.exe-ს Program Compatibility Assistant ბლოკავს),
// შემდეგ FortiClientConsole.exe. რომელიც ფანჯარას გახსნის — ის გამოიყენება.
const FC_EXE_CANDIDATES = [
  process.env.FORTICLIENT_EXE,
  "C:\\Program Files\\Fortinet\\FortiClient\\FortiClient.exe",
  "C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiClient.exe",
  "C:\\Program Files\\Fortinet\\FortiClient\\FortiClientConsole.exe",
  "C:\\Program Files (x86)\\Fortinet\\FortiClient\\FortiClientConsole.exe",
].filter(Boolean);

// edoc-ის სახელი მხოლოდ VPN-ის DNS-ით იხსნება — ეს არის VPN-ის მდგომარეობის საუკეთესო ნიშანი.
export async function hostResolves(host, timeoutMs = 4000) {
  try {
    await Promise.race([
      dns.promises.lookup(host),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  }
}

// იდოკი რეალურად პასუხობს? (სახელის გახსნა + მოკლე HTTP მოთხოვნა). DNS ქეშით „მოტყუებას“ ასე ვერიდებით.
// უნივერსიტეტის ლოკალურ ქსელში ან ჩართული VPN-ით — true; მაშინ FortiClient-ს საერთოდ არ ვეხებით.
export async function edocReachable(base, timeoutMs = 3000) {
  let host;
  try { host = new URL(base).hostname; } catch { return false; }
  if (!(await hostResolves(host))) return false;
  try {
    await fetch(`${base.replace(/\/+$/, "")}/app/index.html`, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
    return true; // ნებისმიერი HTTP პასუხი = სერვერი ხელმისაწვდომია
  } catch {
    return false;
  }
}

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices; using Accessibility;
public static class FC {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, int m, IntPtr w, IntPtr l, int f, int t, out IntPtr r);
  [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr h, uint id, ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  [DllImport("oleacc.dll")] static extern int AccessibleChildren(IAccessible p, int start, int count, [Out] object[] kids, out int got);
  static string Cls(IntPtr h) { var sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
  static string Txt(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
  public static IntPtr FindWindow(int[] pids) {
    IntPtr found = IntPtr.Zero;
    if (pids == null || pids.Length == 0) return found; // FortiClient არ არის გაშვებული
    IntPtr visible = IntPtr.Zero;
    EnumWindows((h, l) => { int pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) >= 0 && Cls(h) == "Chrome_WidgetWin_1" && Txt(h).StartsWith("FortiClient")) {
        if (found == IntPtr.Zero) found = h;
        if (visible == IntPtr.Zero && IsWindowVisible(h)) visible = h;
      }
      return true; }, IntPtr.Zero);
    return visible != IntPtr.Zero ? visible : found; // ხილულ ფანჯარას ვანიჭებთ უპირატესობას
  }
  // FortiClient-ის შეცდომის ფანჯარა (Windows-ის სტანდარტული დიალოგი, კლასი #32770) — გაშვებისას ჩავარდნის ნიშანი
  public static IntPtr ErrorDialog(int[] pids) {
    IntPtr f = IntPtr.Zero;
    if (pids == null || pids.Length == 0) return f;
    EnumWindows((h, l) => { int pid; GetWindowThreadProcessId(h, out pid);
      if (f == IntPtr.Zero && Array.IndexOf(pids, pid) >= 0 && Cls(h) == "#32770" && IsWindowVisible(h)) f = h;
      return true; }, IntPtr.Zero);
    return f;
  }
  public static int PidOf(IntPtr h) { int p; GetWindowThreadProcessId(h, out p); return p; }
  public static IntPtr Renderer(IntPtr top) { IntPtr r = IntPtr.Zero; EnumChildWindows(top, (h, l) => { if (r == IntPtr.Zero && Cls(h) == "Chrome_RenderWidgetHostHWND") r = h; return true; }, IntPtr.Zero); return r; }
  static IAccessible Root(IntPtr h) {
    IntPtr res; SendMessageTimeout(h, 0x003D, IntPtr.Zero, new IntPtr(-4), 2, 1000, out res); // Chromium-ის accessibility-ის ჩართვა
    Guid g = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71"); object o;
    return AccessibleObjectFromWindow(h, 0xFFFFFFFC, ref g, out o) == 0 ? (IAccessible)o : null;
  }
  static IEnumerable<IAccessible> Kids(IAccessible a) { int n = 0; try { n = a.accChildCount; } catch {} if (n <= 0) yield break; var arr = new object[n]; int got; AccessibleChildren(a, 0, n, arr, out got); for (int i = 0; i < got; i++) { var k = arr[i] as IAccessible; if (k != null) yield return k; } }
  static string S(Func<object> f) { try { var v = f(); return v == null ? "" : v.ToString(); } catch { return ""; } }
  static IAccessible Find(IAccessible a, int role, string name, int d) {
    if (d > 45) return null;
    foreach (var k in Kids(a)) {
      if (S(() => k.get_accRole(0)) == role.ToString() && S(() => k.get_accName(0)).Trim() == name) return k;
      var r = Find(k, role, name, d + 1); if (r != null) return r;
    }
    return null;
  }
  // დაბრუნება: "connected" | "clicked" | "notfound"
  public static string State(IntPtr rw) { var r = Root(rw); if (r == null) return "noroot"; if (Find(r, 43, "Disconnect", 0) != null) return "connected"; if (Find(r, 43, "Connect", 0) != null) return "disconnected"; return "notfound"; }
  public static bool PressConnect(IntPtr rw) { var r = Root(rw); if (r == null) return false; var b = Find(r, 43, "Connect", 0); if (b == null) return false; b.accDoDefaultAction(0); return true; }
  public static string Profile(IntPtr rw) { var r = Root(rw); if (r == null) return ""; var c = Find(r, 46, "VPN Name", 0); return c == null ? "" : S(() => c.get_accValue(0)); }
  public static string Texts(IntPtr rw) { var r = Root(rw); var sb = new StringBuilder(); if (r != null) Collect(r, sb, 0); return sb.ToString(); }
  static void Collect(IAccessible a, StringBuilder sb, int d) { if (d > 45 || sb.Length > 1500) return; foreach (var k in Kids(a)) { var n = S(() => k.get_accName(0)); if (S(() => k.get_accRole(0)) == "41" && n.Length > 0) sb.Append(n).Append(" | "); Collect(k, sb, d + 1); } }
}
"@ -ReferencedAssemblies Accessibility
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

# UI Automation — სარეზერვო გზა FortiClient-ის ახალი ვერსიებისთვის, სადაც MSAA ხე ღილაკებს არ აჩვენებს
$AE = [System.Windows.Automation.AutomationElement]
function UiaBtn($name) {
  try {
    $root = $AE::FromHandle($h)
    $c = New-Object System.Windows.Automation.AndCondition(
      (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $name)),
      (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
    return $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
  } catch { return $null }
}
function UiaState { if (UiaBtn 'Disconnect') { 'connected' } elseif (UiaBtn 'Connect') { 'disconnected' } else { 'notfound' } }
function UiaPress {
  $b = UiaBtn 'Connect'; if (-not $b) { return $false }
  try { $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return $true } catch {}
  try { $b.GetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern).DoDefaultAction(); return $true } catch {}
  return $false
}
function UiaProfile {
  try {
    $root = $AE::FromHandle($h)
    $c = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, 'VPN Name')
    $e = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c); if (-not $e) { return '' }
    return $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
  } catch { return '' }
}
function UiaTexts {
  try {
    $all = $AE::FromHandle($h).FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    (@($all | ForEach-Object { $_.Current.Name } | Where-Object { $_ }) | Select-Object -First 40) -join ' | '
  } catch { '' }
}

$exes = @(($env:FC_EXES -split ';') | Where-Object { $_ })
$prof = $env:VPN_PROFILE; $timeout = [int]$env:VPN_TIMEOUT_S; if (-not $timeout) { $timeout = 45 }
function Out($o) { $o | ConvertTo-Json -Compress; exit 0 }
# მძიმე (,) აუცილებელია: ცარიელ მასივს PowerShell სხვაგვარად $null-ად აქცევს და FindWindow ვარდება
function Pids { ,([int[]]@(Get-Process -Name FortiClient -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })) }

# FortiClient.exe-ს ვუშვებთ --force-renderer-accessibility-ით: ახალ ვერსიებში მის გარეშე ფანჯრის ღილაკები
# accessibility-ში არ ჩანს (მხოლოდ "Chrome Legacy Window"). FortiClientConsole.exe არგუმენტებს არ იღებს — explorer-ით.
function Launch($exe) {
  if ($exe -like '*FortiClientConsole.exe') { Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $exe + '"') | Out-Null }
  else { Start-Process -FilePath $exe -ArgumentList '--force-renderer-accessibility' | Out-Null }
}
# რიგით ვცდით $exes-ს (პირველი — ის, რაც ამ კომპიუტერზე ბოლოს გაჭრა). თუ გაშვებული FortiClient შეცდომის ფანჯარას აჩენს,
# ფანჯარას ვხურავთ, ჩავარდნილ პროცესს ვაჩერებთ და მაშინვე შემდეგზე გადავდივართ.
$script:used = $null; $script:skipped = @()
function OpenWindow {
  $script:h = [IntPtr]::Zero
  foreach ($exe in $exes) {
    $before = Pids
    Launch $exe
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 500
      $script:h = [FC]::FindWindow((Pids))
      if ($script:h -ne [IntPtr]::Zero) { $script:used = $exe; return $true }
      $d = [FC]::ErrorDialog((Pids))
      if ($d -ne [IntPtr]::Zero) {
        $p = [FC]::PidOf($d)
        [FC]::PostMessage($d, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        if ($before -notcontains $p) { Start-Sleep -Milliseconds 300; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
        break
      }
    }
    $script:skipped += (Split-Path $exe -Leaf)
  }
  return $false
}
# ჯერ MSAA (ძველი ვერსიები), შემდეგ UI Automation (ახალი ვერსიები); რომელიც ღილაკს იპოვის — იმით ვაგრძელებთ
function Detect($tries) {
  $script:rw = [IntPtr]::Zero; $script:st = 'notfound'; $script:mode = 'msaa'
  for ($i = 0; $i -lt $tries; $i++) {
    if ($script:rw -eq [IntPtr]::Zero) { $script:rw = [FC]::Renderer($script:h) }
    if ($script:rw -ne [IntPtr]::Zero) { $script:st = [FC]::State($script:rw); if ($script:st -eq 'connected' -or $script:st -eq 'disconnected') { $script:mode = 'msaa'; return } }
    if ($i -ge 4) { $script:st = UiaState; if ($script:st -eq 'connected' -or $script:st -eq 'disconnected') { $script:mode = 'uia'; return } }
    Start-Sleep -Milliseconds 500
  }
}

try {
  $h = [FC]::FindWindow((Pids))
  $wasVisible = ($h -ne [IntPtr]::Zero) -and [FC]::IsWindowVisible($h)
  if ($h -eq [IntPtr]::Zero) {
    if (-not (OpenWindow)) { Out @{ ok = $false; stage = 'window'; message = ('FortiClient-ის ფანჯარა არ გაიხსნა (ვცადე: ' + ($exes -join ', ') + ')') } }
  }
  # ფანჯარა ჩნდება ფოკუსის წართმევის გარეშე (SW_SHOWNOACTIVATE); ღილაკს accessibility-ით ვაჭერთ, მაუსი არ გვჭირდება
  if (-not $wasVisible) { [FC]::ShowWindow($h, 4) | Out-Null }
  function CloseIfOurs { if (-not $wasVisible) { [FC]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null } }

  Detect 30
  # ღილაკები არ ჩანს — FortiClient accessibility-ის გარეშეა გაშვებული. VPN გათიშულია (სხვაგვარად აქ არ მოვალთ),
  # ამიტომ FortiClient-ის ფანჯრის პროგრამას ვხურავთ და ხელახლა ვუშვებთ --force-renderer-accessibility-ით.
  if ($st -eq 'notfound' -and ($exes | Where-Object { $_ -notlike '*FortiClientConsole.exe' })) {
    Get-Process -Name FortiClient -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $wasVisible = $false
    if (-not (OpenWindow)) { Out @{ ok = $false; stage = 'window'; message = 'FortiClient-ის ხელახლა გაშვების შემდეგ ფანჯარა არ გაიხსნა' } }
    [FC]::ShowWindow($h, 4) | Out-Null
    Detect 40
  }
  function GetState { if ($mode -eq 'uia') { UiaState } else { [FC]::State($rw) } }
  if ($st -eq 'connected') { CloseIfOurs; Out @{ ok = $true; already = $true; message = 'VPN უკვე ჩართულია'; used = $script:used; skipped = $script:skipped } }
  if ($st -ne 'disconnected') { Out @{ ok = $false; stage = 'connect-button'; message = "Connect ღილაკი ვერ ვიპოვე ($st) — არაფერს დავაჭირე, ფანჯარა ღიაა"; screen = (UiaTexts) } }

  if ($prof) { $cur = if ($mode -eq 'uia') { UiaProfile } else { [FC]::Profile($rw) }; if ($cur -and $cur -notlike "*$prof*") { Out @{ ok = $false; stage = 'profile'; message = "არჩეულია სხვა VPN პროფილი: $cur — არაფერს დავაჭირე" } } }

  $pressed = if ($mode -eq 'uia') { UiaPress } else { [FC]::PressConnect($rw) }
  if (-not $pressed) { Out @{ ok = $false; stage = 'press'; message = 'Connect-ზე დაჭერა ვერ მოხერხდა' } }
  for ($i = 0; $i -lt ($timeout * 2); $i++) {
    Start-Sleep -Milliseconds 500
    if ((GetState) -eq 'connected') { Start-Sleep -Seconds 1; CloseIfOurs; Out @{ ok = $true; message = 'VPN ჩაირთო'; used = $script:used; skipped = $script:skipped } }
  }
  Out @{ ok = $false; stage = 'connecting'; message = 'Connect დავაჭირე, მაგრამ VPN არ ჩაირთო — ფანჯარა ღიაა'; screen = $(if ($mode -eq 'uia') { UiaTexts } else { [FC]::Texts($rw) }) }
} catch {
  Out @{ ok = $false; stage = 'error'; message = $_.Exception.Message }
}
`;

// Claude Desktop-ის (Electron) ცვლადები FortiClient-ს (ისიც Electron-ია) ჩამოაგდებს — ვაშორებთ.
// EDOC_* (მათ შორის იდოკის პაროლი) PowerShell-სა და FortiClient-ს არ უნდა გადაეცეს.
function cleanEnv() {
  const e = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(ELECTRON_|NODE_|CHROME_|MCP_|CLAUDE|EDOC_)/i.test(k)) e[k] = v;
  return e;
}

// ---------- რომელი გზა მუშაობს ამ კომპიუტერზე ----------
// თითო კომპიუტერზე ცალკე, ლოკალურად (%LOCALAPPDATA%\edoc-mcp\vpn-state.json) — Drive-ზე სინქრონიზაციის კონფლიქტების გარეშე.
const STATE_FILE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "edoc-mcp", "vpn-state.json");
function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; } }
function writeState(st) { try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 1)); } catch (e) { log("state:", e.message); } }

let inFlight = null;

export function connectVpn({ password, profile = "vpn.iliauni.edu.ge", timeoutS = 45, host } = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (process.platform !== "win32") return { ok: false, stage: "no_vpn_client", message: "იდოკი მიუწვდომელია: კომპიუტერი არ არის უნივერსიტეტის ქსელში, VPN-ის ავტომატური ჩართვა კი მხოლოდ Windows-ზე მუშაობს. დაუკავშირდი უნივერსიტეტის ქსელს ან ჩართე VPN (vpn.iliauni.edu.ge) ხელით." };
    const exes = [...new Set(FC_EXE_CANDIDATES.filter((p) => { try { return fs.existsSync(p); } catch { return false; } }))];
    if (!exes.length) return { ok: false, stage: "no_vpn_client", message: "იდოკი მიუწვდომელია: კომპიუტერი არ არის უნივერსიტეტის ქსელში და FortiClient VPN დაყენებული არ არის. დაუკავშირდი უნივერსიტეტის ქსელს ან დააყენე FortiClient VPN (vpn.iliauni.edu.ge)." };
    const state = readState();
    const pref = state.exe && exes.find((e) => e.toLowerCase() === String(state.exe).toLowerCase());
    if (pref) { exes.splice(exes.indexOf(pref), 1); exes.unshift(pref); }
    // სკრიპტი ბრძანების ხაზისთვის (-EncodedCommand) ზედმეტად დიდია (Windows-ის ზღვარი ~32K) — დროებით .ps1 ფაილად ვწერთ.
    // UTF-8 BOM-ით, რომ Windows PowerShell 5.1-მა ქართული ტექსტი სწორად წაიკითხოს.
    const psFile = path.join(os.tmpdir(), `edoc-vpn-${process.pid}-${Date.now()}.ps1`);
    fs.writeFileSync(psFile, "\uFEFF" + PS_SCRIPT, "utf8");
    return await new Promise((resolve) => {
      const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", psFile], {
        env: { ...cleanEnv(), FC_EXES: exes.join(";"), VPN_PROFILE: profile || "", VPN_TIMEOUT_S: String(timeoutS), VPN_HOST: host || "edoc.uninet.local" },
        windowsHide: true,
      });
      let out = "", err = "";
      ps.stdout.on("data", (d) => (out += d));
      ps.stderr.on("data", (d) => (err += d));
      const killer = setTimeout(() => ps.kill(), (timeoutS + 45) * 1000);
      ps.on("close", (code) => {
        clearTimeout(killer);
        try { fs.unlinkSync(psFile); } catch {}
        const line = out.trim().split(/\r?\n/).filter(Boolean).pop() || "";
        let res;
        try { res = JSON.parse(line); } catch { res = null; }
        if (res) {
          if (res.ok && res.used) writeState({ computer: os.hostname(), exe: res.used, learned_at: new Date().toISOString() });
          res.computer = os.hostname();
          res.remembered = pref || null;
          resolve(res); return;
        }
        try { resolve(JSON.parse(line)); }
        catch { resolve({ ok: false, stage: "powershell", message: `PowerShell შეცდომა (კოდი ${code})`, detail: (err || out).slice(0, 800) }); }
      });
    });
  })().finally(() => { inFlight = null; });
  return inFlight;
}

// თუ იდოკი არ პასუხობს — ჩართე VPN და დაელოდე, სანამ უპასუხებს.
export async function ensureVpn(host, opts = {}) {
  const base = opts.base || `http://${host}`;
  if (await edocReachable(base)) return { ok: true, already: true, message: "იდოკი ხელმისაწვდომია — VPN არ სჭირდება (უნივერსიტეტის ქსელი ან უკვე ჩართული VPN)" };
  log("იდოკი არ პასუხობს — ვრთავ VPN-ს FortiClient-ით");
  const r = await connectVpn({ ...opts, host });
  if (!r.ok) return r;
  for (let i = 0; i < 20; i++) {
    if (await edocReachable(base)) return r.already ? { ...r, message: "VPN უკვე ჩართული იყო; იდოკი პასუხობს" } : r;
    await new Promise((s) => setTimeout(s, 1000));
  }
  return { ...r, ok: false, message: r.already
    ? "VPN ჩართულია, მაგრამ იდოკი არ პასუხობს — სავარაუდოდ იდოკის სერვერი ან უნივერსიტეტის ქსელია გათიშული"
    : `VPN ჩაირთო, მაგრამ იდოკი (${host}) მაინც არ პასუხობს` };
}

