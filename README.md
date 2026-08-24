# 📱 Virtual Mouse & Live Desktop Keyboard

Transform your smartphone or tablet into a high-performance wireless trackpad, live keyboard, and desktop controller for your Windows PC over local WiFi.

![Platform](https://img.shields.io/badge/Platform-Windows%20PC-blue?style=for-the-badge&logo=windows)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=nodedotjs)
![PWA Ready](https://img.shields.io/badge/PWA-Installable-cyan?style=for-the-badge&logo=pwa)

---

## ✨ Features

- 📱 **Progressive Web App (PWA)**: Installable directly onto iOS & Android home screens for a full-screen, native app feel with offline caching.
- 📷 **Instant QR Code Scan**: Launch `npm start` or `npx .` and scan the terminal's ASCII QR code directly with your mobile camera to auto-connect with PIN pre-filled.
- 🖱️ **Ultra-Smooth Trackpad**:
  - 1:1 cursor movement with Windows DPI scaling awareness via Win32 user32 bindings (`koffi`).
  - Multi-touch gestures: Tap to click, Drag to move, Two-finger vertical scrolling.
  - Left, Middle & Right click buttons with visual haptic feedback.
  - Hardware-like scroll wheel slider with spring physics.
- ⌨️ **Live Auto-Typing & Desktop TextPad**:
  - **Live Auto-Typing**: Keystrokes are transmitted in real-time to your desktop's active window/notepad.
  - **Desktop TextPad**: Draft or paste full multi-line paragraphs/notes and send the entire block to your PC with one tap.
  - **Quick Shortcuts**: Dedicated buttons for `Enter ↵`, `Backspace ⌫`, `Space ␣`, `Tab ⇥`, `Esc`, arrow keys (`▲`, `▼`, `◄`, `►`), and PC shortcuts (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Ctrl+S`).
- 🔑 **Dual Connection Modes & PIN Security**:
  - **Option 1 (IP + Port + Connect PIN)**: 4-digit pairing PIN authentication for secure pairing over local WiFi.
  - **Option 2 (Direct Web UI)**: Instant one-click connection via Quick Link parameter URL.

---

## 🚀 Quick Start Guide

### Run via Node.js / npm

1. **Instant Execution via npx (Zero Installation Required)**:
   ```powershell
   npx virtual-mouse-app
   ```
   or in current directory:
   ```powershell
   npx .
   ```

2. **OR Run Locally with Node.js**:
   ```powershell
   npm install
   npm start
   ```

---

## 📂 Project Structure

```text
├── package.json          # npm configuration & dependency metadata
├── server.js             # Node.js HTTP, WebSocket & Win32 API server
├── bin/
│   └── cli.js            # Executable launcher for npx and global npm installation
├── .npmignore            # Excludes build artifacts from npm package
├── README.md             # Documentation
└── static/               # Client PWA frontend
    ├── index.html        # Web controller UI
    ├── style.css         # Dark cyber aesthetic styles
    ├── app.js            # Touch gesture handler & WebSocket client
    ├── sw.js             # Service Worker offline cache
    ├── manifest.json     # PWA Manifest
    └── icons/            # App icons
```

---

## 🛠️ Troubleshooting

- **Port in Use**: If port `5000` is in use, start the server on a different port using `--port=8080`:
  ```powershell
  node server.js --port=8080
  ```
- **Firewall Prompt**: Ensure Windows Firewall allows Node.js to communicate on private/home WiFi networks.
