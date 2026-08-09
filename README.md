# 📱 Virtual Mouse & Live Desktop Keyboard

Transform your smartphone or tablet into a wireless trackpad, live keyboard, and desktop controller for your PC.

![Platform](https://img.shields.io/badge/Platform-Windows%20PC-blue)
![PWA Ready](https://img.shields.io/badge/PWA-Installable-cyan)
![Deploy](https://img.shields.io/badge/Deploy-Netlify-00ad9f)

---

## ✨ Features

- 📱 **Progressive Web App (PWA)**: Installable directly onto iOS & Android home screens for a full-screen, native app feel with offline caching.
- ⌨️ **Live Keyboard & Desktop TextPad**:
  - **Live Auto-Typing**: Click the single text box and type on your phone; keystrokes are transmitted in real-time to your desktop's active window/notepad.
  - **Desktop TextPad**: Draft or paste full multi-line paragraphs/notes and send the entire block to your PC with one tap.
  - **Quick Keycodes & Modifiers**: Dedicated buttons for `Enter ↵`, `Backspace ⌫`, `Space ␣`, `Tab ⇥`, `Esc`, navigation arrow keys (`▲`, `▼`, `◄`, `►`), and PC shortcuts (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`).
- 🖱️ **Ultra-Smooth Trackpad**:
  - 1:1 cursor movement with Windows DPI scaling awareness.
  - Multi-touch gestures (Tap to click, Drag to move, Two-finger vertical scrolling).
  - Left & Right click buttons with haptic visual feedback.
  - Hardware-like scroll wheel slider with spring physics.
- 🔑 **Dual Connection Modes & PIN Security**:
  - **Option 1 (IP + Port + Connect PIN)**: 4-digit pairing PIN authentication for secure pairing over WiFi.
  - **Option 2 (Direct Mouse & Keycode UI)**: Instant one-click access to all controller tools.
- 🚀 **Netlify Ready**: Pre-configured `netlify.toml` for 1-click cloud deployment.

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.8+ on Windows PC
- `websockets` library

Install dependencies:
```bash
pip install -r requirements.txt
```

### 2. Start Desktop Server
```bash
python server.py
```

Console will display your Local IP, WebSocket port, and **Connect PIN**:
```text
================================================================
        🎮 VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE
================================================================
  [+] Local IP Address:    192.168.1.15
  [+] HTTP Web Port:       5000
  [+] WebSocket Port:      5001
  [🔑] CONNECT CODE (PIN): 5829
================================================================
```

### 3. Connect from Mobile Phone
1. Connect your phone to the same WiFi network as your PC.
2. Open `http://<PC-IP>:5000` (or your Netlify URL) in your mobile browser.
3. Enter your PC's IP and 4-digit Connect PIN and tap **Start & Connect** (or tap **Open Mouse & Keycode UI**).

---

## 🌐 Netlify Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions on deploying this PWA frontend to Netlify.

---

## 📂 Project Structure

```text
├── server.py             # Python server with ctypes simulation & WebSocket PIN auth
├── requirements.txt      # Python dependencies (websockets)
├── netlify.toml          # Netlify build configuration & PWA headers
├── DEPLOYMENT.md         # Deployment & connection guide
└── static/               # Client frontend (PWA)
    ├── index.html        # Multi-screen web app UI (Connect, Mouse, Keyboard, Settings)
    ├── style.css         # Dark neon cyber aesthetic styles
    ├── app.js            # WebSocket client, PWA install, live typing & keycodes
    ├── sw.js             # Service worker offline caching
    ├── manifest.json     # PWA Web App Manifest
    └── icons/            # App icons (SVG, 192x192, 512x512)
```
