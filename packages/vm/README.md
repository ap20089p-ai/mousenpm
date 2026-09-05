# 📱 mouse-vm

> **Transform your smartphone or tablet into a high-performance wireless trackpad, live keyboard, file transfer hub, and desktop controller for Windows PC over Wi-Fi.**

---

## ⚡ Quick Start

### 1. Installation
Install `mouse-vm` globally via npm:

```bash
npm install -g mouse-vm
```

*(Alternatively, run instantly without installation using `npx mouse-vm`)*

---

### 2. Launch Desktop Server
Start the server from your terminal:

```bash
mouse-vm
```

*(Command aliases: `vm2do`, `vm`, `npx mouse-vm`)*

The terminal will generate your PC's local Wi-Fi IP address, web port, pairing PIN, and an ASCII **QR Code**:

```text
================================================================
        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE
================================================================
  [+] Mobile IP (Wi-Fi):       <YOUR-LOCAL-IP>
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

## 💻 PC Terminal Keyboard Shortcuts

While `mouse-vm` is running in your PC terminal, press:

| Shortcut | Action |
|:---|:---|
| `Ctrl+U` (or `Alt+U`) | Open a Windows file selection dialog to choose files to send to mobile |
| `Ctrl+V` (or `Alt+V`) | Paste clipboard files or text directly into the file transfer folder |
| `Ctrl+S` (or `Alt+S`) | Open the file transfer directory in Windows Explorer |
| `Ctrl+C` or `q` | Safely stop the server and restore terminal settings |

---

## ⚙️ Advanced CLI Flags

You can customize port, pairing PIN, or transfer directory:

```bash
# Custom HTTP Port (default: 5000, WS port will be port + 1)
mouse-vm --port=8080

# Custom 4-digit pairing PIN (default: random 4-digit PIN)
mouse-vm --pin=1234

# Custom File Transfer Directory
mouse-vm --transfer-path="C:\Users\YourName\Desktop\Transfers"

# Show Version & Help
mouse-vm --version
mouse-vm --help
```

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

---

## 📄 License

MIT License
