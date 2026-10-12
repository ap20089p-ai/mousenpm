const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const qrcode = require('qrcode');
const koffi = require('koffi');
const rateLimit = require('express-rate-limit');
const { exec, execSync, execFile } = require('child_process');

// Platform identifier
const PLATFORM = process.platform; // 'win32' | 'darwin' | 'linux'

// Default to 5050 on macOS because macOS AirPlay Receiver occupies port 5000 by default
let defaultPort = PLATFORM === 'darwin' ? 5050 : 5000;
let PORT_HTTP = parseInt(process.env.PORT || String(defaultPort), 10);
let PORT_WS = parseInt(process.env.WS_PORT || String(PORT_HTTP + 1), 10);
let userCustomPort = !!process.env.PORT;

// Parse optional CLI arguments (--version, --pin=, --port=)
const pkg = require('./package.json');
let SERVER_PIN = Math.floor(1000 + Math.random() * 9000).toString();
let transferPathArg = null;
for (const arg of process.argv) {
  if (arg === '--version' || arg === '-v') {
    console.log(`v${pkg.version}`);
    process.exit(0);
  } else if (arg === '--help' || arg === '-h') {
    const osShort = PLATFORM === 'win32' ? 'Windows' : (PLATFORM === 'darwin' ? 'macOS' : 'Linux');
    const modKey = PLATFORM === 'darwin' ? 'Cmd' : 'Ctrl';
    console.log(`
mouse-vm v${pkg.version} — Wireless Mouse & Keyboard Server (Windows, macOS & Linux)

Usage:
  mouse-vm [options]   (aliases: vm2do, vm, virtual-mouse)

Options:
  --port=<n>           HTTP port (default: 5000). WS port = port + 1
  --pin=<xxxx>         Set a fixed 4-digit PIN (default: random)
  --transfer-path=<p>  Directory for file transfers (default: ./transfers)
  --version, -v        Print version and exit
  --help, -h           Show this help message

Keyboard Shortcuts (in server terminal):
  ${modKey}+S               Open file transfer folder in Explorer / Finder / File Manager
  ${modKey}+U               Open file picker to send files to mobile
  ${modKey}+V               Paste clipboard file or text into transfers
  Ctrl+C  or  q        Stop the server

Examples:
  mouse-vm
  mouse-vm --port=8080
  mouse-vm --pin=1234 --port=3000
  mouse-vm --transfer-path=${PLATFORM === 'win32' ? 'C:\\Users\\me\\Desktop\\files' : '~/Desktop/files'}

Install:
  npm install -g mouse-vm
`);
    process.exit(0);
  } else if (arg.startsWith('--pin=')) {
    SERVER_PIN = arg.split('=')[1].trim();
  } else if (arg.startsWith('--port=')) {
    PORT_HTTP = parseInt(arg.split('=')[1].trim(), 10);
    PORT_WS = PORT_HTTP + 1;
    userCustomPort = true;
  } else if (arg.startsWith('--transfer-path=')) {
    transferPathArg = arg.split('=')[1].trim();
  }
}

// Ensure transfer directory exists
const TRANSFER_DIR = transferPathArg ? path.resolve(transferPathArg) : path.join(__dirname, 'transfers');
if (!fs.existsSync(TRANSFER_DIR)) {
  fs.mkdirSync(TRANSFER_DIR, { recursive: true });
}

// ============================================================================
// --- SECTION 1: WINDOWS NATIVE DRIVER (user32.dll via koffi) ---
// ============================================================================
const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;

const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

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
const VK_LWIN = 0x5B;
const VK_F4 = 0x73;
const VK_F5 = 0x74;

let user32 = null;
let winGetCursorPos, winSetCursorPos, winMouseEvent, winKeybdEvent, winMapVirtualKeyA;

if (PLATFORM === 'win32') {
  try {
    user32 = koffi.load('user32.dll');
    try {
      const SetProcessDPIAware = user32.func('bool SetProcessDPIAware()');
      SetProcessDPIAware();
    } catch (e) { }

    const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
    winSetCursorPos = user32.func('bool SetCursorPos(int x, int y)');
    winGetCursorPos = user32.func('bool GetCursorPos(_Out_ POINT *pt)');
    winMouseEvent = user32.func('void mouse_event(uint32_t dwFlags, uint32_t dx, uint32_t dy, uint32_t dwData, uintptr_t dwExtraInfo)');
    winKeybdEvent = user32.func('void keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)');
    try {
      winMapVirtualKeyA = user32.func('uint32_t MapVirtualKeyA(uint32_t uCode, uint32_t uMapType)');
    } catch (e) { }
  } catch (err) {
    console.warn('[!] Notice: Windows user32.dll bindings unavailable:', err.message);
  }
}

function isExtendedVK(vkCode) {
  return vkCode === VK_LEFT || vkCode === VK_UP || vkCode === VK_RIGHT || vkCode === VK_DOWN || vkCode === VK_DELETE || vkCode === VK_LWIN;
}

function moveMouseRelativeWin(dx, dy) {
  if (winMouseEvent) {
    winMouseEvent(MOUSEEVENTF_MOVE, Math.round(dx), Math.round(dy), 0, 0);
  } else if (winGetCursorPos && winSetCursorPos) {
    const pt = {};
    if (winGetCursorPos(pt)) {
      winSetCursorPos(pt.x + Math.round(dx), pt.y + Math.round(dy));
    }
  }
}

function mouseClickWin(button = 'left', action = 'click') {
  if (!winMouseEvent) return;
  if (button === 'left') {
    if (action === 'down') winMouseEvent(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
    else if (action === 'up') winMouseEvent(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    else { winMouseEvent(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); winMouseEvent(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0); }
  } else if (button === 'right') {
    if (action === 'down') winMouseEvent(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
    else if (action === 'up') winMouseEvent(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
    else { winMouseEvent(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); winMouseEvent(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0); }
  } else if (button === 'middle') {
    if (action === 'down') winMouseEvent(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0);
    else if (action === 'up') winMouseEvent(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
    else { winMouseEvent(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0); winMouseEvent(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0); }
  }
}

function mouseScrollWin(dy) {
  if (!winMouseEvent) return;
  const wheelUnits = Math.round(dy * 30);
  winMouseEvent(MOUSEEVENTF_WHEEL, 0, 0, wheelUnits, 0);
}

function pressVKWin(vkCode) {
  if (!winKeybdEvent) return;
  const isExt = isExtendedVK(vkCode);
  const scan = winMapVirtualKeyA ? (winMapVirtualKeyA(vkCode, 0) & 0xFF) : 0;
  const flagsDown = isExt ? KEYEVENTF_EXTENDEDKEY : 0;
  const flagsUp = isExt ? (KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY) : KEYEVENTF_KEYUP;
  winKeybdEvent(vkCode, scan, flagsDown, 0);
  winKeybdEvent(vkCode, scan, flagsUp, 0);
}

function pressComboWin(modifierVK, keyCharOrVK) {
  if (!winKeybdEvent) return;
  const vk = typeof keyCharOrVK === 'string' ? keyCharOrVK.toUpperCase().charCodeAt(0) : keyCharOrVK;
  const isExt = isExtendedVK(vk);
  const scanMod = winMapVirtualKeyA ? (winMapVirtualKeyA(modifierVK, 0) & 0xFF) : 0;
  const scanVk = winMapVirtualKeyA ? (winMapVirtualKeyA(vk, 0) & 0xFF) : 0;
  const flagsDown = isExt ? KEYEVENTF_EXTENDEDKEY : 0;
  const flagsUp = isExt ? (KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY) : KEYEVENTF_KEYUP;

  winKeybdEvent(modifierVK, scanMod, 0, 0);
  winKeybdEvent(vk, scanVk, flagsDown, 0);
  winKeybdEvent(vk, scanVk, flagsUp, 0);
  winKeybdEvent(modifierVK, scanMod, KEYEVENTF_KEYUP, 0);
}

function pressTripleComboWin(mod1, mod2, keyCharOrVK) {
  if (!winKeybdEvent) return;
  const vk = typeof keyCharOrVK === 'string' ? keyCharOrVK.toUpperCase().charCodeAt(0) : keyCharOrVK;
  const isExt = isExtendedVK(vk);
  const scanMod1 = winMapVirtualKeyA ? (winMapVirtualKeyA(mod1, 0) & 0xFF) : 0;
  const scanMod2 = winMapVirtualKeyA ? (winMapVirtualKeyA(mod2, 0) & 0xFF) : 0;
  const scanVk = winMapVirtualKeyA ? (winMapVirtualKeyA(vk, 0) & 0xFF) : 0;
  const flagsDown = isExt ? KEYEVENTF_EXTENDEDKEY : 0;
  const flagsUp = isExt ? (KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY) : KEYEVENTF_KEYUP;

  winKeybdEvent(mod1, scanMod1, 0, 0);
  winKeybdEvent(mod2, scanMod2, 0, 0);
  winKeybdEvent(vk, scanVk, flagsDown, 0);
  winKeybdEvent(vk, scanVk, flagsUp, 0);
  winKeybdEvent(mod2, scanMod2, KEYEVENTF_KEYUP, 0);
  winKeybdEvent(mod1, scanMod1, KEYEVENTF_KEYUP, 0);
}

function typeTextWin(text) {
  if (!winKeybdEvent) return;
  for (const char of text) {
    if (char === '\n') { pressVKWin(VK_RETURN); continue; }
    if (char === '\t') { pressVKWin(VK_TAB); continue; }
    const code = char.charCodeAt(0);
    winKeybdEvent(0, code, KEYEVENTF_UNICODE, 0);
    winKeybdEvent(0, code, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0);
  }
}

let isWinAltHeldForTab = false;
let winAltTabReleaseTimer = null;

function releaseAltTabWin() {
  if (winAltTabReleaseTimer) {
    clearTimeout(winAltTabReleaseTimer);
    winAltTabReleaseTimer = null;
  }
  if (isWinAltHeldForTab) {
    if (winKeybdEvent) {
      winKeybdEvent(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    }
    isWinAltHeldForTab = false;
  }
}

function stepAltTabWin(direction = 'next') {
  if (!winKeybdEvent) return;
  if (!isWinAltHeldForTab) {
    winKeybdEvent(VK_MENU, 0, 0, 0); // Hold Alt down
    isWinAltHeldForTab = true;
  }
  if (direction === 'prev') {
    winKeybdEvent(VK_SHIFT, 0, 0, 0);
    winKeybdEvent(VK_TAB, 0, 0, 0);
    winKeybdEvent(VK_TAB, 0, KEYEVENTF_KEYUP, 0);
    winKeybdEvent(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
  } else {
    winKeybdEvent(VK_TAB, 0, 0, 0);
    winKeybdEvent(VK_TAB, 0, KEYEVENTF_KEYUP, 0);
  }
  if (winAltTabReleaseTimer) clearTimeout(winAltTabReleaseTimer);
  winAltTabReleaseTimer = setTimeout(() => {
    releaseAltTabWin();
  }, 2200);
}

function pressSpecialKeyWin(keyType) {
  const k = keyType.toLowerCase().trim();
  if (k === 'backspace') pressVKWin(VK_BACK);
  else if (k === 'enter' || k === 'return') pressVKWin(VK_RETURN);
  else if (k === 'space') pressVKWin(VK_SPACE);
  else if (k === 'tab') pressVKWin(VK_TAB);
  else if (k === 'escape' || k === 'esc') pressVKWin(VK_ESCAPE);
  else if (k === 'delete') pressVKWin(VK_DELETE);
  else if (k === 'shift') pressVKWin(VK_SHIFT);
  else if (k === 'alt') pressVKWin(VK_MENU);
  else if (k === 'win' || k === 'windows') pressVKWin(VK_LWIN);
  else if (k === 'fn' || k === 'f5') pressVKWin(VK_F5);
  else if (k === 'up' || k === 'arrowup') pressVKWin(VK_UP);
  else if (k === 'down' || k === 'arrowdown') pressVKWin(VK_DOWN);
  else if (k === 'left' || k === 'arrowleft') pressVKWin(VK_LEFT);
  else if (k === 'right' || k === 'arrowright') pressVKWin(VK_RIGHT);
  else if (k === 'ctrl+a' || k === 'selectall') pressComboWin(VK_CONTROL, 'A');
  else if (k === 'ctrl+c' || k === 'copy') pressComboWin(VK_CONTROL, 'C');
  else if (k === 'ctrl+v' || k === 'paste') pressComboWin(VK_CONTROL, 'V');
  else if (k === 'ctrl+z' || k === 'undo') pressComboWin(VK_CONTROL, 'Z');
  else if (k === 'ctrl+y' || k === 'redo') pressComboWin(VK_CONTROL, 'Y');
  else if (k === 'ctrl+s' || k === 'save') pressComboWin(VK_CONTROL, 'S');
  else if (k === 'win+shift+s' || k === 'snip') pressTripleComboWin(VK_LWIN, VK_SHIFT, 'S');
  else if (k === 'alt+tab') stepAltTabWin('next');
  else if (k === 'alt+f4') pressComboWin(VK_MENU, VK_F4);
  else if (k === 'alt+space') pressComboWin(VK_MENU, VK_SPACE);
}

// ============================================================================
// --- SECTION 2: MACOS NATIVE DRIVER (CoreGraphics via koffi) ---
// ============================================================================
const MAC_VK = {
  A: 0x00, S: 0x01, D: 0x02, F: 0x03, H: 0x04, G: 0x05, Z: 0x06, X: 0x07,
  C: 0x08, V: 0x09, B: 0x0B, Q: 0x0C, W: 0x0D, E: 0x0E, R: 0x0F, Y: 0x10,
  T: 0x11, KEY_1: 0x12, KEY_2: 0x13, KEY_3: 0x14, KEY_4: 0x15,
  RETURN: 0x24, TAB: 0x30, SPACE: 0x31, BACKSPACE: 0x33, ESCAPE: 0x35,
  COMMAND: 0x37, SHIFT: 0x38, OPTION: 0x3A, CONTROL: 0x3B,
  FN: 0x3F, F5: 0x60, DELETE: 0x75, F4: 0x76,
  LEFT: 0x7B, RIGHT: 0x7C, DOWN: 0x7D, UP: 0x7E
};

const MAC_FLAGS = {
  COMMAND: 0x00100000n,
  SHIFT:   0x00020000n,
  OPTION:  0x00080000n,
  CONTROL: 0x00040000n
};

let cg = null;
let CGEventCreate, CGEventGetLocation, CGWarpMouseCursorPosition, CGEventCreateMouseEvent;
let CGEventCreateScrollWheelEvent, CGEventCreateKeyboardEvent, CGEventKeyboardSetUnicodeString;
let CGEventSetFlags, CGEventPost, CFRelease;
let isMacLeftDown = false;
let isMacRightDown = false;
let isMacMiddleDown = false;
let isMacCmdHeldForTab = false;
let macCmdTabReleaseTimer = null;

if (PLATFORM === 'darwin') {
  try {
    cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });
    const CGEventRef = koffi.pointer('CGEventRef', koffi.opaque());
    const CGEventSourceRef = koffi.pointer('CGEventSourceRef', koffi.opaque());

    CGEventCreate = cg.func('CGEventRef CGEventCreate(CGEventSourceRef source)');
    CGEventGetLocation = cg.func('CGPoint CGEventGetLocation(CGEventRef event)');
    CGWarpMouseCursorPosition = cg.func('int CGWarpMouseCursorPosition(CGPoint newCursorPosition)');
    CGEventCreateMouseEvent = cg.func('CGEventRef CGEventCreateMouseEvent(CGEventSourceRef source, uint32_t mouseType, CGPoint mouseCursorPosition, uint32_t mouseButton)');
    CGEventCreateScrollWheelEvent = cg.func('CGEventRef CGEventCreateScrollWheelEvent(CGEventSourceRef source, uint32_t units, uint32_t wheelCount, int32_t wheel1)');
    CGEventCreateKeyboardEvent = cg.func('CGEventRef CGEventCreateKeyboardEvent(CGEventSourceRef source, uint16_t virtualKey, bool keyDown)');
    CGEventKeyboardSetUnicodeString = cg.func('void CGEventKeyboardSetUnicodeString(CGEventRef event, uint32_t stringLength, const uint16_t *unicodeString)');
    CGEventSetFlags = cg.func('void CGEventSetFlags(CGEventRef event, uint64_t flags)');
    CGEventPost = cg.func('void CGEventPost(uint32_t tap, CGEventRef event)');
    CFRelease = cg.func('void CFRelease(void *cf)');

    // Check accessibility status
    try {
      const as = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');
      const AXIsProcessTrusted = as.func('bool AXIsProcessTrusted()');
      if (!AXIsProcessTrusted()) {
        console.warn('\n[!] Notice for macOS users:');
        console.warn('    Accessibility permission is required for synthetic mouse clicks and keyboard typing.');
        console.warn('    Please check: System Settings -> Privacy & Security -> Accessibility');
        console.warn('    and enable your Terminal / Node / IDE application.\n');
      }
    } catch (e) { }
  } catch (err) {
    console.warn('[!] CoreGraphics native library unavailable on macOS:', err.message);
  }
}

function moveMouseRelativeMac(dx, dy) {
  if (!cg) return;
  const ev = CGEventCreate(null);
  if (!ev) return;
  const loc = CGEventGetLocation(ev);
  CFRelease(ev);

  const target = {
    x: Math.round(loc.x + dx),
    y: Math.round(loc.y + dy)
  };
  CGWarpMouseCursorPosition(target);

  let dragType = 5; // kCGEventMouseMoved
  let mouseBtn = 0;
  if (isMacLeftDown) {
    dragType = 6; // kCGEventLeftMouseDragged
    mouseBtn = 0;
  } else if (isMacRightDown) {
    dragType = 7; // kCGEventRightMouseDragged
    mouseBtn = 1;
  } else if (isMacMiddleDown) {
    dragType = 27; // kCGEventOtherMouseDragged
    mouseBtn = 2;
  }

  const moveEv = CGEventCreateMouseEvent(null, dragType, target, mouseBtn);
  if (moveEv) {
    CGEventPost(0, moveEv);
    CFRelease(moveEv);
  }
}

function mouseClickMac(button = 'left', action = 'click') {
  if (!cg) return;
  const ev = CGEventCreate(null);
  const loc = ev ? CGEventGetLocation(ev) : { x: 0, y: 0 };
  if (ev) CFRelease(ev);

  let downType, upType, mouseBtn;
  if (button === 'left') {
    downType = 1; upType = 2; mouseBtn = 0;
    if (action === 'down') isMacLeftDown = true;
    else if (action === 'up') isMacLeftDown = false;
  } else if (button === 'right') {
    downType = 3; upType = 4; mouseBtn = 1;
    if (action === 'down') isMacRightDown = true;
    else if (action === 'up') isMacRightDown = false;
  } else {
    downType = 25; upType = 26; mouseBtn = 2;
    if (action === 'down') isMacMiddleDown = true;
    else if (action === 'up') isMacMiddleDown = false;
  }

  if (action === 'down' || action === 'click') {
    const downEv = CGEventCreateMouseEvent(null, downType, loc, mouseBtn);
    if (downEv) {
      CGEventPost(0, downEv);
      CFRelease(downEv);
    }
  }
  if (action === 'up' || action === 'click') {
    const upEv = CGEventCreateMouseEvent(null, upType, loc, mouseBtn);
    if (upEv) {
      CGEventPost(0, upEv);
      CFRelease(upEv);
    }
    if (action === 'click') {
      if (button === 'left') isMacLeftDown = false;
      else if (button === 'right') isMacRightDown = false;
      else isMacMiddleDown = false;
    }
  }
}

function mouseScrollMac(dy) {
  if (!cg) return;
  const wheelUnits = Math.round(dy * 3);
  const scrollEv = CGEventCreateScrollWheelEvent(null, 0 /* kCGScrollEventUnitPixel */, 1, wheelUnits);
  if (scrollEv) {
    CGEventPost(0, scrollEv);
    CFRelease(scrollEv);
  }
}

function pressMacVK(vkCode) {
  if (!cg) return;
  const down = CGEventCreateKeyboardEvent(null, vkCode, true);
  if (down) {
    CGEventPost(0, down);
    CFRelease(down);
  }
  const up = CGEventCreateKeyboardEvent(null, vkCode, false);
  if (up) {
    CGEventPost(0, up);
    CFRelease(up);
  }
}

function pressMacCombo(modifierFlag, vkCode) {
  if (!cg) return;
  const down = CGEventCreateKeyboardEvent(null, vkCode, true);
  if (down) {
    CGEventSetFlags(down, BigInt(modifierFlag));
    CGEventPost(0, down);
    CFRelease(down);
  }
  const up = CGEventCreateKeyboardEvent(null, vkCode, false);
  if (up) {
    CGEventSetFlags(up, BigInt(modifierFlag));
    CGEventPost(0, up);
    CFRelease(up);
  }
}

function typeMacText(text) {
  if (!cg) return;
  for (const char of text) {
    if (char === '\n') { pressMacVK(MAC_VK.RETURN); continue; }
    if (char === '\t') { pressMacVK(MAC_VK.TAB); continue; }
    const buf = Buffer.from(char, 'utf16le');
    const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2);

    const downEv = CGEventCreateKeyboardEvent(null, 0, true);
    if (downEv) {
      CGEventKeyboardSetUnicodeString(downEv, u16.length, u16);
      CGEventPost(0, downEv);
      CFRelease(downEv);
    }
    const upEv = CGEventCreateKeyboardEvent(null, 0, false);
    if (upEv) {
      CGEventKeyboardSetUnicodeString(upEv, u16.length, u16);
      CGEventPost(0, upEv);
      CFRelease(upEv);
    }
  }
}

function releaseAltTabMac() {
  if (macCmdTabReleaseTimer) {
    clearTimeout(macCmdTabReleaseTimer);
    macCmdTabReleaseTimer = null;
  }
  if (isMacCmdHeldForTab) {
    const up = CGEventCreateKeyboardEvent(null, MAC_VK.COMMAND, false);
    if (up) {
      CGEventSetFlags(up, 0n);
      CGEventPost(0, up);
      CFRelease(up);
    }
    isMacCmdHeldForTab = false;
  }
}

function stepAltTabMac(direction = 'next') {
  if (!cg) return;
  if (!isMacCmdHeldForTab) {
    const down = CGEventCreateKeyboardEvent(null, MAC_VK.COMMAND, true);
    if (down) {
      CGEventSetFlags(down, MAC_FLAGS.COMMAND);
      CGEventPost(0, down);
      CFRelease(down);
    }
    isMacCmdHeldForTab = true;
  }

  const flags = direction === 'prev' ? (MAC_FLAGS.COMMAND | MAC_FLAGS.SHIFT) : MAC_FLAGS.COMMAND;
  const tabDown = CGEventCreateKeyboardEvent(null, MAC_VK.TAB, true);
  if (tabDown) {
    CGEventSetFlags(tabDown, flags);
    CGEventPost(0, tabDown);
    CFRelease(tabDown);
  }
  const tabUp = CGEventCreateKeyboardEvent(null, MAC_VK.TAB, false);
  if (tabUp) {
    CGEventSetFlags(tabUp, flags);
    CGEventPost(0, tabUp);
    CFRelease(tabUp);
  }

  if (macCmdTabReleaseTimer) clearTimeout(macCmdTabReleaseTimer);
  macCmdTabReleaseTimer = setTimeout(() => {
    releaseAltTabMac();
  }, 2200);
}

function pressSpecialKeyMac(keyType) {
  const k = keyType.toLowerCase().trim();
  if (k === 'backspace') pressMacVK(MAC_VK.BACKSPACE);
  else if (k === 'enter' || k === 'return') pressMacVK(MAC_VK.RETURN);
  else if (k === 'space') pressMacVK(MAC_VK.SPACE);
  else if (k === 'tab') pressMacVK(MAC_VK.TAB);
  else if (k === 'escape' || k === 'esc') pressMacVK(MAC_VK.ESCAPE);
  else if (k === 'delete') pressMacVK(MAC_VK.DELETE);
  else if (k === 'shift') pressMacVK(MAC_VK.SHIFT);
  else if (k === 'alt') pressMacVK(MAC_VK.OPTION);
  else if (k === 'win' || k === 'windows' || k === 'cmd' || k === 'command') pressMacVK(MAC_VK.COMMAND);
  else if (k === 'fn' || k === 'f5') pressMacVK(MAC_VK.F5);
  else if (k === 'up' || k === 'arrowup') pressMacVK(MAC_VK.UP);
  else if (k === 'down' || k === 'arrowdown') pressMacVK(MAC_VK.DOWN);
  else if (k === 'left' || k === 'arrowleft') pressMacVK(MAC_VK.LEFT);
  else if (k === 'right' || k === 'arrowright') pressMacVK(MAC_VK.RIGHT);
  else if (k === 'ctrl+a' || k === 'selectall') pressMacCombo(MAC_FLAGS.COMMAND, MAC_VK.A);
  else if (k === 'ctrl+c' || k === 'copy') pressMacCombo(MAC_FLAGS.COMMAND, MAC_VK.C);
  else if (k === 'ctrl+v' || k === 'paste') pressMacCombo(MAC_FLAGS.COMMAND, MAC_VK.V);
  else if (k === 'ctrl+z' || k === 'undo') pressMacCombo(MAC_FLAGS.COMMAND, MAC_VK.Z);
  else if (k === 'ctrl+y' || k === 'redo') pressMacCombo(MAC_FLAGS.COMMAND | MAC_FLAGS.SHIFT, MAC_VK.Z);
  else if (k === 'ctrl+s' || k === 'save') pressMacCombo(MAC_FLAGS.COMMAND, MAC_VK.S);
  else if (k === 'win+shift+s' || k === 'snip') pressMacCombo(MAC_FLAGS.COMMAND | MAC_FLAGS.SHIFT, MAC_VK.KEY_4);
  else if (k === 'alt+tab') stepAltTabMac('next');
  else if (k === 'alt+f4') pressMacCombo(MAC_FLAGS.COMMAND, MAC_VK.Q);
  else if (k === 'alt+space') pressMacCombo(MAC_FLAGS.COMMAND, MAC_VK.SPACE);
}

// ============================================================================
// --- SECTION 3: LINUX DRIVER (X11 / Xtst via koffi + xdotool fallback) ---
// ============================================================================
let x11 = null;
let xtst = null;
let xDisplay = null;
let XWarpPointer, XFlush, XTestFakeButtonEvent, XTestFakeKeyEvent, XKeysymToKeycode, XStringToKeysym;
let hasXdotool = false;
let hasYdotool = false;

const LINUX_KEYSYMS = {
  backspace: 0xFF08, enter: 0xFF0D, return: 0xFF0D, tab: 0xFF09, space: 0x0020,
  escape: 0xFF1B, esc: 0xFF1B, delete: 0xFFFF, shift: 0xFFE1, alt: 0xFFE9,
  win: 0xFFEB, windows: 0xFFEB, f4: 0xFFC1, f5: 0xFFC2, fn: 0xFFC2,
  left: 0xFF51, up: 0xFF52, right: 0xFF53, down: 0xFF54,
  arrowleft: 0xFF51, arrowup: 0xFF52, arrowright: 0xFF53, arrowdown: 0xFF54,
  ctrl: 0xFFE3
};

if (PLATFORM === 'linux') {
  try { execSync('which xdotool 2>/dev/null'); hasXdotool = true; } catch (e) { }
  try { execSync('which ydotool 2>/dev/null'); hasYdotool = true; } catch (e) { }

  const libX11Names = ['libX11.so.6', 'libX11.so', 'libX11.so.6.4.0'];
  for (const name of libX11Names) {
    try { x11 = koffi.load(name); break; } catch (e) { }
  }
  const libXtstNames = ['libXtst.so.6', 'libXtst.so', 'libXtst.so.6.1.0'];
  for (const name of libXtstNames) {
    try { xtst = koffi.load(name); break; } catch (e) { }
  }

  if (x11 && xtst) {
    try {
      const DisplayPtr = koffi.pointer('Display', koffi.opaque());
      const XOpenDisplay = x11.func('Display* XOpenDisplay(const char* display_name)');
      XWarpPointer = x11.func('int XWarpPointer(Display* display, uint64_t src_w, uint64_t dest_w, int src_x, int src_y, uint32_t src_width, uint32_t src_height, int dest_x, int dest_y)');
      XFlush = x11.func('int XFlush(Display* display)');
      XStringToKeysym = x11.func('uint64_t XStringToKeysym(const char* string)');
      XKeysymToKeycode = x11.func('uint8_t XKeysymToKeycode(Display* display, uint64_t keysym)');
      XTestFakeButtonEvent = xtst.func('int XTestFakeButtonEvent(Display* display, uint32_t button, int is_press, unsigned long delay)');
      XTestFakeKeyEvent = xtst.func('int XTestFakeKeyEvent(Display* display, uint32_t keycode, int is_press, unsigned long delay)');

      const dispEnv = process.env.DISPLAY || ':0';
      xDisplay = XOpenDisplay(dispEnv);
    } catch (e) {
      console.warn('[!] Linux X11/Xtst initialization error:', e.message);
    }
  }

  if (!xDisplay && !hasXdotool && !hasYdotool) {
    console.warn('\n[!] Notice for Linux users:');
    console.warn('    To enable virtual mouse and keyboard simulation, install either:');
    console.warn('    - libXtst:  sudo apt install libxtst6  (Debian/Ubuntu) or sudo dnf install libXtst (Fedora)');
    console.warn('    - xdotool:  sudo apt install xdotool  (Debian/Ubuntu) or sudo dnf install xdotool (Fedora)');
    console.warn('    - ydotool:  sudo apt install ydotool  (for Wayland desktop sessions)\n');
  }
}

function moveMouseRelativeLinux(dx, dy) {
  const rx = Math.round(dx);
  const ry = Math.round(dy);
  if (xDisplay && XWarpPointer && XFlush) {
    XWarpPointer(xDisplay, 0, 0, 0, 0, 0, 0, rx, ry);
    XFlush(xDisplay);
  } else if (hasXdotool) {
    execFile('xdotool', ['mousemove_relative', '--', String(rx), String(ry)], () => {});
  } else if (hasYdotool) {
    execFile('ydotool', ['mousemove', '--', String(rx), String(ry)], () => {});
  }
}

function mouseClickLinux(button = 'left', action = 'click') {
  let btnNum = 1; // 1 = left, 2 = middle, 3 = right
  if (button === 'right') btnNum = 3;
  else if (button === 'middle') btnNum = 2;

  if (xDisplay && XTestFakeButtonEvent && XFlush) {
    if (action === 'down') {
      XTestFakeButtonEvent(xDisplay, btnNum, 1, 0);
    } else if (action === 'up') {
      XTestFakeButtonEvent(xDisplay, btnNum, 0, 0);
    } else {
      XTestFakeButtonEvent(xDisplay, btnNum, 1, 0);
      XTestFakeButtonEvent(xDisplay, btnNum, 0, 0);
    }
    XFlush(xDisplay);
  } else if (hasXdotool) {
    const act = action === 'down' ? 'mousedown' : (action === 'up' ? 'mouseup' : 'click');
    execFile('xdotool', [act, String(btnNum)], () => {});
  } else if (hasYdotool) {
    const hexBtn = btnNum === 1 ? '0x110' : (btnNum === 3 ? '0x111' : '0x112');
    const act = action === 'down' ? '0x40' : (action === 'up' ? '0x80' : '0xC0');
    execFile('ydotool', ['click', `${act}${hexBtn}`], () => {});
  }
}

function mouseScrollLinux(dy) {
  const btnNum = dy > 0 ? 4 : 5; // In X11: 4 = up, 5 = down
  const steps = Math.max(1, Math.min(5, Math.round(Math.abs(dy))));

  if (xDisplay && XTestFakeButtonEvent && XFlush) {
    for (let i = 0; i < steps; i++) {
      XTestFakeButtonEvent(xDisplay, btnNum, 1, 0);
      XTestFakeButtonEvent(xDisplay, btnNum, 0, 0);
    }
    XFlush(xDisplay);
  } else if (hasXdotool) {
    for (let i = 0; i < steps; i++) {
      execFile('xdotool', ['click', String(btnNum)], () => {});
    }
  }
}

function pressLinuxKeysym(keysym) {
  if (xDisplay && XKeysymToKeycode && XTestFakeKeyEvent && XFlush) {
    const keycode = XKeysymToKeycode(xDisplay, BigInt(keysym));
    if (keycode > 0) {
      XTestFakeKeyEvent(xDisplay, keycode, 1, 0);
      XTestFakeKeyEvent(xDisplay, keycode, 0, 0);
      XFlush(xDisplay);
    }
  }
}

function typeTextLinux(text) {
  if (hasXdotool) {
    execFile('xdotool', ['type', '--', text], () => {});
  } else if (hasYdotool) {
    execFile('ydotool', ['type', '--', text], () => {});
  } else if (xDisplay && XKeysymToKeycode && XTestFakeKeyEvent && XFlush) {
    for (const char of text) {
      if (char === '\n') { pressLinuxKeysym(LINUX_KEYSYMS.enter); continue; }
      if (char === '\t') { pressLinuxKeysym(LINUX_KEYSYMS.tab); continue; }
      const code = char.charCodeAt(0);
      const keysym = code < 0x100 ? code : (0x01000000 + code);
      pressLinuxKeysym(keysym);
    }
  }
}

let isLinuxAltHeld = false;
let linuxAltTimer = null;

function releaseAltTabLinux() {
  if (linuxAltTimer) {
    clearTimeout(linuxAltTimer);
    linuxAltTimer = null;
  }
  if (isLinuxAltHeld) {
    if (hasXdotool) {
      execFile('xdotool', ['keyup', 'alt'], () => {});
    } else if (xDisplay && XKeysymToKeycode && XTestFakeKeyEvent && XFlush) {
      const code = XKeysymToKeycode(xDisplay, BigInt(LINUX_KEYSYMS.alt));
      XTestFakeKeyEvent(xDisplay, code, 0, 0);
      XFlush(xDisplay);
    }
    isLinuxAltHeld = false;
  }
}

function stepAltTabLinux(direction = 'next') {
  if (hasXdotool) {
    if (!isLinuxAltHeld) {
      execFile('xdotool', ['keydown', 'alt'], () => {});
      isLinuxAltHeld = true;
    }
    const tabKey = direction === 'prev' ? 'Shift+Tab' : 'Tab';
    execFile('xdotool', ['key', tabKey], () => {});
  } else if (xDisplay && XKeysymToKeycode && XTestFakeKeyEvent && XFlush) {
    const altCode = XKeysymToKeycode(xDisplay, BigInt(LINUX_KEYSYMS.alt));
    const tabCode = XKeysymToKeycode(xDisplay, BigInt(LINUX_KEYSYMS.tab));
    if (!isLinuxAltHeld) {
      XTestFakeKeyEvent(xDisplay, altCode, 1, 0);
      isLinuxAltHeld = true;
    }
    XTestFakeKeyEvent(xDisplay, tabCode, 1, 0);
    XTestFakeKeyEvent(xDisplay, tabCode, 0, 0);
    XFlush(xDisplay);
  }
  if (linuxAltTimer) clearTimeout(linuxAltTimer);
  linuxAltTimer = setTimeout(() => releaseAltTabLinux(), 2200);
}

function pressSpecialKeyLinux(keyType) {
  const k = keyType.toLowerCase().trim();
  if (LINUX_KEYSYMS[k]) {
    pressLinuxKeysym(LINUX_KEYSYMS[k]);
  } else if (hasXdotool) {
    if (k === 'ctrl+a' || k === 'selectall') execFile('xdotool', ['key', 'ctrl+a'], () => {});
    else if (k === 'ctrl+c' || k === 'copy') execFile('xdotool', ['key', 'ctrl+c'], () => {});
    else if (k === 'ctrl+v' || k === 'paste') execFile('xdotool', ['key', 'ctrl+v'], () => {});
    else if (k === 'ctrl+z' || k === 'undo') execFile('xdotool', ['key', 'ctrl+z'], () => {});
    else if (k === 'ctrl+y' || k === 'redo') execFile('xdotool', ['key', 'ctrl+y'], () => {});
    else if (k === 'ctrl+s' || k === 'save') execFile('xdotool', ['key', 'ctrl+s'], () => {});
    else if (k === 'win+shift+s' || k === 'snip') {
      exec('which gnome-screenshot 2>/dev/null && gnome-screenshot -a || which spectacle 2>/dev/null && spectacle -r || xdotool key Super+Shift+S', () => {});
    } else if (k === 'alt+tab') stepAltTabLinux('next');
    else if (k === 'alt+f4') execFile('xdotool', ['key', 'alt+F4'], () => {});
    else if (k === 'alt+space') execFile('xdotool', ['key', 'alt+space'], () => {});
    else execFile('xdotool', ['key', k], () => {});
  }
}

// ============================================================================
// --- SECTION 4: UNIFIED INPUT DISPATCHER ---
// ============================================================================
function moveMouseRelative(dx, dy) {
  if (PLATFORM === 'darwin') moveMouseRelativeMac(dx, dy);
  else if (PLATFORM === 'linux') moveMouseRelativeLinux(dx, dy);
  else moveMouseRelativeWin(dx, dy);
}

function mouseClick(button = 'left', action = 'click') {
  if (PLATFORM === 'darwin') mouseClickMac(button, action);
  else if (PLATFORM === 'linux') mouseClickLinux(button, action);
  else mouseClickWin(button, action);
}

function mouseScroll(dy) {
  if (PLATFORM === 'darwin') mouseScrollMac(dy);
  else if (PLATFORM === 'linux') mouseScrollLinux(dy);
  else mouseScrollWin(dy);
}

function typeText(text) {
  if (PLATFORM === 'darwin') typeMacText(text);
  else if (PLATFORM === 'linux') typeTextLinux(text);
  else typeTextWin(text);
}

function releaseAltTab() {
  if (PLATFORM === 'darwin') releaseAltTabMac();
  else if (PLATFORM === 'linux') releaseAltTabLinux();
  else releaseAltTabWin();
}

function stepAltTab(direction = 'next') {
  if (PLATFORM === 'darwin') stepAltTabMac(direction);
  else if (PLATFORM === 'linux') stepAltTabLinux(direction);
  else stepAltTabWin(direction);
}

function pressSpecialKey(keyType) {
  if (PLATFORM === 'darwin') pressSpecialKeyMac(keyType);
  else if (PLATFORM === 'linux') pressSpecialKeyLinux(keyType);
  else pressSpecialKeyWin(keyType);
}

// ============================================================================
// --- SECTION 5: CROSS-PLATFORM SYSTEM UTILITIES ---
// ============================================================================
function openFolder(folderPath) {
  if (PLATFORM === 'win32') {
    exec(`start "" "${folderPath.replace(/"/g, '""')}"`);
  } else if (PLATFORM === 'darwin') {
    exec(`open "${folderPath.replace(/"/g, '\\"')}"`);
  } else {
    exec(`xdg-open "${folderPath.replace(/"/g, '\\"')}"`);
  }
}

function openFile(filePath) {
  if (PLATFORM === 'win32') {
    exec(`start "" "${filePath.replace(/"/g, '""')}"`, (err) => {
      if (err) console.warn('[!] Auto-open on PC:', err.message);
    });
  } else if (PLATFORM === 'darwin') {
    exec(`open "${filePath.replace(/"/g, '\\"')}"`, (err) => {
      if (err) console.warn('[!] Auto-open on Mac:', err.message);
    });
  } else {
    exec(`xdg-open "${filePath.replace(/"/g, '\\"')}"`, (err) => {
      if (err) console.warn('[!] Auto-open on Linux:', err.message);
    });
  }
}

function copyImageToClipboard(filePath) {
  if (PLATFORM === 'win32') {
    const psClip = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; try { $img = [System.Drawing.Image]::FromFile('${filePath.replace(/'/g, "''")}'); [System.Windows.Forms.Clipboard]::SetImage($img); } catch {}`;
    const b64 = Buffer.from(psClip, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`, () => {});
  } else if (PLATFORM === 'darwin') {
    const script = `use framework "AppKit"\nuse scripting additions\nset filePath to "${filePath.replace(/"/g, '\\"')}"\nset img to (current application's NSImage's alloc()'s initWithContentsOfFile:filePath)\nif img is not missing value then\nset pb to current application's NSPasteboard's generalPasteboard()\npb's clearContents()\npb's writeObjects:{img}\nend if`;
    exec(`osascript -e ${JSON.stringify(script)}`, () => {});
  } else if (PLATFORM === 'linux') {
    exec(`which xclip 2>/dev/null && xclip -selection clipboard -t image/png -i "${filePath.replace(/"/g, '\\"')}"`, () => {});
  }
}

// --- Smart Local IP Discovery (Prioritizes Wi-Fi over Virtual Adapters) ---
function getNetworkInterfacesList() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    // Exclude virtual/tunnel network adapters that break phone connectivity over Wi-Fi
    if (lowerName.includes('virtualbox') || lowerName.includes('vmware') || lowerName.includes('wsl') ||
        lowerName.includes('vethernet') || lowerName.includes('loopback') ||
        lowerName.startsWith('utun') || lowerName.startsWith('awdl') || lowerName.startsWith('llw') ||
        lowerName.startsWith('ap') || lowerName.startsWith('docker') || lowerName.startsWith('veth') ||
        lowerName.startsWith('virbr') || lowerName.startsWith('br-')) {
      continue;
    }

    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        let score = 10;
        if (lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless') || lowerName === 'en0' || lowerName.startsWith('wl')) {
          score = 100;
        } else if (lowerName.includes('ethernet') || lowerName.startsWith('eth') || lowerName.startsWith('en')) {
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

function getPrimaryIPv6() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('virtualbox') || lowerName.includes('vmware') || lowerName.includes('wsl') ||
        lowerName.includes('vethernet') || lowerName.includes('loopback') ||
        lowerName.startsWith('utun') || lowerName.startsWith('awdl') || lowerName.startsWith('llw') ||
        lowerName.startsWith('ap') || lowerName.startsWith('docker') || lowerName.startsWith('veth') ||
        lowerName.startsWith('virbr') || lowerName.startsWith('br-')) {
      continue;
    }

    for (const net of interfaces[name]) {
      const family = typeof net.family === 'string' ? net.family : (net.family === 6 ? 'IPv6' : 'IPv4');
      if (family === 'IPv6' && !net.internal) {
        let score = 10;
        if (lowerName.includes('wi-fi') || lowerName.includes('wlan') || lowerName.includes('wireless') || lowerName === 'en0' || lowerName.startsWith('wl')) {
          score += 100;
        } else if (lowerName.includes('ethernet') || lowerName.startsWith('eth') || lowerName.startsWith('en')) {
          score += 50;
        }
        if (!net.address.toLowerCase().startsWith('fe80:')) {
          score += 200;
        }
        candidates.push({ address: net.address, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].address : null;
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

// --- Rate Limiter for API routes ---
const pinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' }
});

// PIN Auth Middleware for APIs
app.use('/api', pinLimiter, (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const remoteIp = req.socket.remoteAddress || req.ip || '';
  const isLocalhost = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1' || remoteIp.endsWith('127.0.0.1');
  const providedPin = req.headers['x-pin'] || req.query.pin;
  if (!isLocalhost && providedPin !== SERVER_PIN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }
  next();
});

// List Files
app.get('/api/files', async (req, res) => {
  try {
    const entries = await fs.promises.readdir(TRANSFER_DIR);
    const settled = await Promise.all(
      entries.map(async (name) => {
        try {
          const stat = await fs.promises.stat(path.join(TRANSFER_DIR, name));
          return stat.isFile() ? { name, size: stat.size, mtime: stat.mtime } : null;
        } catch {
          return null;
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
    if (res.headersSent) return;
    writeStream.end();

    const ext = path.extname(actualFileName).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(ext);
    const isPdf = ext === '.pdf';

    // Auto-open image or PDF and copy image to clipboard across all operating systems
    if (isImage) {
      copyImageToClipboard(targetPath);
      openFile(targetPath);
    } else if (isPdf) {
      openFile(targetPath);
    }

    console.log(`\n[+] Transferred ${isImage ? 'Original Image' : isPdf ? 'Original PDF' : 'File'} from phone: ${actualFileName}`);
    if (isImage) {
      console.log(`    -> Transferred & copied original image to Clipboard and opened on screen!`);
    } else if (isPdf) {
      console.log(`    -> Displaying original PDF on screen!`);
    }
    res.json({ success: true, filename: actualFileName, isImage, isPdf });
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

// --- WS Auth Brute-Force Lockout ---
const wsAuthAttempts = new Map();
const WS_MAX_ATTEMPTS = 5;
const WS_WINDOW_MS = 60 * 1000;

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
  let currentTimeoutMins = 0;

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

  startSessionTimer(0);

  ws.on('close', () => {
    releaseAltTab();
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const msgType = data.type;

      if (msgType === 'auth') {
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
      } else if (msgType === 'chat') {
        const chatText = String(data.text || '').trim();
        if (data.isAttachment) {
          console.log(`\n[+] Media/File Received: "${chatText}"`);
        } else {
          console.log(`\n[+] Text from Phone: "${chatText}"`);
          if (data.autoType !== false && chatText) {
            typeText(chatText.slice(0, 1000));
          }
        }
        ws.send(JSON.stringify({
          type: 'chat_ack',
          status: 'delivered',
          timestamp: Date.now()
        }));
      } else if (msgType === 'alt_tab_step') {
        stepAltTab(data.direction || 'next');
        const active = PLATFORM === 'darwin' ? isMacCmdHeldForTab : (PLATFORM === 'linux' ? isLinuxAltHeld : isWinAltHeldForTab);
        ws.send(JSON.stringify({
          type: 'alt_tab_status',
          active
        }));
      } else if (msgType === 'alt_tab_release') {
        releaseAltTab();
        ws.send(JSON.stringify({
          type: 'alt_tab_status',
          active: false
        }));
      } else if (msgType === 'key' || msgType === 'keycode') {
        const keyName = String(data.key || '').toLowerCase().trim();
        if (keyName === 'alt+tab') {
          stepAltTab('next');
          const active = PLATFORM === 'darwin' ? isMacCmdHeldForTab : (PLATFORM === 'linux' ? isLinuxAltHeld : isWinAltHeldForTab);
          ws.send(JSON.stringify({
            type: 'alt_tab_status',
            active
          }));
        } else {
          pressSpecialKey(data.key || '');
        }
      } else if (msgType === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp || 0 }));
      }
    } catch (err) {
      console.error('[!] WS message handler error:', err);
    }
  });
}

const wssPrimary = new WebSocket.Server({ server: httpServer, maxPayload: 64 * 1024 });
wssPrimary.on('connection', (ws, req) => {
  handleWsConnection(ws, req);
});
wssPrimary.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') {
    console.error('[!] Primary WS server error:', e.message);
  }
});

let wssSecondary = null;
function startSecondaryWS() {
  if (PORT_WS !== PORT_HTTP) {
    try {
      if (wssSecondary) {
        try { wssSecondary.close(); } catch (e) { }
      }
      wssSecondary = new WebSocket.Server({ port: PORT_WS, host: '0.0.0.0', maxPayload: 64 * 1024 });
      wssSecondary.on('connection', (ws, req) => handleWsConnection(ws, req));
      wssSecondary.on('error', (e) => {
        if (e.code !== 'EADDRINUSE') {
          console.error('[!] Secondary WS server error:', e.message);
        }
      });
    } catch (e) {
      console.error('[!] Failed to start secondary WS server:', e.message);
    }
  }
}

function startListening() {
  httpServer.removeAllListeners('listening');
  httpServer.listen(PORT_HTTP, () => {
    startSecondaryWS();
    const localIP = getPrimaryIP();
    const quickLink = `http://${localIP}:${PORT_HTTP}/?ip=${localIP}&port=${PORT_HTTP}&code=${SERVER_PIN}`;
    const osLabel = PLATFORM === 'win32' ? 'Windows' : (PLATFORM === 'darwin' ? 'macOS' : 'Linux');
    const modKey = PLATFORM === 'darwin' ? 'Cmd' : 'Ctrl';

    console.log('================================================================');
    console.log(`        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE (${osLabel})`);
    console.log('================================================================');
    console.log(`  [+] Web & WS Port:           ${PORT_HTTP}`);
    console.log(`  [*] CONNECT CODE (PIN):      ${SERVER_PIN}`);
    console.log(`  [+] File Transfer Directory: ${TRANSFER_DIR}`);
    console.log('================================================================');
    console.log('  [SCAN ME] QR CODE FOR MOBILE INSTANT CONNECT');
    console.log('================================================================');
    qrcode.toString(quickLink, { type: 'terminal', small: true }, (err, qrStr) => {
      if (!err && qrStr) {
        console.log(qrStr);
        console.log('================================================================');
      }
      console.log(`  - Press ${modKey}+U for file selection dialog`);
      console.log(`  - Press ${modKey}+V to paste copied file/text`);
      console.log(`  - Press ${modKey}+S to open save folder`);
      console.log('================================================================');
    });
  });
}

httpServer.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    if (!userCustomPort && PORT_HTTP < 5100) {
      console.warn(`[!] Notice: Port ${PORT_HTTP} is already in use (e.g. by macOS AirPlay Receiver or another instance).`);
      PORT_HTTP += 10;
      PORT_WS = PORT_HTTP + 1;
      console.log(`[*] Auto-switching to open port ${PORT_HTTP}...`);
      try { httpServer.close(); } catch (err) { }
      setTimeout(() => startListening(), 200);
      return;
    }
    console.error(`[!] Error: Port ${PORT_HTTP} is already in use by another process.`);
    console.error(`[!] Suggestion: Run with --port=${PORT_HTTP + 10} to start on an open port.`);
    process.exit(1);
  } else {
    console.error('[!] HTTP Server Error:', e.message);
  }
});

startListening();

function handleClipboardFiles(filesStr) {
  if (!filesStr) return;
  const files = filesStr.split('|').map(s => s.trim()).filter(Boolean);
  let count = 0;
  files.forEach(file => {
    if (fs.existsSync(file)) {
      const fileName = path.basename(file);
      const targetPath = getSafeFilePath(fileName);
      fs.copyFileSync(file, targetPath);
      console.log(`\n[+] Saved file from Clipboard to Transfer section: ${path.basename(targetPath)}`);
      console.log(`    -> Tap 'Refresh List' on your phone to download it!`);
      count++;
    }
  });
  if (count === 0) {
    console.log('\n[!] No valid files found in Clipboard.');
  }
}

function handleClipboardText(text) {
  if (!text || !text.trim()) {
    console.log('\n[!] Clipboard text is empty.');
    return;
  }
  const timeStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const targetPath = getSafeFilePath(`pasted_text_${timeStr}.txt`);
  fs.writeFileSync(targetPath, text, 'utf8');
  console.log(`\n[+] Saved text from Clipboard to Transfer section: ${path.basename(targetPath)}`);
  console.log(`    -> Tap 'Refresh List' on your phone to download it!`);
}

function processClipboardPaste() {
  if (PLATFORM === 'win32') {
    const psScript = `$f = Get-Clipboard -Format FileDropList
if ($f) {
  Write-Output ("FILES:" + ($f -join "|"))
} else {
  $t = Get-Clipboard -Format Text
  if ($t) { Write-Output ("TEXT:" + $t) }
}`;
    const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`, (err, stdout) => {
      if (err || !stdout) {
        console.log('\n[!] Clipboard is empty or could not be read.');
        return;
      }
      const output = stdout.trim();
      if (output.startsWith('FILES:')) {
        handleClipboardFiles(output.replace(/^FILES:/, '').trim());
      } else if (output.startsWith('TEXT:')) {
        handleClipboardText(output.replace(/^TEXT:/, ''));
      } else {
        console.log('\n[!] Clipboard is empty or unsupported format.');
      }
    });
  } else if (PLATFORM === 'darwin') {
    const osascript = `use framework "AppKit"
use scripting additions
set pasteboard to current application's NSPasteboard's generalPasteboard()
set fileURLs to pasteboard's readObjectsForClasses:{current application's NSURL} options:(missing value)
if fileURLs is not missing value and (count of fileURLs) > 0 then
  set outPaths to ""
  repeat with aURL in fileURLs
    set outPaths to outPaths & (aURL's |path|() as text) & "|"
  end repeat
  return "FILES:" & outPaths
else
  set pbString to pasteboard's stringForType:(current application's NSPasteboardTypeString)
  if pbString is not missing value then
    return "TEXT:" & (pbString as text)
  else
    return ""
  end if
end if`;
    exec(`osascript -e ${JSON.stringify(osascript)}`, (err, stdout) => {
      if (err || !stdout) {
        console.log('\n[!] Clipboard is empty or could not be read.');
        return;
      }
      const output = stdout.trim();
      if (output.startsWith('FILES:')) {
        handleClipboardFiles(output.replace(/^FILES:/, '').trim());
      } else if (output.startsWith('TEXT:')) {
        handleClipboardText(output.replace(/^TEXT:/, ''));
      } else {
        console.log('\n[!] Clipboard is empty.');
      }
    });
  } else {
    // Linux
    exec(`(which wl-paste 2>/dev/null && wl-paste) || (which xclip 2>/dev/null && xclip -selection clipboard -o) || (which xsel 2>/dev/null && xsel -b -o)`, (err, stdout) => {
      if (err || !stdout) {
        console.log('\n[!] Clipboard is empty or could not be read.');
        return;
      }
      const output = stdout.trim();
      if (output.startsWith('file://')) {
        const lines = output.split('\n').map(l => decodeURIComponent(l.replace('file://', '').trim())).filter(Boolean);
        handleClipboardFiles(lines.join('|'));
      } else {
        handleClipboardText(output);
      }
    });
  }
}

function openFileDialog() {
  if (PLATFORM === 'win32') {
    const psCommand = `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select files to send to mobile'; $f.Multiselect = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileNames -join '|' }`;
    exec(`powershell -sta -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, (err, stdout) => {
      if (!err && stdout.trim()) {
        handleFileDialogResult(stdout.trim());
      }
    });
  } else if (PLATFORM === 'darwin') {
    const script = `try
set f to choose file with prompt "Select files to send to mobile" with multiple selections allowed
set AppleScript's text item delimiters to "|"
set p to {}
repeat with i in f
  set end of p to POSIX path of i
end repeat
return p as text
on error
return ""
end try`;
    exec(`osascript -e ${JSON.stringify(script)}`, (err, stdout) => {
      if (!err && stdout.trim()) {
        handleFileDialogResult(stdout.trim());
      }
    });
  } else {
    const cmd = `zenity --file-selection --multiple --separator="|" 2>/dev/null || kdialog --getopenfilename --multiple 2>/dev/null`;
    exec(cmd, (err, stdout) => {
      if (!err && stdout.trim()) {
        handleFileDialogResult(stdout.trim());
      }
    });
  }
}

function handleFileDialogResult(filesJoined) {
  const files = filesJoined.split('|').map(s => s.trim()).filter(Boolean);
  files.forEach(file => {
    if (fs.existsSync(file)) {
      const fileName = path.basename(file);
      const targetPath = getSafeFilePath(fileName);
      fs.copyFileSync(file, targetPath);
      console.log(`\n[+] Uploaded to Transfer section: ${path.basename(targetPath)}`);
      console.log(`    -> Tap 'Refresh List' on your phone to download it!`);
    }
  });
}

// --- Terminal Controls ---
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('keypress', (str, key) => {
  if (!key) return;
  if ((key.ctrl && key.name === 'c') || key.name === 'q') {
    process.exit();
  } else if ((key.ctrl || key.meta) && key.name === 's') {
    openFolder(TRANSFER_DIR);
    console.log(`\n[*] Opened File Transfer Directory to view/save files: ${TRANSFER_DIR}`);
  } else if ((key.ctrl || key.meta) && key.name === 'v') {
    processClipboardPaste();
  } else if ((key.ctrl || key.meta) && key.name === 'u') {
    openFileDialog();
  }
});

// --- Graceful Shutdown ---
function gracefulShutdown(signal) {
  console.log(`\n[*] Received ${signal}. Shutting down gracefully...`);
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch (e) { }
  }
  httpServer.close(() => {
    console.log('[*] HTTP server closed. Goodbye!');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
