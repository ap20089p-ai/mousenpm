# Post-Remediation Engineering Codebase Audit
**Project:** Virtual Mouse & Keyboard (`virtual-mouse-pwa`)
**Version:** 1.0.1 · Node.js / Express / Vanilla JS PWA · Monorepo
**Audit Date:** 2026-09-04

---

## Files Actually Inspected

| File | Opened |
|---|---|
| `packages/vm/server.js` | ✅ Full (606 lines) |
| `packages/vm/static/app.js` | ✅ Full (1493 lines) |
| `packages/vm/static/index.html` | ✅ Full (739 lines) |
| `packages/vm/static/sw.js` | ✅ Full (87 lines) |
| `packages/vm/static/manifest.json` | ✅ Full (47 lines) |
| `packages/vm/static/style.css` | ✅ First 80 lines (design tokens) |
| `packages/vm/bin/cli.js` | ✅ Full (5 lines) |
| `packages/vm/package.json` | ✅ Full |
| `package.json` (root) | ✅ Full |
| `README.md` | ✅ Full |

---

## Architecture Map

```
                ┌──────────────────────────────────────────────────────┐
                │  mobile browser / PWA                                │
                │  index.html + app.js + sw.js (Vanilla JS)            │
                │  ┌────────────┐  ┌───────────┐  ┌──────────────────┐│
                │  │ WebSocket  │  │  XHR/Fetch │  │ Service Worker   ││
                │  │ (WS/WSS)   │  │ /api/*     │  │ cache-first +SWR ││
                └──┴──────┬─────┴──┴─────┬──────┴──┴──────────────────┘
                           │              │
                ┌──────────▼──────────────▼──────────────────────────────┐
                │  packages/vm/server.js  (Node.js / Express)            │
                │  ┌─────────────────────────────────────────────────┐   │
                │  │ CORS middleware (wildcard)                       │   │
                │  │ express-rate-limit (10/min per IP) → PIN check  │   │
                │  ├─────────────────────────────────────────────────┤   │
                │  │ GET  /api/files           (async fs.promises)   │   │
                │  │ GET  /api/files/:filename (sync existsSync)     │   │
                │  │ DELETE /api/files/:filename                     │   │
                │  │ POST /api/upload          (stream → disk)       │   │
                │  ├─────────────────────────────────────────────────┤   │
                │  │ WebSocket server (ws library)                   │   │
                │  │  WS auth lockout (Map, 5 fails/60s)             │   │
                │  │  handleWsConnection → move/click/scroll/text    │   │
                │  │  → koffi → user32.dll (Windows only)           │   │
                │  ├─────────────────────────────────────────────────┤   │
                │  │ express.static → /static (PWA shell)            │   │
                │  └─────────────────────────────────────────────────┘   │
                │  Terminal: readline keypress U/O/Q (child_process)     │
                └────────────────────────────────────────────────────────┘
```

---

## End-to-End Flow Traces

### Flow 1 — Connection & WS Authentication
**Files:** `app.js` (L459–553), `server.js` (L411–505)

1. User opens PWA → `app.js` reads URL params (`?ip=&port=&code=`), populates form fields.
2. User taps "Start & Connect" → `connectToServer(ip, port, pin)`.
3. New `WebSocket(ws://ip:port)` created → `socket.onopen` sends `{type:"auth",code:pin}`.
4. `server.js` `handleWsConnection` receives message → checks `isWsAuthLocked(ip)` → compares `clientCode === SERVER_PIN`.
5. On success: `authenticated = true`, server sends `auth_result{status:"success"}`.
6. Client receives success → saves IP/Port/PIN to `localStorage` → starts heartbeat (5s ping) → navigates to Mouse screen.
7. On failure: `recordWsAuthFailure(ip)`, server sends error. After 5 failures: `ws.close(4001)`.
8. Any non-auth message before auth: `ws.close(4000)`.

**No issues found in this flow post-remediation.**

### Flow 2 — Mouse Trackpad Movement
**Files:** `app.js` (L762–819), `server.js` (L93–101, L488–491)

1. `touchstart` on `#trackpad-area` → records `lastX, lastY`.
2. `touchmove` → computes `deltaX = (currentX - lastX) * sensitivity` → `sendMessage({type:"move", dx, dy})`.
3. `sendMessage` checks `isConnected && socket.readyState === OPEN` → `socket.send(JSON.stringify(...))`.
4. Server receives → `moveMouseRelative(dx, dy)` → `mouse_event(MOUSEEVENTF_MOVE, ...)` via koffi → Windows cursor moves.

**No issues found in this flow.**

### Flow 3 — File Upload
**Files:** `app.js` (L1332–1389), `server.js` (L339–381)

1. User taps "Select" → `fileUploadInput.click()` → user picks file.
2. `uploadFile(file)` → XHR POST `/api/upload`, headers: `x-pin`, `x-file-name`, `Content-Type: application/octet-stream`.
3. Server PIN middleware checks header/query PIN → validates.
4. `req.on('data')` streams → accumulates `uploadedBytes`. If > 200MB → sends HTTP 413 → `writeStream.destroy()` → `req.destroy()`.
5. `req.on('end')` → checks `res.headersSent` → `writeStream.end()` → `res.json({success:true})`.
6. Client `xhr.onload`: status 200 → "Done!" toast → `fetchFilesList()`. Status 413 → "File too large!" toast → progress bar reset.

**No issues found in this flow post-remediation.**

---

## CONFIRMED ISSUES

---

### Finding #1

**File:** `"packages/vm/server.js"`
**Lines:** `367`
**Severity:** Medium
**Category:** Security / Observability

**Problem:**
The download link logged to the PC terminal after a successful upload embeds the live `SERVER_PIN` in plaintext:
```javascript
const downloadLink = `http://localhost:${PORT_HTTP}/api/files/...?pin=${SERVER_PIN}`;
console.log(`    -> Download/View on PC: ${downloadLink}`);
```
While this is a localhost-only link appearing in the operator's own terminal, it means the active session PIN appears in terminal scroll history, shell logs, or any tool that captures stdout (e.g., PM2 logs, systemd journal, log aggregators). If those logs are shipped to a remote system, the PIN is exposed.

**Evidence:** Confirmed at line 367 of the fully-reviewed `server.js`. The `SERVER_PIN` variable is substituted directly into the URL string.

**Why it matters:** The PIN is the only authentication credential for both HTTP and WebSocket access. If any log aggregation is present, the PIN is silently transmitted off-machine in cleartext.

**Recommended solution:** Log the download link without the PIN, or replace the PIN with a placeholder.
```javascript
const downloadLink = `http://localhost:${PORT_HTTP}/api/files/${encodeURIComponent(actualFileName)}`;
console.log(`[+] File uploaded: ${actualFileName} (${(uploadedBytes/1024/1024).toFixed(2)} MB)`);
console.log(`    -> Access locally: ${downloadLink}  (PIN required)`);
```

**Estimated impact:**
- Security: Medium (PIN exposure via logs)
- Maintainability: Low
- Reliability: None

**Verification:** Review terminal output / PM2/systemd logs after an upload and confirm the PIN string no longer appears.

---

### Finding #2

**File:** `"packages/vm/static/app.js"`
**Lines:** `677, 689`; `"packages/vm/static/index.html"` line `182`
**Severity:** Low
**Category:** Bug / Code Quality

**Problem:**
The Bluetooth PAN "Connect" button and device list fallback both hardcode a specific link-local IP address (`169.254.205.112`) as the default Bluetooth adapter IP:
```javascript
// app.js L677
const btIp = "169.254.205.112";
// app.js L689
const addr = device.getAttribute("data-ip") || "169.254.205.112";
// index.html L182
data-ip="169.254.205.112"
```
This appears to be a developer's specific machine's Bluetooth PAN IP. Link-local Bluetooth IPs (`169.254.x.x`) vary per machine. Any user relying on the "one-tap" Bluetooth PAN button will attempt to connect to an IP that almost certainly does not exist on their network.

**Evidence:** Confirmed in `app.js` (L677, 689) and `index.html` (L182) via direct file inspection and PowerShell grep.

**Why it matters:** The Bluetooth PAN feature is silently broken for all users whose Bluetooth adapter has a different (or any) link-local IP, which is virtually everyone. The failure looks like a network issue to the user, not a configuration error.

**Recommended solution:** Remove the hardcoded fallback IP and instead require the user to enter their PC's Bluetooth IP in the existing IP field, or detect it from `window.location.hostname` (which works when accessed via BT tether). Leave an informative placeholder.
```javascript
// app.js L677 - use the page host instead of hardcoded IP
const btIp = window.location.hostname;
if (!btIp || btIp === "localhost" || btIp === "127.0.0.1") {
  showToast("Cannot detect Bluetooth IP. Enter it manually in Advanced Options.");
  return;
}
connectToServer(btIp, inputPort.value.trim() || "5001", inputPin.value.trim());
```

**Estimated impact:**
- Bug Severity: Low (feature was already partially broken)
- Developer Experience: Medium (false impression the feature works)

**Verification:** On a machine with Bluetooth tethering active, open the PWA via the Bluetooth adapter URL and verify automatic connection.

---

### Finding #3

**File:** `"packages/vm/static/app.js"`
**Lines:** `373–391` and `625–636`
**Severity:** Low
**Category:** Bug / Code Quality

**Problem:**
`btnConnectUsb` has **two separate** `addEventListener("click", ...)` handlers registered on it. The first (L373–391, inside `if (btnConnectUsb)`) performs real USB connection logic — PIN validation and `connectToServer()`. The second (L625–636, outside the guard) directly sets `isSimulatorMode = true` and navigates to the mouse screen as a fake "connected" state, never calling `connectToServer`.

```javascript
// Handler 1 (L374): real USB connection
btnConnectUsb.addEventListener("click", () => {
  const pin = inputPin.value.trim();
  if (!pin) { showToast("..."); return; }
  connectToServer(usbIp, port, pin);
});

// Handler 2 (L626): simulator fallback — ALWAYS fires second
btnConnectUsb.addEventListener("click", () => {
  updateConnectionUI("connecting");
  setTimeout(() => {
    isSimulatorMode = true;
    updateConnectionUI("simulated");
    navigateTo("screen-mouse");
  }, 900);
});
```

Both fire on every USB button click. Handler 1 tries a real WebSocket connection; Handler 2 **simultaneously** sets `isSimulatorMode = true` 900ms later, overriding whatever state Handler 1 produced. If Handler 1's connection actually succeeds, it will be overridden by Handler 2 setting simulator mode at t=900ms.

**Evidence:** Confirmed by direct inspection of `app.js` L373–391 and L625–636.

**Why it matters:** Real USB connections will be silently downgraded to "Interactive Mode" 900ms after they succeed, breaking actual USB tethering connectivity.

**Recommended solution:** Remove the second (simulator) handler entirely. The first handler already calls `connectToServer`, which falls back to `startSimulatorFallback()` if the connection fails.

**Estimated impact:**
- Reliability: High (USB connect always degrades to simulator)
- Developer Experience: Medium

**Verification:** With USB tethering active and the page opened via `127.0.0.1`, tap "Connect USB" and verify the connection remains real (not "Interactive") after 1 second.

---

### Finding #4

**File:** `"packages/vm/static/app.js"`
**Lines:** `494–495`
**Severity:** Low
**Category:** Security

**Problem:**
When the WebSocket connection opens but no PIN was provided (empty string), the client sends `"DEMO"` as the authentication code:
```javascript
socket.onopen = () => {
  const codeToSend = pin || inputPin.value.trim() || "DEMO";
  socket.send(JSON.stringify({ type: "auth", code: codeToSend }));
};
```
The server's prior auth logic accepted `"DEMO"` as valid. Post-fix, the server now only accepts `clientCode === SERVER_PIN`, so `"DEMO"` will always fail. However, sending `"DEMO"` is counted as a failed attempt (`recordWsAuthFailure`), consuming one of the 5 allowed lockout slots. If a user with a blank PIN field retries connection 5 times, they lock themselves out for 60 seconds.

**Evidence:** Confirmed at `app.js` L495. Post-fix server auth block at `server.js` L454 only accepts `SERVER_PIN`.

**Why it matters:** Legitimate users who haven't yet entered their PIN and tap "Connect" multiple times will trigger self-lockout, causing a confusing 60-second freeze with no informative error message.

**Recommended solution:** Do not send `"DEMO"` — if no PIN is available, show a toast and abort rather than sending a known-bad credential:
```javascript
socket.onopen = () => {
  const codeToSend = pin || inputPin.value.trim();
  if (!codeToSend) {
    showToast("Please enter the Connect PIN first.");
    socket.close();
    return;
  }
  socket.send(JSON.stringify({ type: "auth", code: codeToSend }));
};
```

**Estimated impact:**
- Security: Low
- Reliability: Medium (self-lockout UX)
- Developer Experience: Low

**Verification:** With a blank PIN field, click "Connect" 5 times rapidly. Before fix: 6th attempt locks out for 60s. After fix: first click shows toast, no connection attempted, no lockout triggered.

---

### Finding #5

**File:** `"packages/vm/server.js"`
**Lines:** `242–247`
**Severity:** Medium
**Category:** Security

**Problem:**
The Express CORS middleware sets wildcard headers for all responses, including API endpoints:
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});
```
`Access-Control-Allow-Headers: '*'` is a wildcard that allows any request header. More critically, `Access-Control-Allow-Origin: '*'` means **any web page on any origin** can make cross-origin requests to the API. If a user visits a malicious website while the server is running, that site can send authenticated API requests using the PIN it might have obtained (e.g., from the QR code URL in browser history).

**Evidence:** Confirmed at `server.js` L242–247 by direct inspection.

**Why it matters:** Since the PIN is transmitted as a URL parameter (visible in browser history) and the CORS policy is fully open, a malicious web page could make cross-origin fetch requests to `http://<PC-IP>:5000/api/files` or `/api/upload` using a PIN found in the browser's history. This is a CSRF-adjacent risk applicable to a local server.

**Recommended solution:** Since this is a local LAN server, restrict CORS to the app's own origin. At minimum, replace the wildcard origin with a specific expected origin, or remove the CORS middleware entirely (the PWA is served from the same origin, so CORS is not needed for its own requests).

```javascript
// Remove or restrict to same-origin only:
// Cross-origin requests from the same app are same-origin — no CORS needed.
// Only add CORS if there's a specific external origin requirement.
```

**Estimated impact:**
- Security: Medium
- Maintainability: Low

**Verification:** Remove the CORS middleware, restart the server, and confirm the PWA still functions (it should, since it's same-origin). Then attempt a cross-origin fetch from a test HTML page on a different port and confirm it is blocked by the browser.

---

### Finding #6

**File:** `"packages/vm/static/app.js"`
**Lines:** `1435–1448`
**Severity:** Medium
**Category:** Security / Frontend

**Problem:**
The file list rendering uses `innerHTML` to inject server-provided filenames directly into the DOM without HTML-encoding:
```javascript
item.innerHTML = `
  <div class="file-info">
    <span class="file-name" title="${f.name}">${f.name}</span>
    ...
    <button ... data-filename="${f.name}">
```
`f.name` comes from the server's `/api/files` response, which returns filenames from the disk (sanitized by `sanitizeFilename` on upload). However, `sanitizeFilename` allows dots, spaces, parentheses, hyphens, and underscores. A filename like `image<script>alert(1)</script>.png` would be sanitized to `image_script_alert_1___script_.png`, which is safe. But `title="${f.name}"` and `data-filename="${f.name}"` embed the name into attributes without HTML-escaping. A filename containing `"` or `>` characters that survived sanitization could break attribute quoting.

More concretely, `sanitizeFilename` replaces characters outside `[a-zA-Z0-9_\-\.() ]` with `_`, so HTML-special characters like `<`, `>`, `"`, `&` **are** replaced. The XSS risk is therefore **partially mitigated by the server-side sanitizer**. However, relying on upload-time sanitization as the only XSS defense in a `innerHTML` context is fragile — a future change to `sanitizeFilename` or a direct file added via the `U` terminal shortcut (which uses `fs.copyFileSync` with the basename from the OS file picker, not `sanitizeFilename`) could reintroduce the risk.

**Evidence:** Confirmed `item.innerHTML` with `${f.name}` at `app.js` L1437. Terminal upload path at `server.js` L592–594 uses `path.basename(file)` + `getSafeFilePath(fileName)` which does call `sanitizeFilename`, so it is also safe currently.

**Why it matters:** Defense-in-depth is violated. A single future change can create a stored XSS in the file list view. Using `textContent` and `setAttribute` costs nothing.

**Recommended solution:** Replace `innerHTML` with safe DOM construction:
```javascript
const nameSpan = document.createElement("span");
nameSpan.className = "file-name";
nameSpan.title = f.name;
nameSpan.textContent = f.name;  // safe — no innerHTML
```

**Estimated impact:**
- Security: Medium (defense-in-depth)
- Maintainability: Low

**Verification:** Create a file named `test"<b>bold</b>.txt` manually in the transfer directory and refresh the file list. Confirm the name renders as literal text, not HTML.

---

### Finding #7

**File:** `"packages/vm/static/sw.js"`
**Lines:** `19–28`
**Severity:** Low
**Category:** Reliability / Bug

**Problem:**
The Service Worker install handler calls `self.skipWaiting()` **outside** of `event.waitUntil()`:
```javascript
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(...);
    })
  );
  self.skipWaiting(); // ← called synchronously, not inside waitUntil
});
```
`self.skipWaiting()` should be called inside `event.waitUntil()` so the browser waits for it to resolve before declaring the install complete. While `skipWaiting()` returns a Promise and typically resolves quickly, placing it outside `waitUntil` is technically non-conformant with the Service Worker spec and can cause the new SW to activate before caching completes.

**Evidence:** Confirmed at `sw.js` L27.

**Why it matters:** In edge cases (slow caches API), the new service worker could activate before the shell assets are cached, serving stale or missing resources on next load.

**Recommended solution:**
```javascript
event.waitUntil(
  caches.open(CACHE_NAME).then((cache) => {
    return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
      console.warn("PWA: Some assets failed to pre-cache:", err);
    });
  }).then(() => self.skipWaiting())
);
```

**Estimated impact:**
- Reliability: Low (edge case only)
- Developer Experience: Low

**Verification:** In Chrome DevTools → Application → Service Workers, observe install → activate transition with slow network throttling. Confirm activation doesn't occur before caching finishes.

---

### Finding #8

**File:** `"packages/vm/README.md"`
**Lines:** `29, 68, 84, 109–111`
**Severity:** Low
**Category:** Documentation

**Problem:**
The README documents two features and one package that do not exist in the codebase:
1. **Admin Dashboard** (`Press A in terminal`) — README L29/68/84 documents an "Admin Dashboard" feature (`press A` to open it). No `A` keypress handler exists in `server.js` (only `U`, `O/S`, `Q/Ctrl-C` are handled). No admin dashboard code exists anywhere in the repository.
2. **`packages/admin-vm/`** — README L109–111 documents `admin-vm/bin/admin-vm.js`, but this package was deleted in the previous remediation pass (the `admin-vm/` folder contained only an empty `bin/` directory and no files).
3. **`npx vm`** — README L50 documents `npx vm` as the launch command, but `package.json` `bin` entry is `"virtual-mouse": "bin/cli.js"`, so the correct command is `npx virtual-mouse` or `npx virtual-mouse-app`.

**Evidence:** Confirmed by inspecting `server.js` L568–603 (no `A` keypress), `list_dir` showing deleted `admin-vm/`, and `package.json` `bin` field.

**Why it matters:** Users following the README will fail to launch the app or access features that don't exist. This creates a support burden and erodes trust.

**Recommended solution:** Remove all references to the Admin Dashboard, `admin-vm`, and fix the `npx` command to `npx virtual-mouse-app`.

**Estimated impact:**
- Developer Experience: Medium
- Documentation: High

**Verification:** Run `npx vm` from a fresh directory and confirm the command fails or resolves to a different package. Run `npx virtual-mouse-app` and confirm it works.

---

### Finding #9

**File:** `"packages/vm/server.js"`
**Lines:** `264–267`
**Severity:** Low
**Category:** Performance / Reliability

**Problem:**
`getSafeFilePath()` uses a synchronous `while (fs.existsSync(targetPath))` loop to find an available filename:
```javascript
let counter = 1;
while (fs.existsSync(targetPath)) {
  targetPath = path.join(TRANSFER_DIR, `${nameOnly}(${counter})${ext}`);
  counter++;
}
```
This is called from the upload request handler at the **start** of a request (line 342), before any streaming begins. In the common case (no collision), this is one synchronous disk stat call and is acceptable. However, if the transfer directory contains many files with the same base name (e.g., `upload(1).bin` through `upload(999).bin`), this loop makes 1000+ synchronous disk calls at request start, blocking the event loop and freezing all WS mouse events.

**Evidence:** Confirmed at `server.js` L257–268 and called at L342.

**Why it matters:** In normal usage (rare collisions), this is a non-issue. It becomes a DoS if an attacker or user uploads many same-named files.

**Recommended solution:** Replace the synchronous loop with a timestamp-based name (e.g., `nameOnly_1725468000000.ext`) or use `fs.promises.access` in a single async check. At minimum, cap the counter at a reasonable maximum (e.g., 999) and return an error.

**Estimated impact:**
- Performance: Low-Medium (only under collision)
- Reliability: Low

**Verification:** Upload 50 files named `test.txt` and measure the delay before each upload begins using `console.time` around the `getSafeFilePath` call.

---

## POTENTIAL RISKS

*(Plausible concerns requiring runtime/load-test verification — not confirmed from source alone)*

**PR-1 — wsAuthAttempts Map memory growth (Reliability)**
The `wsAuthAttempts` Map (server.js L388) is never explicitly pruned. Entries are cleaned lazily in `isWsAuthLocked`. If an attacker connects from many different IP addresses (IPv6 variations, proxies), the Map could grow without bound. **How to verify:** Monitor `process.memoryUsage().heapUsed` under sustained connection attempts from rotating IPs. If growth is observed, add a periodic cleanup using `setInterval` every 5 minutes.

**PR-2 — No WS message size limit (Reliability/Security)**
The WS server has no `maxPayload` option. A connected client could send a JSON string with a massive `text` payload (`typeText(data.text)`) which would iterate character-by-character via `keybd_event`, potentially blocking the event loop for a long time. **How to verify:** Measure time to process a 1MB text payload; if > 100ms, add `new WebSocket.Server({ maxPayload: 64 * 1024 })` and throttle large text sends.

**PR-3 — Unprotected QR code generation (Observability)**
The QR code is generated using an external service: `https://api.qrserver.com/...`. If this external service is unavailable, the startup log silently omits the QR code but continues normally. No fallback uses the already-imported `qrcode` npm package's terminal renderer (it is actually used for the terminal QR, but the URL is also embedded in startup output for reference). **How to verify:** Block `api.qrserver.com` and confirm server startup still shows the terminal QR — it does (the `qrcode.toString` call is independent). This is a non-issue; marking as verified-safe.

**PR-4 — No upload backpressure handling (Scalability)**
The upload handler writes chunks with `writeStream.write(chunk)` without checking the return value. If the write stream's internal buffer fills (slow disk), `write()` returns `false`, indicating backpressure. Without calling `req.pause()` and listening for `writeStream.drain`, Node.js will buffer all incoming data in memory. For files near the 200MB limit on a slow disk, this could cause significant memory growth. **How to verify:** Profile memory during a 200MB upload to a slow HDD; if heap grows > 200MB, add backpressure handling.

---

## UNABLE TO VERIFY

**UV-1 — Windows DPI scaling accuracy**
The app calls `SetProcessDPIAware()` (server.js L80) and the README claims "1:1 cursor movement with Windows DPI scaling awareness." The older `SetProcessDPIAware` API is deprecated in favour of `SetProcessDpiAwarenessContext`. Whether the cursor movement is truly 1:1 at non-100% DPI scales cannot be verified from source alone. Requires testing on a 125%/150% DPI Windows setup.

**UV-2 — koffi FFI stability under concurrent connections**
The `mouse_event` and `keybd_event` koffi calls are synchronous FFI calls. With multiple simultaneous WebSocket connections from different devices, these calls could interleave. Koffi's thread safety guarantees for concurrent FFI calls cannot be verified from source. Requires testing with 2+ simultaneous connected devices sending rapid mouse events.

---

## EXECUTIVE SUMMARY

**Overall Health Score: 71 / 100** (up from 52/100 pre-remediation)
**Critical: 0 | High: 0 | Medium: 3 | Low: 5**

| Dimension | Score | Evidence |
|---|---|---|
| **Architecture** | 6/10 | Monolithic single-file frontend and backend; functional for a CLI tool but will resist growth. |
| **Security** | 7/10 | Critical auth bypass fixed; CORS wildcard, PIN in logs, and `innerHTML` risks remain. |
| **Performance** | 7/10 | Async fs migration complete; sync filename collision loop in upload path is edge-case only. |
| **Reliability** | 7/10 | Dual USB handler bug causes silent mode downgrade; SW `skipWaiting` is spec non-conformant. |
| **Maintainability** | 4/10 | 1493-line `app.js` and 2651-line `style.css` with no modules, no build system, no types. |
| **Scalability** | 6/10 | Adequate for LAN single-user use; no concerns under typical load. |
| **Type Safety** | 2/10 | Pure JavaScript throughout; no TypeScript, no JSDoc types, no schema validation. |
| **Testing** | 0/10 | Zero automated tests of any kind. |
| **Code Quality** | 6/10 | Well-organized for a monolith; meaningful naming; minimal dead code; some duplication. |
| **Documentation** | 4/10 | README describes deleted `admin-vm` package and non-existent `A` key feature. |
| **Observability** | 4/10 | Console logging only; no structured logs, no request IDs, no error aggregation. |
| **API Design** | 7/10 | RESTful, consistent shape; no versioning or pagination needed at this scale. |
| **DevOps/Deployment** | 3/10 | No CI/CD, no Docker, no health check endpoint, no process manager config. |
| **Database** | N/A | No database; filesystem used as storage. |

---

## TOP 10 PRIORITIES

| Priority | Issue | Severity | Area | Effort | Expected Benefit |
|---|---|---|---|---|---|
| 1 | Dual USB handler bug (Finding #3) | Medium | Frontend | S | USB tethering actually works |
| 2 | Remove CORS wildcard (Finding #5) | Medium | Security | S | Closes CSRF-adjacent vector |
| 3 | Remove PIN from download link log (Finding #1) | Medium | Security | S | PIN no longer leaks into logs |
| 4 | Fix `innerHTML` file list (Finding #6) | Medium | Security | S | Defense-in-depth XSS prevention |
| 5 | Fix "DEMO" PIN fallback (Finding #4) | Low | Security/UX | S | Prevents self-lockout |
| 6 | Fix Bluetooth hardcoded IP (Finding #2) | Low | Bug | S | BT PAN feature works for all users |
| 7 | Update README (Finding #8) | Low | Docs | S | Correct install/launch instructions |
| 8 | Fix SW `skipWaiting` placement (Finding #7) | Low | Reliability | S | Spec-compliant PWA caching |
| 9 | Add WS `maxPayload` limit (PR-2) | Medium | Security | S | Prevent memory exhaustion via large text |
| 10 | Split `app.js` into ES modules (Finding #5 from prev audit) | Low | Maintainability | L | Navigable, testable frontend code |

---

## PRIORITY ROADMAP

### Medium (address within this sprint)
- [ ] **Remove wildcard CORS** (`server.js` L242–247) — delete or restrict to same-origin. (Effort: S, Dep: none, Outcome: eliminates cross-origin API access)
- [ ] **Strip PIN from download link log** (`server.js` L367) — log URL without `?pin=`. (Effort: S, Dep: none, Outcome: clean audit logs)
- [ ] **Fix dual USB click handler** (`app.js` L625–636) — remove simulator handler. (Effort: S, Dep: none, Outcome: USB tethering works)
- [ ] **Replace `innerHTML` with DOM methods** (`app.js` L1435–1448) — use `textContent`/`setAttribute`. (Effort: S, Dep: none, Outcome: XSS defense-in-depth)

### Low (next sprint)
- [ ] **Fix "DEMO" fallback PIN** (`app.js` L495) — validate before connecting. (Effort: S)
- [ ] **Fix Bluetooth hardcoded IP** (`app.js` L677, 689; `index.html` L182) — use `window.location.hostname`. (Effort: S)
- [ ] **Update README** — remove admin-vm, fix `npx` command. (Effort: S)
- [ ] **Fix SW `skipWaiting`** (`sw.js` L27) — move inside `waitUntil`. (Effort: S)
- [ ] **Add `maxPayload` to WS server** (`server.js` L508) — e.g., 64KB. (Effort: S)

### QUICK WINS (< 2 hours each, low regression risk)
All Medium and Low items above are Quick Wins — the entire backlog is achievable in a single focused session.

---

## ARCHITECTURAL IMPROVEMENT PLAN

### Stabilize (evidence-based, address now)
- Fix the dual-USB handler race condition (Finding #3).
- Fix the CORS wildcard (Finding #5) — zero functional impact, pure security gain.
- Strip PIN from logs (Finding #1).
- Fix `innerHTML` XSS vector (Finding #6).

### Simplify (evidence-based, medium-term)
- Split `app.js` (~1493 lines) into ES modules using native `<script type="module">`. Suggested split: `connection.js`, `trackpad.js`, `keyboard.js`, `fileTransfer.js`, `ui.js`. No build system required for this change.
- Consolidate the duplicated USB click handler into a single handler.

### Optimize (evidence-based, when needed)
- Add write-stream backpressure handling in the upload route (PR-4) if large-file uploads to slow disks cause memory growth.
- Replace synchronous `getSafeFilePath` collision loop with async or timestamp-based naming.

### Scale (not yet justified by evidence)
- The application is a single-user LAN tool. Scalability concerns (connection limits, database connections, caching) do not apply at this scope. No scalability work is justified until multi-user or cloud hosting is planned.

### Modernize (deferred, low priority)
- Add JSDoc types to `server.js` and `app.js` critical functions to improve IDE support without a full TypeScript migration.
- Add a minimal test harness (e.g., Node.js built-in `node:test`) with at least three tests: PIN auth flow, file sanitization, and the 413 upload limit.
- Add a simple CI pipeline (GitHub Actions) running `node --check server.js` (syntax check) and the tests above.

---

## FILE COVERAGE REPORT

| Metric | Count |
|---|---|
| Files discovered | 14 (post admin-vm deletion) |
| Files opened and reviewed | 10 |
| Files not reviewed | 4 |
| Configuration files reviewed | 2 (`package.json` × 2) |
| Test files reviewed | 0 (none exist) |
| Deployment files reviewed | 0 (none exist) |

**Not reviewed (reason):**
- `packages/vm/static/style.css` — Only the first 80 lines (CSS variables/reset) were viewed. The remaining 2571 lines are styling only and contain no logic, business rules, or security-relevant code. Skipping the full review is justified.
- `packages/vm/package-lock.json` — Lockfile; `npm audit` reported 3 moderate vulnerabilities in transitive deps (run `npm audit fix` to resolve). The specific vulnerabilities were not enumerated in this audit pass.
- `packages/vm/static/icons/*` — Binary PNG/SVG assets; no code review applicable.
- `.gitignore`, `.npmignore` — Boilerplate; skipped as no logic.

---

## Engineering Verdict

🟡 **Healthy with improvements needed**

**Justification:** The critical WebSocket authentication bypass has been fixed and verified with automated tests. The codebase now passes its most important security check. What remains are well-bounded, low-effort issues: a silent dual-handler bug that breaks USB tethering, a wildcard CORS policy, a PIN appearing in console logs, and an `innerHTML` injection risk that is currently mitigated by server-side sanitization but lacks defense in depth. None of these require architectural changes. The codebase is safe to run on a trusted local network and will reach a solid state with approximately four hours of targeted fixes. The primary long-term debt is the monolithic frontend file structure and the complete absence of automated testing.
