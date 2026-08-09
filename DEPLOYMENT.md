# Deployment & Netlify Setup Guide

This guide explains how to deploy the **Virtual Mouse & Keyboard PWA** to Netlify and connect it with your desktop server.

---

## 1. Deploying Frontend to Netlify

### Option A: Via GitHub (Recommended)
1. Push your repository to GitHub.
2. Log in to [Netlify](https://app.netlify.com/).
3. Click **"Add new site"** > **"Import an existing project"** > Choose **GitHub**.
4. Select this repository.
5. Netlify will automatically detect the settings from `netlify.toml`:
   - **Publish directory:** `static`
   - **Build command:** *(leave blank)*
6. Click **"Deploy site"**. Netlify will assign a live URL (e.g., `https://your-virtual-mouse.netlify.app`).

### Option B: Netlify CLI / Manual Drag & Drop
1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```
2. Deploy the `static` folder:
   ```bash
   netlify deploy --dir=static --prod
   ```
   Or drag-and-drop the `static` folder into the Netlify Web Dashboard.

---

## 2. Starting the Desktop Server

Run the Python server on your PC:
```bash
python server.py
```
*(Or specify a custom PIN if desired: `python server.py --pin=1234`)*

The server console will output:
```text
================================================================
        🎮 VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE
================================================================
  [+] Local IP Address:    192.168.1.15
  [+] HTTP Web Port:       5000
  [+] WebSocket Port:      5001
  [🔑] CONNECT CODE (PIN): 5829
----------------------------------------------------------------
  📱 HOW TO CONNECT FROM YOUR MOBILE PHONE:
  1. Connect your phone to the same WiFi network (192.168.1.15)
  2. Open browser: http://192.168.1.15:5000
     Or Netlify URL: https://<your-app>.netlify.app
  3. Enter IP: 192.168.1.15  |  Port: 5001  |  PIN: 5829
  4. Or use Quick Link:
     http://192.168.1.15:5000/?ip=192.168.1.15&port=5001&code=5829
================================================================
```

---

## 3. Connecting from Mobile PWA

1. **Open the Web App**:
   - Access either your local server URL (`http://<PC-IP>:5000`) or your **Netlify URL** (`https://<your-app>.netlify.app`).
2. **Install PWA (Optional)**:
   - Tap the **"Install"** button in the header or your browser menu ("Add to Home screen") for a native fullscreen app experience.
3. **Choose Connection Option**:
   - **Option 1 (IP + Port + PIN)**: Enter your PC's IP address (e.g. `192.168.1.15`), WebSocket Port (`5001`), and 4-digit PIN (e.g. `5829`), then tap **"Start & Connect"**.
   - **Option 2 (Direct Mouse & Keycode UI)**: Tap **"Open Mouse & Keycode UI"** to immediately open the full controller interface.

---

## 4. Live Keyboard & Desktop TextPad Features

Once connected, switch to the **Keyboard** tab in the bottom bar:
- **Live Automatic Typing**: Click the live text box and type on your phone keyboard. Every keystroke is streamed in real time to your active PC window (Notepad, Word, VS Code, Browser).
- **Desktop TextPad**: Type or paste long paragraphs or notes into the TextPad and click **"Send to Desktop TextPad"** to type the whole block onto your PC.
- **Quick Keycodes**: Tap dedicated buttons for `Enter`, `Backspace`, `Space`, `Tab`, `Esc`, `Arrow Keys`, and Shortcuts (`Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`).
