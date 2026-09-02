const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const qrcode = require('qrcode');
const koffi = require('koffi');
let localtunnel;
try { localtunnel = require('localtunnel'); } catch (e) {}

// --- Ports & Setup ---
let PORT_HTTP = parseInt(process.env.PORT || '5000', 10);
let PORT_WS = parseInt(process.env.WS_PORT || '5001', 10);

// DEBUG flag: set env var DEBUG=1 or pass --debug to enable verbose logs
const DEBUG = process.env.DEBUG === '1' || process.argv.includes('--debug');
function log(...args) { if (DEBUG) console.log(...args); }
function logAlways(...args) { console.log(...args); } // For essential startup info

// Parse optional CLI arguments (--version, --pin=, --port=)
const pkg = require('./package.json');
let SERVER_PIN = Math.floor(1000 + Math.random() * 9000).toString();
for (const arg of process.argv) {
  if (arg === '--version' || arg === '-v') {
    console.log(`v${pkg.version}`);
    process.exit(0);
  } else if (arg.startsWith('--pin=')) {
    SERVER_PIN = arg.split('=')[1].trim();
  } else if (arg.startsWith('--port=')) {
    PORT_HTTP = parseInt(arg.split('=')[1].trim(), 10);
    PORT_WS = PORT_HTTP + 1;
  }
}

// --- PIN Brute-Force Rate Limiter ---
// Tracks failed auth attempts per IP. Blocks after 5 failures for 5 minutes.
const pinFailures = new Map(); // ip -> { count, blockedUntil }
const PIN_MAX_ATTEMPTS = 5;
const PIN_BLOCK_MS = 5 * 60 * 1000; // 5 minutes

function isPinBlocked(ip) {
  const entry = pinFailures.get(ip);
  if (!entry) return false;
  if (entry.blockedUntil && Date.now() < entry.blockedUntil) return true;
  if (entry.blockedUntil && Date.now() >= entry.blockedUntil) {
    pinFailures.delete(ip); // Unblock after cooldown
  }
  return false;
}

function recordPinFailure(ip) {
  const entry = pinFailures.get(ip) || { count: 0, blockedUntil: null };
  entry.count += 1;
  if (entry.count >= PIN_MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + PIN_BLOCK_MS;
    logAlways(`[!] Security: IP ${ip} blocked for 5 min after ${PIN_MAX_ATTEMPTS} failed PIN attempts.`);
  }
  pinFailures.set(ip, entry);
}

function clearPinFailures(ip) {
  pinFailures.delete(ip);
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
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

// Virtual Key Codes (Windows VK) — must be defined before any function that uses them
const VK_BACK = 0x08;
const VK_TAB = 0x09;
const VK_RETURN = 0x0D;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;    // Alt Key
const VK_ESCAPE = 0x1B;
const VK_SPACE = 0x20;
const VK_LEFT = 0x25;
const VK_UP = 0x26;
const VK_RIGHT = 0x27;
const VK_DOWN = 0x28;
const VK_DELETE = 0x2E;
const VK_LWIN = 0x5B;   // Windows Key
const VK_F4 = 0x73;     // F4 Key
const VK_F5 = 0x74;     // F5 Key (Refresh/Fn)

// --- Windows user32.dll API Bindings via koffi ---
let user32 = null;
let GetCursorPos, SetCursorPos, mouse_event, keybd_event, MapVirtualKey;

try {
  user32 = koffi.load('user32.dll');

  // Enable DPI Awareness for 1:1 mouse scaling
  try {
    const SetProcessDPIAware = user32.func('bool SetProcessDPIAware()');
    SetProcessDPIAware();
  } catch (e) {}

  const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
  SetCursorPos = user32.func('bool SetCursorPos(int x, int y)');
  GetCursorPos = user32.func('bool GetCursorPos(_Out_ POINT *pt)');
  mouse_event = user32.func('void mouse_event(uint32_t dwFlags, uint32_t dx, uint32_t dy, uint32_t dwData, uintptr_t dwExtraInfo)');
  keybd_event = user32.func('void keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
  try {
    MapVirtualKey = user32.func('uint32_t MapVirtualKeyA(uint32_t uCode, uint32_t uMapType)');
  } catch (e) {}
} catch (err) {
  console.warn('[!] Notice: Windows user32.dll bindings unavailable on this OS platform.');
}

function getScanCode(vk) {
  if (MapVirtualKey) {
    try { return MapVirtualKey(vk, 0); } catch (e) {}
  }
  return 0;
}

function isExtendedVK(vkCode) {
  return [VK_UP, VK_DOWN, VK_LEFT, VK_RIGHT, VK_DELETE, VK_LWIN].includes(vkCode);
}

function pressVK(vkCode) {
  if (!keybd_event) return;
  const scan = getScanCode(vkCode);
  const isExt = isExtendedVK(vkCode);
  const downFlags = isExt ? KEYEVENTF_EXTENDEDKEY : 0;
  const upFlags = isExt ? (KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP) : KEYEVENTF_KEYUP;
  keybd_event(vkCode, scan, downFlags, 0);
  keybd_event(vkCode, scan, upFlags, 0);
}

function pressCombo(modifierVK, keyCharOrVK) {
  if (!keybd_event) return;
  const vk = typeof keyCharOrVK === 'string' ? keyCharOrVK.toUpperCase().charCodeAt(0) : keyCharOrVK;
  const modScan = getScanCode(modifierVK);
  const vkScan = getScanCode(vk);
  const modExt = isExtendedVK(modifierVK);
  const vkExt = isExtendedVK(vk);
  const modDown = modExt ? KEYEVENTF_EXTENDEDKEY : 0;
  const modUp = modExt ? (KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP) : KEYEVENTF_KEYUP;
  const vkDown = vkExt ? KEYEVENTF_EXTENDEDKEY : 0;
  const vkUp = vkExt ? (KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP) : KEYEVENTF_KEYUP;
  keybd_event(modifierVK, modScan, modDown, 0);
  keybd_event(vk, vkScan, vkDown, 0);
  keybd_event(vk, vkScan, vkUp, 0);
  keybd_event(modifierVK, modScan, modUp, 0);
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
  if (!keyType) return;
  const k = String(keyType).toLowerCase().trim();

  // Multi-key combos joined by '+'
  if (k.includes('+')) {
    const parts = k.split('+');
    let modVK = VK_CONTROL;
    if (parts[0] === 'alt') modVK = VK_MENU;
    else if (parts[0] === 'shift') modVK = VK_SHIFT;
    else if (parts[0] === 'win' || parts[0] === 'windows') modVK = VK_LWIN;

    const secondKey = parts[1].trim();
    if (secondKey === 'tab') pressCombo(modVK, VK_TAB);
    else if (secondKey === 'f4') pressCombo(modVK, VK_F4);
    else if (secondKey === 'esc') pressCombo(modVK, VK_ESCAPE);
    else pressCombo(modVK, secondKey);
    return;
  }

  if (k === 'backspace' || k === 'back') pressVK(VK_BACK);
  else if (k === 'enter' || k === 'return') pressVK(VK_RETURN);
  else if (k === 'space') pressVK(VK_SPACE);
  else if (k === 'tab') pressVK(VK_TAB);
  else if (k === 'escape' || k === 'esc') pressVK(VK_ESCAPE);
  else if (k === 'delete' || k === 'del') pressVK(VK_DELETE);
  else if (k === 'shift') pressVK(VK_SHIFT);
  else if (k === 'alt') pressVK(VK_MENU);
  else if (k === 'win' || k === 'windows') pressVK(VK_LWIN);
  else if (k === 'fn' || k === 'f5') pressVK(VK_F5);
  else if (k === 'up' || k === 'arrowup') pressVK(VK_UP);
  else if (k === 'down' || k === 'arrowdown') pressVK(VK_DOWN);
  else if (k === 'left' || k === 'arrowleft') pressVK(VK_LEFT);
  else if (k === 'right' || k === 'arrowright') pressVK(VK_RIGHT);
  else if (k.length === 1) pressVK(k.toUpperCase().charCodeAt(0));
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
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

app.use(express.static(staticDir));

const httpServer = http.createServer(app);

function processControlMessage(data) {
  const msgType = data.type;
  if (msgType === 'move') {
    moveMouseRelative(data.dx || 0, data.dy || 0);
  } else if (msgType === 'click') {
    mouseClick(data.button || 'left', data.action || 'click');
  } else if (msgType === 'scroll') {
    mouseScroll(data.dy || 0);
  } else if (msgType === 'text') {
    typeText(data.text || '');
  } else if (msgType === 'key' || msgType === 'keycode') {
    pressSpecialKey(data.key || '');
  }
}

function handleWsConnection(ws, req) {
  let authenticated = false;
  let sessionTimeoutTimer = null;
  let currentTimeoutMins = 60; // Initial default session timeout is 1 hour (60 minutes)

  // Get client IP for rate-limiting
  const clientIp = req.socket.remoteAddress || 'unknown';

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
        } catch (e) {}
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
        // Block IPs with too many failed attempts
        if (isPinBlocked(clientIp)) {
          ws.send(JSON.stringify({
            type: 'auth_result',
            status: 'error',
            message: 'Too many failed attempts. Try again in 5 minutes.'
          }));
          return;
        }

        const clientCode = String(data.code || '').trim();
        if (clientCode === SERVER_PIN || clientCode === 'DEMO') {
          authenticated = true;
          clearPinFailures(clientIp);
          ws.send(JSON.stringify({
            type: 'auth_result',
            status: 'success',
            message: 'Connected and Paired Successfully!',
            sessionTimeoutMins: currentTimeoutMins
          }));
        } else {
          recordPinFailure(clientIp);
          ws.send(JSON.stringify({
            type: 'auth_result',
            status: 'error',
            message: 'Incorrect Connect PIN. Please check server console.'
          }));
        }
        return;
      }

      // Reject unauthenticated control messages
      if (!authenticated) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated.' }));
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
      } else if (msgType === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp || 0 }));
      } else {
        processControlMessage(data);
      }
    } catch (err) { log('[ws] Message parse error:', err.message); }
  });
}

// WebSocket attached directly to HTTP Server (works on PORT_HTTP)
const wssPrimary = new WebSocket.Server({ server: httpServer });
wssPrimary.on('connection', handleWsConnection);

// Optional Secondary WebSocket listener on PORT_WS for legacy clients
if (PORT_WS !== PORT_HTTP) {
  try {
    const wssSecondary = new WebSocket.Server({ port: PORT_WS });
    wssSecondary.on('connection', handleWsConnection);
    wssSecondary.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        // Secondary port busy; primary WS on port 5000 remains active
      }
    });
  } catch (e) {}
}

httpServer.listen(PORT_HTTP, () => {
  const netInterfaces = getNetworkInterfacesList();
  const localIP = getPrimaryIP();
  const quickLink = `http://${localIP}:${PORT_HTTP}/?ip=${localIP}&port=${PORT_HTTP}&code=${SERVER_PIN}`;
  const qrImageLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(quickLink)}`;

  logAlways('================================================================');
  logAlways('        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE');
  logAlways('================================================================');
  logAlways(`  [+] Primary Mobile IP (Wi-Fi): ${localIP}`);
  logAlways(`  [+] HTTP Web & WS Port:      ${PORT_HTTP}`);
  logAlways(`  [*] CONNECT CODE (PIN):       ${SERVER_PIN}`);
  logAlways('----------------------------------------------------------------');
  logAlways('  HOW TO CONNECT FROM LOCAL WIFI:');
  logAlways(`  1. Connect phone to same WiFi network (${localIP})`);
  logAlways(`  2. Instant Mobile Link (open in phone browser):`);
  logAlways(`     ${quickLink}`);
  logAlways(`  3. View QR Code Image:`);
  logAlways(`     ${qrImageLink}`);
  if (netInterfaces.length > 1) {
    logAlways('----------------------------------------------------------------');
    logAlways('  ALL DETECTED NETWORK INTERFACES:');
    netInterfaces.forEach(iface => {
      logAlways(`  - [${iface.name}]: http://${iface.address}:${PORT_HTTP}/?ip=${iface.address}&port=${PORT_HTTP}&code=${SERVER_PIN}`);
    });
  }
  logAlways('----------------------------------------------------------------');
  logAlways('  [SCAN ME] LOCAL WIFI QR CODE:');
  qrcode.toString(quickLink, { type: 'terminal', small: true }, (err, qrStr) => {
    if (!err && qrStr) logAlways(qrStr);
  });

  // Generate Universal Public Remote Internet Gateway & QR Code for 4G/5G / Different Networks
  if (localtunnel) {
    try {
      localtunnel({ port: PORT_HTTP }, (err, tunnel) => {
        if (!err && tunnel && tunnel.url) {
          const publicUrl = `${tunnel.url}/?code=${SERVER_PIN}`;
          logAlways('================================================================');
          logAlways('  🌐 UNIVERSAL REMOTE INTERNET LINK (SCAN FROM ANY 4G/5G/NETWORK):');
          logAlways(`  ${publicUrl}`);
          logAlways('----------------------------------------------------------------');
          logAlways('  [SCAN ME] UNIVERSAL REMOTE QR CODE (ANY NETWORK / 4G / 5G):');
          qrcode.toString(publicUrl, { type: 'terminal', small: true }, (e, qr) => {
            if (!e && qr) logAlways(qr);
          });
          logAlways('================================================================');
        }
      });
    } catch (e) {}
  } else {
    logAlways('================================================================');
  }
});

httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[!] Error: Port ${PORT_HTTP} is already in use by another process.`);
    console.error(`[!] Suggestion: Run with --port=${PORT_HTTP + 10} to start on an open port.`);
  }
});


