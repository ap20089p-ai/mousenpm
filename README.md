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
   npx virtual-mouse-pwa
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

---

## 📦 Publishing to npm Registry

Follow these steps to publish or update the package to the [npm public registry](https://www.npmjs.com/).

### 1. Login to npm
Log in with your npm account credentials:
```powershell
npm login
```
You will be prompted for your **username**, **password**, and **email**. If you have 2FA enabled, enter your OTP too.

---

### 2. Verify package before publishing (Dry Run)
Preview exactly what files will be uploaded without actually publishing:
```powershell
npm publish --dry-run
```
This shows the file list and package size. Check for unwanted files.

---

### 3. Bump the version number
Before every publish, update the version in [`package.json`](package.json):

| Command | What it does | Example result |
|---|---|---|
| `npm version patch` | Bug fix / small tweak | `1.0.1` → `1.0.2` |
| `npm version minor` | New feature added | `1.0.2` → `1.1.0` |
| `npm version major` | Breaking / major release | `1.1.0` → `2.0.0` |

```powershell
# Example: bump patch version
npm version patch
```

---

### 4. Publish the package
```powershell
npm publish
```
For **scoped packages** (e.g. `@username/package`), publish as public:
```powershell
npm publish --access public
```

---

### 5. Verify it's live
Check the published package on the registry:
```powershell
npm view virtual-mouse-pwa
```
Or open in browser: `https://www.npmjs.com/package/virtual-mouse-pwa`

---

### 6. Update an existing published version
```powershell
# 1. Make your code changes
# 2. Bump the version
npm version patch

# 3. Publish the update
npm publish
```

---

### 7. Unpublish a specific version (within 72 hours)
```powershell
npm unpublish virtual-mouse-pwa@1.0.2
```

> **Note:** npm does not allow unpublishing after 72 hours to protect dependent users.

---

## 🔗 Using the Published Package

Once published, anyone can run it instantly with no installation:
```powershell
npx virtual-mouse-pwa
```
Or install it globally:
```powershell
npm install -g virtual-mouse-pwa
virtual-mouse-pwa
```

