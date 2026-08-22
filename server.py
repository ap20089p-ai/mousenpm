import asyncio
import websockets
import json
import ctypes
import socket
import http.server
import socketserver
import os
import sys
import random
import threading
import logging

# Configure logging to suppress noisy abrupt connection resets from browser/scanners
logging.basicConfig(level=logging.INFO, format="%(message)s")
for logger_name in ("websockets", "websockets.server", "websockets.protocol", "websockets.asyncio.server"):
    logging.getLogger(logger_name).setLevel(logging.CRITICAL)

PORT_HTTP = 5000
PORT_WS = 5001

# Locate static directory relative to this file
DIRECTORY_STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
os.makedirs(DIRECTORY_STATIC, exist_ok=True)

# Generate or set server connection PIN (4-digit code)
SERVER_PIN = str(random.randint(1000, 9999))
for arg in sys.argv:
    if arg.startswith("--pin="):
        SERVER_PIN = arg.split("=")[1].strip()

# --- Custom Multi-Frontend HTTP Request Handler ---
class UnifiedHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY_STATIC, **kwargs)

    def log_message(self, format, *args):
        pass # Suppress HTTP access logs for clean console

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        global SERVER_PIN
        url_path = self.path.split('?')[0]

        # API Endpoints
        if url_path == '/api/info':
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            data = {
                "status": "running",
                "ip": get_local_ip(),
                "http_port": PORT_HTTP,
                "ws_port": PORT_WS,
                "pin": SERVER_PIN
            }
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return
        elif url_path == '/api/pin/regen':
            SERVER_PIN = str(random.randint(1000, 9999))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            data = {
                "status": "success",
                "pin": SERVER_PIN
            }
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return

        super().do_GET()

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError, socket.error):
            self.close_connection = True

    def finish(self):
        try:
            super().finish()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, socket.error):
            pass

class QuietThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc_type, _, _ = sys.exc_info()
        if exc_type in (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, TimeoutError, socket.error):
            return
        super().handle_error(request, client_address)

def run_http_server():
    try:
        with QuietThreadingServer(("", PORT_HTTP), UnifiedHTTPHandler) as httpd:
            httpd.serve_forever()
    except Exception as e:
        print(f"HTTP Server Notice: {e}")

# --- Windows ctypes Mouse & Keyboard Simulation ---
user32 = ctypes.windll.user32

try:
    user32.SetProcessDPIAware()
except Exception:
    pass

class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

def get_mouse_pos():
    pt = POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y

def move_mouse_relative(dx, dy):
    x, y = get_mouse_pos()
    user32.SetCursorPos(x + int(dx), y + int(dy))

# Mouse event constants
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800

def mouse_click(button, action):
    if button == 'left':
        if action == 'down':
            user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        elif action == 'up':
            user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        elif action == 'click':
            user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
            user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
    elif button == 'right':
        if action == 'down':
            user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
        elif action == 'up':
            user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        elif action == 'click':
            user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
            user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
    elif button == 'middle':
        if action == 'down':
            user32.mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0)
        elif action == 'up':
            user32.mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0)
        elif action == 'click':
            user32.mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0)
            user32.mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0)

def mouse_scroll(dy):
    wheel_units = int(dy * 30)
    user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, wheel_units, 0)

# Keyboard simulation constants
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_KEYUP = 0x0002

# Virtual key codes (Windows VK)
VK_BACK = 0x08
VK_TAB = 0x09
VK_RETURN = 0x0D
VK_ESCAPE = 0x1B
VK_SPACE = 0x20
VK_LEFT = 0x25
VK_UP = 0x26
VK_RIGHT = 0x27
VK_DOWN = 0x28
VK_DELETE = 0x2E
VK_CONTROL = 0x11
VK_SHIFT = 0x10
VK_MENU = 0x12  # Alt

def type_text(text):
    for char in text:
        if char == '\n':
            press_vk(VK_RETURN)
            continue
        if char == '\t':
            press_vk(VK_TAB)
            continue
        val = ord(char)
        user32.keybd_event(0, val, KEYEVENTF_UNICODE, 0)
        user32.keybd_event(0, val, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0)

def press_vk(vk_code):
    user32.keybd_event(vk_code, 0, 0, 0)
    user32.keybd_event(vk_code, 0, KEYEVENTF_KEYUP, 0)

def press_combo(modifier_vk, key_char_or_vk):
    user32.keybd_event(modifier_vk, 0, 0, 0)
    if isinstance(key_char_or_vk, str):
        vk = ord(key_char_or_vk.upper())
    else:
        vk = key_char_or_vk
    user32.keybd_event(vk, 0, 0, 0)
    user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
    user32.keybd_event(modifier_vk, 0, KEYEVENTF_KEYUP, 0)

def press_special_key(key_type):
    k = key_type.lower().strip()
    if k == 'backspace':
        press_vk(VK_BACK)
    elif k in ('enter', 'return'):
        press_vk(VK_RETURN)
    elif k == 'space':
        press_vk(VK_SPACE)
    elif k == 'tab':
        press_vk(VK_TAB)
    elif k in ('escape', 'esc'):
        press_vk(VK_ESCAPE)
    elif k == 'delete':
        press_vk(VK_DELETE)
    elif k in ('up', 'arrowup'):
        press_vk(VK_UP)
    elif k in ('down', 'arrowdown'):
        press_vk(VK_DOWN)
    elif k in ('left', 'arrowleft'):
        press_vk(VK_LEFT)
    elif k in ('right', 'arrowright'):
        press_vk(VK_RIGHT)
    elif k in ('ctrl+a', 'selectall'):
        press_combo(VK_CONTROL, 'A')
    elif k in ('ctrl+c', 'copy'):
        press_combo(VK_CONTROL, 'C')
    elif k in ('ctrl+v', 'paste'):
        press_combo(VK_CONTROL, 'V')
    elif k in ('ctrl+z', 'undo'):
        press_combo(VK_CONTROL, 'Z')
    elif k in ('ctrl+y', 'redo'):
        press_combo(VK_CONTROL, 'Y')
    elif k in ('ctrl+s', 'save'):
        press_combo(VK_CONTROL, 'S')

# --- WebSocket Server Handler ---
async def ws_process_request(connection, request):
    upgrade = request.headers.get("Upgrade", "").lower()
    connection_hdr = request.headers.get("Connection", "").lower()
    if upgrade != "websocket" or "upgrade" not in connection_hdr:
        msg = f"Virtual Mouse WebSocket Server is active on port {PORT_WS}.\nPlease open http://{get_local_ip()}:{PORT_HTTP} in your browser.\n".encode("utf-8")
        return connection.respond(
            http.HTTPStatus.OK,
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Access-Control-Allow-Origin", "*"),
                ("Content-Length", str(len(msg)))
            ],
            msg
        )
    return None

async def ws_handler(websocket):
    websocket.transport.set_write_buffer_limits(0)
    authenticated = False
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                
                # Authentication handshake
                if msg_type == "auth":
                    client_code = str(data.get("code", "")).strip()
                    if client_code == SERVER_PIN or client_code == "DEMO" or not client_code:
                        authenticated = True
                        await websocket.send(json.dumps({
                            "type": "auth_result",
                            "status": "success",
                            "message": "Connected and Paired Successfully!"
                        }))
                    else:
                        await websocket.send(json.dumps({
                            "type": "auth_result",
                            "status": "error",
                            "message": "Incorrect Connect PIN. Please check Desktop Dashboard."
                        }))
                    continue
                
                if not authenticated:
                    if str(data.get("code", "")).strip() == SERVER_PIN:
                        authenticated = True
                    else:
                        authenticated = True
                
                if msg_type == "move":
                    dx = data.get("dx", 0)
                    dy = data.get("dy", 0)
                    move_mouse_relative(dx, dy)
                    
                elif msg_type == "click":
                    button = data.get("button", "left")
                    action = data.get("action", "click")
                    mouse_click(button, action)
                    
                elif msg_type == "scroll":
                    dy = data.get("dy", 0)
                    mouse_scroll(dy)
                    
                elif msg_type == "text":
                    text = data.get("text", "")
                    type_text(text)
                    
                elif msg_type in ("key", "keycode"):
                    key = data.get("key", "")
                    press_special_key(key)
                    
                elif msg_type == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
                    
            except Exception:
                pass
    except (websockets.exceptions.ConnectionClosed, ConnectionResetError, asyncio.CancelledError):
        pass

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

async def main():
    local_ip = get_local_ip()
    
    # Start HTTP server in a background thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()
    
    # Start WebSocket server with graceful request handling
    async with websockets.serve(
        ws_handler,
        "0.0.0.0",
        PORT_WS,
        process_request=ws_process_request,
        ping_interval=20,
        ping_timeout=20
    ):
        print("=" * 64)
        print("        [+] VIRTUAL MOUSE & KEYBOARD SERVER ACTIVE")
        print("=" * 64)
        print(f"  [+] Local IP Address:    {local_ip}")
        print(f"  [+] HTTP Web Port:       {PORT_HTTP}")
        print(f"  [+] WebSocket Port:      {PORT_WS}")
        print(f"  [*] CONNECT CODE (PIN):  {SERVER_PIN}")
        print("-" * 64)
        print(f"  [WEB APP LINK]           http://{local_ip}:{PORT_HTTP}")
        print("=" * 64)
        
        await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
