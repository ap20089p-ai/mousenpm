# 📱 mouse-vm

> **Transform your smartphone or tablet into a high-performance wireless trackpad, live keyboard, file transfer hub, and desktop controller for Windows PC over Wi-Fi.**

---

## ⚡ Quick Start

### Option A: Running Locally in this Project Repository

If you have cloned or downloaded this project folder (`c:\project\mouseirtual`), start the server directly:

```bash
npm start
```

*(Alternative commands from this folder)*:
```bash
node server.js
# or
npm run dev
```

---

### Option B: Global CLI Installation / NPX

You can also run or install `mouse-vm` anywhere on your machine via npm:

```bash
# Run instantly with npx (no install required):
npx mouse-vm

# Or install / update to latest globally:
npm install -g mouse-vm@latest

# Force reinstall if needed (bypasses cache/conflicts):
npm install -g mouse-vm@latest --force

# Check installed version:
mouse-vm --version

# Then start anytime with:
mouse-vm

# To uninstall:
npm uninstall -g mouse-vm
```

The terminal will generate your PC's local Wi-Fi IP address, web port, pairing PIN, and an ASCII **QR Code**:

```text
================================================================
        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE
================================================================
  [+] Web & WS Port:           5000
  [*] CONNECT CODE (PIN):      <4-DIGIT-PIN>
  [+] File Transfer Directory: <YOUR-TRANSFER-DIRECTORY>
================================================================
  [SCAN ME] QR CODE FOR MOBILE INSTANT CONNECT
================================================================
  - Press Ctrl+U (or Alt+U / Cmd+U) for file selection dialog
  - Press Ctrl+V (or Alt+V / Cmd+V) to paste copied file/text
  - Press Ctrl+S (or Alt+S / Cmd+S) to open save folder
================================================================
```

---

### 3. Connect from Smartphone / Tablet

1. Connect your smartphone/tablet to the **same Wi-Fi network** as your PC.
2. Scan the **QR Code** shown in your PC terminal using your phone camera, or manually type `http://<YOUR-LOCAL-IP>:5000` into your mobile browser.
3. Your device will automatically pair using the generated 4-digit PIN!

---

## ✨ Features & Core Concepts

### 🖱️ 1. Ultra-Smooth Wireless Trackpad

* **1:1 Responsive Movement**: Real-time cursor control with Windows DPI scaling support.
* **Multi-Touch Gestures**:
  * Single Tap = Left Click
  * Two-Finger Scroll = Vertical Scroll
  * Tap & Drag = Move windows / select text
* **Dedicated Controls**: Hardware-style Left & Right click buttons with visual feedback + interactive scroll wheel slider.

---

### ⌨️ 2. Live Keyboard & Desktop TextPad

* **Live Auto-Typing**: Tap the single-line input box on your mobile keyboard to transmit keystrokes in real-time to your desktop's active window.
* **Desktop TextPad**: Draft or paste multi-line paragraphs, notes, or code blocks on your phone and send the entire text block to your PC in one tap.
* **PC Shortcut Modifiers**: Dedicated buttons for `Enter ↵`, `Backspace ⌫`, `Space ␣`, `Tab ⇥`, `Esc`, Arrow Navigation Keys (`▲`, `▼`, `◄`, `►`), and PC shortcuts (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`).

---

### 📁 3. Bidirectional File Transfer

* **Mobile to PC Upload**: Tap "Send File" on your phone browser to upload files directly to your PC (up to 200MB per file).
* **PC to Mobile Download**: View files hosted in the PC transfer directory and download them directly to your phone.

---

### 📱 4. Progressive Web App (PWA)

* Add `mouse-vm` to your iOS or Android Home Screen for a full-screen, native application experience with offline caching.

---

## 📜 All Commands Reference

### 1. Repository & Local Development Commands
Run these commands from the project root (`c:\project\mouseirtual`):

| Command | Description |
| :--- | :--- |
| `npm install` | Install all required dependencies for root and workspace packages |
| `npm start` | Start the server in standard workspace mode (`node server.js`) |
| `npm run dev` | Start development server with auto-reload / hot file-watch (`node --watch`) |
| `npm run mouse-vm` | Run workspace package directly |
| `node server.js` | Run server directly with Node.js |

---

### 2. Global CLI & NPX Commands
Run anywhere on your machine after installing or with `npx`:

| Command | Description |
| :--- | :--- |
| `npx mouse-vm` | Run server instantly without manual installation |
| `npm install -g mouse-vm@latest` | Install or update `mouse-vm` to latest version globally |
| `npm install -g mouse-vm@latest --force` | Force-install latest version (overwriting cache / conflicts) |
| `mouse-vm --version` | Display installed CLI version |
| `mouse-vm` | Start server using primary CLI command |
| `npm uninstall -g mouse-vm` | Completely uninstall `mouse-vm` global package |

---

### 3. CLI Arguments & Flags Reference
Customize the server configuration using command-line arguments:

| Flag / Option | Description | Default | Example |
| :--- | :--- | :--- | :--- |
| `--port=<number>` | Set custom HTTP port (WS runs on port + 1) | `5000` | `mouse-vm --port=8080` |
| `--pin=<4-digits>` | Set fixed 4-digit Connect PIN | Random | `mouse-vm --pin=1234` |
| `--transfer-path=<path>` | Custom directory for file transfers | `./transfers` | `mouse-vm --transfer-path="D:\Files"` |
| `-v`, `--version` | Display installed package version | - | `mouse-vm --version` |
| `-h`, `--help` | Show command usage and options help menu | - | `mouse-vm --help` |

#### Combined Flag Examples:
```bash
# Custom port, fixed PIN, and custom file transfer directory
mouse-vm --port=8080 --pin=7777 --transfer-path="C:\Users\YourName\Desktop\Files"

# Run with NPX using custom port
npx mouse-vm --port=3000 --pin=4321
```

---

### 4. Interactive Terminal Keyboard Shortcuts (Hotkeys)
Press these hotkeys in the active server terminal while `mouse-vm` is running:

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+U` (or `Alt+U` / `Cmd+U`) | Open Windows file picker dialog to choose and send files to mobile |
| `Ctrl+V` (or `Alt+V` / `Cmd+V`) | Paste clipboard files or text directly into the file transfer folder |
| `Ctrl+S` (or `Alt+S` / `Cmd+S`) | Open the file transfer folder directly in Windows Explorer |
| `Ctrl+C` or `q` | Safely stop and shut down the server |

---

### 5. Windows Diagnostics & Troubleshooting Commands
Helpful commands to troubleshoot network or port conflicts:

| Command | Purpose |
| :--- | :--- |
| `ipconfig` | Display your PC's local Wi-Fi IPv4 and IPv6 addresses |
| `netstat -ano \| findstr :5000` | Check if port 5000 is currently occupied and find its PID |
| `taskkill /PID <PID> /F` | Terminate a process locking port 5000 |
| `ping <PC-IP-ADDRESS>` | Test network reachability between phone and PC |

---

## 🔐 Security & Privacy Architecture

`mouse-vm` is engineered with multi-layered local security protections:

* 🏠 **Local Network Bounded**: Operates strictly within your local Wi-Fi network.
* 🔑 **4-Digit PIN Authentication**: Unauthorized connections are rejected until authenticated with the session PIN.
* 🛑 **Brute-Force Lockout**: 5 consecutive failed PIN attempts automatically ban the IP for 1 minute.
* 📁 **Path Traversal Defense**: All file paths are sanitized (`sanitizeFilename`) to prevent escaping the transfer folder.

---

## ❓ Troubleshooting & FAQs

#### 1. Mobile phone cannot connect to the server?

* Ensure both PC and mobile device are connected to the **same Wi-Fi network**.
* Check if Windows Firewall is blocking port `5000`. Allow `node.exe` through private networks.

#### 2. Port 5000 is already in use (`EADDRINUSE`)?

* Launch `mouse-vm` on a custom port:
  ```bash
  mouse-vm --port=8080
  ```
