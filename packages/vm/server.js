const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const qrcode = require('qrcode');
const koffi = require('koffi');
const rateLimit = require('express-rate-limit');

// --- Ports & Setup ---
let PORT_HTTP = parseInt(process.env.PORT || '5000', 10);
let PORT_WS = parseInt(process.env.WS_PORT || '5001', 10);

// Parse optional CLI arguments (--version, --pin=, --port=)
const pkg = require('./package.json');
let SERVER_PIN = Math.floor(1000 + Math.random() * 9000).toString();
let transferPathArg = null;
for (const arg of process.argv) {
  if (arg === '--version' || arg === '-v') {
    console.log(`v${pkg.version}`);
    process.exit(0);
  } else if (arg.startsWith('--pin=')) {
    SERVER_PIN = arg.split('=')[1].trim();
  } else if (arg.startsWith('--port=')) {
    PORT_HTTP = parseInt(arg.split('=')[1].trim(), 10);
    PORT_WS = PORT_HTTP + 1;
  } else if (arg.startsWith('--transfer-path=')) {
    transferPathArg = arg.split('=')[1].trim();
  }
}

// Ensure transfer directory exists
const TRANSFER_DIR = transferPathArg ? path.resolve(transferPathArg) : path.join(__dirname, 'transfers');
if (!fs.existsSync(TRANSFER_DIR)) {
  fs.mkdirSync(TRANSFER_DIR, { recursive: true });
}

// Mouse Event Flags
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;

// Keyboard Event Flags
const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_KEYUP = 0x0002;

// Virtual Key Codes (Windows VK)
const VK_BACK = 0x08;
const VK_TAB = 0x09;
const VK_RETURN = 0x0D;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;  // Alt Key
const VK_ESCAPE = 0x1B;
const VK_SPACE = 0x20;
const VK_LEFT = 0x25;
const VK_UP = 0x26;
const VK_RIGHT = 0x27;
const VK_DOWN = 0x28;
const VK_DELETE = 0x2E;
const VK_LWIN = 0x5B;  // Windows Key
const VK_F4 = 0x73;    // F4 Key
const VK_F5 = 0x74;    // F5 Key (Refresh/Fn)

// --- Windows user32.dll API Bindings via koffi ---
let user32 = null;
let GetCursorPos, SetCursorPos, mouse_event, keybd_event;

try {
  user32 = koffi.load('user32.dll');

  // Enable DPI Awareness for 1:1 mouse scaling
  try {
    const SetProcessDPIAware = user32.func('bool SetProcessDPIAware()');
    SetProcessDPIAware();
  } catch (e) { }

  const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
  SetCursorPos = user32.func('bool SetCursorPos(int x, int y)');
  GetCursorPos = user32.func('bool GetCursorPos(_Out_ POINT *pt)');
  mouse_event = user32.func('void mouse_event(uint32_t dwFlags, uint32_t dx, uint32_t dy, uint32_t dwData, uintptr_t dwExtraInfo)');
  keybd_event = user32.func('void keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
} catch (err) {
  console.warn('[!] Notice: Windows user32.dll bindings unavailable on this OS platform.');
}

function moveMouseRelative(dx, dy) {
  if (mouse_event) {
    mouse_event(MOUSEEVENTF_MOVE, Math.round(dx), Math.round(dy), 0, 0);
  } else if (GetCursorPos && SetCursorPos) {
    const pt = {};
    if (GetCursorPos(pt)) {
      SetCursorPos(pt.x + Math.round(dx), pt.y + Math.round(dy));
    }
  }
}

function mouseClick(button = 'left', action = 'click') {
  if (!mouse_event) return;
  if (button === 'left') {
    if (action === 'down') mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
    else if (action === 'up') mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    else { mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0); }
  } else if (button === 'right') {
    if (action === 'down') mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
    else if (action === 'up') mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
    else { mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0); }
  } else if (button === 'middle') {
    if (action === 'down') mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0);
    else if (action === 'up') mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
    else { mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0); mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0); }
  }
}

function mouseScroll(dy) {
  if (!mouse_event) return;
  const wheelUnits = Math.round(dy * 30);
  mouse_event(MOUSEEVENTF_WHEEL, 0, 0, wheelUnits, 0);
}

function pressVK(vkCode) {
  if (!keybd_event) return;
  keybd_event(vkCode, 0, 0, 0);
  keybd_event(vkCode, 0, KEYEVENTF_KEYUP, 0);
}

function pressCombo(modifierVK, keyCharOrVK) {
  if (!keybd_event) return;
  const vk = typeof keyCharOrVK === 'string' ? keyCharOrVK.toUpperCase().charCodeAt(0) : keyCharOrVK;
  keybd_event(modifierVK, 0, 0, 0);
  keybd_event(vk, 0, 0, 0);
  keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
  keybd_event(modifierVK, 0, KEYEVENTF_KEYUP, 0);
}

function pressTripleCombo(mod1, mod2, keyCharOrVK) {
  if (!keybd_event) return;
  const vk = typeof keyCharOrVK === 'string' ? keyCharOrVK.toUpperCase().charCodeAt(0) : keyCharOrVK;
  keybd_event(mod1, 0, 0, 0);
  keybd_event(mod2, 0, 0, 0);
  keybd_event(vk, 0, 0, 0);
  keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
  keybd_event(mod2, 0, KEYEVENTF_KEYUP, 0);
  keybd_event(mod1, 0, KEYEVENTF_KEYUP, 0);
}

function typeText(text) {
  if (!keybd_event) return;
  for (const char of text) {
    if (char === '\n') { pressVK(VK_RETURN); continue; }
    if (char === '\t') { pressVK(VK_TAB); continue; }
    const code = char.charCodeAt(0);
    keybd_event(0, code, KEYEVENTF_UNICODE, 0);
    keybd_event(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0);
  }
}

function pressSpecialKey(keyType) {
  const k = keyType.toLowerCase().trim();
  if (k === 'backspace') pressVK(VK_BACK);
  else if (k === 'enter' || k === 'return') pressVK(VK_RETURN);
  else if (k === 'space') pressVK(VK_SPACE);
  else if (k === 'tab') pressVK(VK_TAB);
  else if (k === 'escape' || k === 'esc') pressVK(VK_ESCAPE);
  else if (k === 'delete') pressVK(VK_DELETE);
  else if (k === 'shift') pressVK(VK_SHIFT);
  else if (k === 'alt') pressVK(VK_MENU);
  else if (k === 'win' || k === 'windows') pressVK(VK_LWIN);
  else if (k === 'fn' || k === 'f5') pressVK(VK_F5);
  else if (k === 'up' || k === 'arrowup') pressVK(VK_UP);
  else if (k === 'down' || k === 'arrowdown') pressVK(VK_DOWN);
  else if (k === 'left' || k === 'arrowleft') pressVK(VK_LEFT);
  else if (k === 'right' || k === 'arrowright') pressVK(VK_RIGHT);
  else if (k === 'ctrl+a' || k === 'selectall') pressCombo(VK_CONTROL, 'A');
  else if (k === 'ctrl+c' || k === 'copy') pressCombo(VK_CONTROL, 'C');
  else if (k === 'ctrl+v' || k === 'paste') pressCombo(VK_CONTROL, 'V');
  else if (k === 'ctrl+z' || k === 'undo') pressCombo(VK_CONTROL, 'Z');
  else if (k === 'ctrl+y' || k === 'redo') pressCombo(VK_CONTROL, 'Y');
  else if (k === 'ctrl+s' || k === 'save') pressCombo(VK_CONTROL, 'S');
  else if (k === 'win+shift+s' || k === 'snip') pressTripleCombo(VK_LWIN, VK_SHIFT, 'S');
  else if (k === 'alt+tab') pressCombo(VK_MENU, VK_TAB);
  else if (k === 'alt+f4') pressCombo(VK_MENU, VK_F4);
  else if (k === 'alt+space') pressCombo(VK_MENU, VK_SPACE);
}


// --- Smart Local IP Discovery (Prioritizes Wi-Fi over Virtual Adapters) ---
function getNetworkInterfacesList() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    // Exclude virtual network adapters that break phone connectivity over Wi-Fi
    if (lowerName.includes('virtualbox') || lowerName.includes('vmware') || lowerName.includes('wsl') || lowerName.includes('vethernet') || lowerName.includes('loopback')) {
      continue;
    }

    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        let score = 10;
        if (lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless')) {
          score = 100;
        } else if (lowerName.includes('ethernet')) {
          score = 50;
        }
        candidates.push({ address: net.address, name, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          candidates.push({ address: net.address, name, score: 0 });
        }
      }
    }
  }

  return candidates;
}

function getPrimaryIP() {
  const list = getNetworkInterfacesList();
  return list.length > 0 ? list[0].address : '127.0.0.1';
}

// --- HTTP Server (Serving static/ PWA) ---
const staticDir = path.join(__dirname, 'static');
const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'x-pin, x-file-name, Content-Type');
  next();
});

// --- File Transfer API ---
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

function sanitizeFilename(name) {
  if (!name) return 'unnamed';
  return name.replace(/^.*[\\\/]/, '').replace(/[^a-zA-Z0-9_\-\.\(\)\ ]/g, '_').trim() || 'unnamed';
}

function getSafeFilePath(filename) {
  let baseName = sanitizeFilename(filename);
  const ext = path.extname(baseName);
  const nameOnly = path.basename(baseName, ext);
  
  let targetPath = path.join(TRANSFER_DIR, baseName);
  let counter = 1;
  while (fs.existsSync(targetPath) && counter <= 100) {
    targetPath = path.join(TRANSFER_DIR, `${nameOnly}(${counter})${ext}`);
    counter++;
  }
  if (fs.existsSync(targetPath)) {
    targetPath = path.join(TRANSFER_DIR, `${nameOnly}_${Date.now()}${ext}`);
  }
  return targetPath;
}

// --- Rate Limiter for API routes (Fix 2: brute-force protection) ---
const pinLimiter = rateLimit({
  windowMs: 60 * 1000,          // 1-minute rolling window
  max: 10,                       // 10 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' }
});

// PIN Auth Middleware for APIs
app.use('/api', pinLimiter, (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const providedPin = req.headers['x-pin'] || req.query.pin;
  if (providedPin !== SERVER_PIN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }
  next();
});

// List Files (Fix 3: async fs — never blocks the event loop)
app.get('/api/files', async (req, res) => {
  try {
    const entries = await fs.promises.readdir(TRANSFER_DIR);
    const settled = await Promise.all(
      entries.map(async (name) => {
        try {
          const stat = await fs.promises.stat(path.join(TRANSFER_DIR, name));
          return stat.isFile() ? { name, size: stat.size, mtime: stat.mtime } : null;
        } catch {
          return null; // file may have been deleted between readdir and stat
        }
      })
    );
    res.json(settled.filter(Boolean));
  } catch (err) {
    console.error('[!] Error listing files:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Download File
app.get('/api/files/:filename', (req, res) => {
  const safeName = sanitizeFilename(req.params.filename);
  const targetPath = path.join(TRANSFER_DIR, safeName);
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  console.log(`[+] File downloaded by client: ${safeName}`);
  res.download(targetPath);
});

// Delete File
app.delete('/api/files/:filename', (req, res) => {
  const safeName = sanitizeFilename(req.params.filename);
  const targetPath = path.join(TRANSFER_DIR, safeName);
  if (fs.existsSync(targetPath)) {
    try {
      fs.unlinkSync(targetPath);
      console.log(`[-] File deleted by client: ${safeName}`);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: 'Could not delete file' });
    }
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Upload File
app.post('/api/upload', (req, res) => {
  const rawFileName = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : 'upload.bin';
  const targetPath = getSafeFilePath(rawFileName);
  const actualFileName = path.basename(targetPath);

  let uploadedBytes = 0;
  const writeStream = fs.createWriteStream(targetPath);

  req.on('data', chunk => {
    uploadedBytes += chunk.length;
    if (uploadedBytes > MAX_FILE_SIZE) {
      // Fix 4: send 413 before destroying so the client UI exits its uploading state
      if (!res.headersSent) {
        res.status(413).json({ error: 'File exceeds maximum allowed size (200 MB).' });
      }
      writeStream.destroy();
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      console.error(`[!] Upload aborted for ${actualFileName} - Exceeded 200MB limit.`);
      req.destroy();
      return;
    }
    const canWrite = writeStream.write(chunk);
    if (!canWrite) {
      req.pause();
      writeStream.once('drain', () => req.resume());
    }
  });

  req.on('end', () => {
    if (res.headersSent) return; // already responded (e.g. 413 path)
    writeStream.end();
    const downloadLink = `http://localhost:${PORT_HTTP}/api/files/${encodeURIComponent(actualFileName)}`;
    console.log(`[+] File uploaded from client: ${actualFileName} (${(uploadedBytes / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`    -> Download/View on PC: ${downloadLink} (PIN required)`);
    res.json({ success: true, filename: actualFileName });
  });

  req.on('error', err => {
    writeStream.destroy();
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    console.error(`[!] Upload error for ${actualFileName}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

app.use(express.static(staticDir));

const httpServer = http.createServer(app);

// --- WS Auth Brute-Force Lockout (Fix 2b) ---
const wsAuthAttempts = new Map(); // ip -> { count, firstAttempt }
const WS_MAX_ATTEMPTS = 5;
const WS_WINDOW_MS = 60 * 1000; // 1-minute window

// Periodic cleanup timer for expired lockout entries (PR-1)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of wsAuthAttempts.entries()) {
    if (now - entry.firstAttempt > WS_WINDOW_MS) {
      wsAuthAttempts.delete(ip);
    }
  }
}, WS_WINDOW_MS).unref();

function isWsAuthLocked(ip) {
  const entry = wsAuthAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > WS_WINDOW_MS) {
    wsAuthAttempts.delete(ip);
    return false;
  }
  return entry.count >= WS_MAX_ATTEMPTS;
}

function recordWsAuthFailure(ip) {
  const existing = wsAuthAttempts.get(ip);
  if (existing) {
    existing.count += 1;
  } else {
    wsAuthAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  }
}

function handleWsConnection(ws, req) {
  const remoteIp = req.socket.remoteAddress || 'unknown';
  let authenticated = false;
  let sessionTimeoutTimer = null;
  let currentTimeoutMins = 60; // Initial default session timeout is 1 hour (60 minutes)

  function startSessionTimer(mins) {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
    currentTimeoutMins = mins;
    if (mins > 0) {
      sessionTimeoutTimer = setTimeout(() => {
        try {
          ws.send(JSON.stringify({
            type: 'session_timeout',
            message: `Connection session timed out after ${mins} minute(s).`
          }));
          ws.close();
        } catch (e) { }
      }, mins * 60 * 1000);
    }
  }

  // Start initial default 1-hour automatic session timeout
  startSessionTimer(60);

  ws.on('close', () => {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const msgType = data.type;

      // Handle Authentication Handshake
      if (msgType === 'auth') {
        // Fix 2b: check lockout before evaluating PIN
        if (isWsAuthLocked(remoteIp)) {
          ws.close(4001, 'Too many failed auth attempts. Try again later.');
          return;
        }

        const clientCode = String(data.code || '').trim();
        if (clientCode === SERVER_PIN) {
          authenticated = true;
          ws.send(JSON.stringify({
            type: 'auth_result',
            status: 'success',
            message: 'Connected and Paired Successfully!',
            sessionTimeoutMins: currentTimeoutMins
          }));
        } else {
          recordWsAuthFailure(remoteIp);
          ws.send(JSON.stringify({
            type: 'auth_result',
            status: 'error',
            message: 'Incorrect Connect PIN. Please check server console.'
          }));
        }
        return;
      }

      // Fix 1: reject any non-auth message from an unauthenticated client
      if (!authenticated) {
        ws.close(4000, 'Unauthorized: authenticate first.');
        return;
      }

      if (msgType === 'set_session_timeout') {
        const mins = parseInt(data.timeoutMins, 10);
        if (!isNaN(mins) && mins >= 0) {
          startSessionTimer(mins);
          ws.send(JSON.stringify({
            type: 'session_timeout_updated',
            timeoutMins: mins
          }));
        }
      } else if (msgType === 'move') {
        moveMouseRelative(data.dx || 0, data.dy || 0);
      } else if (msgType === 'click') {
        mouseClick(data.button || 'left', data.action || 'click');
      } else if (msgType === 'scroll') {
        mouseScroll(data.dy || 0);
      } else if (msgType === 'text') {
        typeText(String(data.text || '').slice(0, 1000));
      } else if (msgType === 'key' || msgType === 'keycode') {
        pressSpecialKey(data.key || '');
      } else if (msgType === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp || 0 }));
      }
    } catch (err) {
      console.error('[!] WS message handler error:', err);
    }
  });
}

// WebSocket attached directly to HTTP Server (works on PORT_HTTP, PR-2 maxPayload 64KB)
const wssPrimary = new WebSocket.Server({ server: httpServer, maxPayload: 64 * 1024 });
wssPrimary.on('connection', (ws, req) => handleWsConnection(ws, req));

// Optional Secondary WebSocket listener on PORT_WS for legacy clients
if (PORT_WS !== PORT_HTTP) {
  try {
    const wssSecondary = new WebSocket.Server({ port: PORT_WS, maxPayload: 64 * 1024 });
    wssSecondary.on('connection', (ws, req) => handleWsConnection(ws, req));
    wssSecondary.on('connection', (ws, req) => handleWsConnection(ws, req));
    wssSecondary.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        // Secondary port busy; primary WS on port 5000 remains active
      } else {
        console.error('[!] Secondary WS server error:', e);
      }
    });
  } catch (e) {
    console.error('[!] Failed to start secondary WS server:', e);
  }
}

httpServer.listen(PORT_HTTP, () => {
  const netInterfaces = getNetworkInterfacesList();
  const localIP = getPrimaryIP();
  const quickLink = `http://${localIP}:${PORT_HTTP}/?ip=${localIP}&port=${PORT_HTTP}&code=${SERVER_PIN}`;
  const qrImageLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(quickLink)}`;

  console.log('================================================================');
  console.log('        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE');
  console.log('================================================================');
  console.log(`  [+] Mobile IP (Wi-Fi):       ${localIP}`);
  console.log(`  [+] Web & WS Port:           ${PORT_HTTP}`);
  console.log(`  [*] CONNECT CODE (PIN):      ${SERVER_PIN}`);
  console.log(`  [+] File Transfer Directory: ${TRANSFER_DIR}`);
  console.log('================================================================');
  console.log('  [SCAN ME] QR CODE FOR MOBILE INSTANT CONNECT:');
  qrcode.toString(quickLink, { type: 'terminal', small: true }, (err, qrStr) => {
    if (!err && qrStr) {
      console.log(qrStr);
      console.log('================================================================');
      console.log('  - Press U for the uploading');
      console.log('  - Press O for the save');
      console.log('================================================================');
    }
  });
});

httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[!] Error: Port ${PORT_HTTP} is already in use by another process.`);
    console.error(`[!] Suggestion: Run with --port=${PORT_HTTP + 10} to start on an open port.`);
  }
});

// --- Terminal Controls ---
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if ((key.ctrl && key.name === 'c') || key.name === 'q') {
    process.exit();
  } else if (key.name === 'o' || key.name === 's') {
    require('child_process').exec(`start "" "${TRANSFER_DIR}"`);
    console.log(`\n[*] Opened File Transfer Directory to view/save files: ${TRANSFER_DIR}`);
  } else if (key.name === 'u') {
    const psCommand = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select files to send to mobile'; $f.Multiselect = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileNames -join '|' }`;
    const { exec } = require('child_process');
    exec(`powershell -sta -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, (err, stdout) => {
      if (!err && stdout.trim()) {
        const files = stdout.trim().split('|');
        files.forEach(file => {
          if (fs.existsSync(file)) {
            const fileName = path.basename(file);
            const targetPath = getSafeFilePath(fileName);
            fs.copyFileSync(file, targetPath);
            console.log(`\n[+] Uploaded to PC Transfer section: ${path.basename(targetPath)}`);
            console.log(`    -> Tap 'Refresh List' on your phone to download it!`);
          }
        });
      }
    });
  }
});


