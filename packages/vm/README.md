# 📱 Virtual Mouse & Live Desktop Keyboard (`mouse-vm`)

Transform your smartphone or tablet into a wireless trackpad, live keyboard, file transfer hub, and desktop controller for your Windows PC over WiFi.

---

## ✨ Features

- 📱 **Progressive Web App (PWA)**: Installable directly onto iOS & Android home screens for a full-screen, native app feel with offline caching.
- ⌨️ **Live Keyboard & Desktop TextPad**:
  - **Live Auto-Typing**: Click the single text box and type on your phone; keystrokes are transmitted in real-time to your desktop's active window.
  - **Desktop TextPad**: Draft or paste full multi-line paragraphs/notes and send the entire block to your PC with one tap.
  - **Quick Keycodes & Modifiers**: Dedicated buttons for `Enter ↵`, `Backspace ⌫`, `Space ␣`, `Tab ⇥`, `Esc`, navigation arrow keys (`▲`, `▼`, `◄`, `►`), and PC shortcuts (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`).
- 🖱️ **Ultra-Smooth Trackpad**:
  - 1:1 cursor movement with Windows DPI scaling awareness.
  - Multi-touch gestures (Tap to click, Drag to move, Two-finger vertical scrolling).
  - Left & Right click buttons with haptic visual feedback.
  - Hardware-like scroll wheel slider.
- 📁 **Bidirectional File Transfer**:
  - Easily transfer files between your PC and mobile device.
  - **Upload to PC**: Select files on your phone to instantly upload to your PC (up to 200MB limit).
  - **Download to Mobile**: View files hosted on your PC and download them directly to your phone.
  - **Terminal Shortcuts**: Manage transfers directly from the PC terminal.
- 🔑 **Secure Connections**:
  - 4-digit pairing PIN authentication for secure pairing over WiFi.

---

## 🚀 Quick Start

### 1. Global Installation

Install `mouse-vm` globally via npm:

```bash
npm install -g mouse-vm
```

### 2. Start Desktop Server

Launch the server using `mouse-vm` (or `npx mouse-vm`):

```bash
mouse-vm
```

Console will display your Local IP, Web/WS port, and **Connect PIN**:

```text
================================================================
        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE
================================================================
  [+] Mobile IP (Wi-Fi):       <YOUR-LOCAL-IP>
  [+] Web & WS Port:           <PORT>
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

### 3. Connect from Mobile Phone

1. Connect your phone to the same WiFi network as your PC.
2. Scan the QR code displayed in the terminal, or open `http://<PC-IP>:5000` in your mobile browser.
3. Your device should automatically pair using the generated PIN.

---

## 💻 PC Terminal Shortcuts

While the server is running, you can use the following keyboard shortcuts in your terminal:

- `Ctrl+U` (or `Alt+U`): Open a file selection dialog on your PC to choose files to send to your mobile device.
- `Ctrl+V` (or `Alt+V`): Paste files or text copied on your PC clipboard directly into the file transfer folder.
- `Ctrl+S` (or `Alt+S`): Open the file transfer directory on your PC to view or save received files.
- `q` or `Ctrl+C`: Stop the server.

---
