# 📱 Virtual Mouse & Live Desktop Keyboard

Transform your smartphone or tablet into a wireless trackpad, live keyboard, and desktop controller for your PC with a **Unified Single Web Application** served at `http://<PC-IP>:5000`.

![Platform](https://img.shields.io/badge/Platform-Windows%20PC-blue)
![PWA Ready](https://img.shields.io/badge/PWA-Installable-cyan)

---

## ✨ Unified Features

- 🖥️ **Desktop Control Panel Mode**:
  - Auto-detects local network IP (`e.g., 10.36.44.86`).
  - Displays & generates 4-digit Connect PINs and Port selection (`5001`).
  - Start / Stop Server toggle button.
  - Live QR code generator for instant mobile pairing.
  - 5-step setup workflow.

- 📱 **Mobile Remote Controller Mode**:
  - **Auto QR Pairing**: Scanning the Desktop QR code opens the app on your phone with IP, Port, and Connect PIN auto-filled!
  - **Progressive Web App (PWA)**: Installable directly onto iOS & Android home screens.
  - **Live Auto-Typing**: Type on your phone; keystrokes are transmitted in real-time to your desktop's active window/notepad.
  - **Desktop TextPad**: Draft or paste full multi-line paragraphs/notes and send the entire block to your PC with one tap.
  - **Quick Keycodes & Modifiers**: Dedicated buttons for `Enter ↵`, `Backspace ⌫`, `Space ␣`, `Tab ⇥`, `Esc`, navigation arrow keys (`▲`, `▼`, `◄`, `►`), and PC shortcuts (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`).
  - **Ultra-Smooth Trackpad**: 1:1 cursor movement, multi-touch gestures (Tap click, Drag move, Two-finger scroll).
  - **Mode Toggle Button**: Header button allowing you to switch between Desktop Dashboard and Mobile Remote Controller view anytime!

---

## 🚀 Quick Start (One Command)

### 1. Install Requirements (First Time Only)
```bash
pip install -r requirements.txt
```

### 2. Start the Server
```bash
python server.py
```

Console output:
```text
================================================================
        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE
================================================================
  [+] Local IP Address:    10.36.44.86
  [+] HTTP Web Port:       5000
  [+] WebSocket Port:      5001
  [*] CONNECT CODE (PIN):  7235
----------------------------------------------------------------
  [WEB APP LINK]           http://10.36.44.86:5000
================================================================
```

### 3. Open on PC & Scan from Mobile
1. Open **`http://localhost:5000`** in your PC browser to see your IP, WebSocket Port (5001), 4-digit PIN, and pairing QR code.
2. Scan the QR code using your phone camera (or open `http://<PC-IP>:5000` on your phone).
3. Tap **Start & Connect** to start controlling your PC mouse & live keyboard!

---

## 📂 Project Structure

```text
├── server.py             # Single Python server with ctypes simulation & static HTTP routing
├── requirements.txt      # Python dependencies (websockets)
├── static/               # Unified Single Page Application (PWA)
│   ├── index.html        # Unified HTML containing Desktop & Mobile views
│   ├── style.css         # Modern dark cyber aesthetic & responsive styles
│   ├── app.js            # Automatic mode detection, WebSocket pairing & touchpad gestures
│   ├── sw.js             # Service worker offline caching
│   ├── manifest.json     # PWA Web App Manifest
│   └── icons/            # App icons
```
