import asyncio
import websockets
import json
import ctypes
import socket
import http.server
import socketserver
import os
import threading

PORT_HTTP = 5000
PORT_WS = 5001

# Locate static directory relative to this script
DIRECTORY_STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

# Ensure static directory exists
os.makedirs(DIRECTORY_STATIC, exist_ok=True)

# Define a custom Handler to serve from the specific static directory
class StaticHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY_STATIC, **kwargs)
    
    # Suppress log messages for clean console output
    def log_message(self, format, *args):
        pass

def run_http_server():
    try:
        # ThreadingHTTPServer allows concurrent HTTP connections if needed
        with socketserver.TCPServer(("", PORT_HTTP), StaticHTTPHandler) as httpd:
            httpd.serve_forever()
    except Exception as e:
        print(f"Error in HTTP Server: {e}")

# --- ctypes mouse and keyboard simulation ---
user32 = ctypes.windll.user32

# Make the process DPI aware to map coordinates 1:1 on scaling screens
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
    # Move mouse by dx, dy
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

def mouse_scroll(dy):
    # dy is the scroll delta (+ve is up, -ve is down)
    # Windows mouse_event uses 120 per standard wheel notch
    # Scale dy to a proportional scroll value
    wheel_units = int(dy * 30) # Adjust scaling for feel
    user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, wheel_units, 0)

# Keyboard simulation constants
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_KEYUP = 0x0002

def type_text(text):
    for char in text:
        val = ord(char)
        # Key down
        user32.keybd_event(0, val, KEYEVENTF_UNICODE, 0)
        # Key up
        user32.keybd_event(0, val, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0)

def press_special_key(key_type):
    if key_type == 'backspace':
        # VK_BACK = 0x08
        user32.keybd_event(0x08, 0, 0, 0)
        user32.keybd_event(0x08, 0, KEYEVENTF_KEYUP, 0)
    elif key_type == 'enter':
        # VK_RETURN = 0x0D
        user32.keybd_event(0x0D, 0, 0, 0)
        user32.keybd_event(0x0D, 0, KEYEVENTF_KEYUP, 0)
    elif key_type == 'space':
        # VK_SPACE = 0x20
        user32.keybd_event(0x20, 0, 0, 0)
        user32.keybd_event(0x20, 0, KEYEVENTF_KEYUP, 0)

# --- WebSocket Server Handler ---
async def ws_handler(websocket):
    # Set TCP no delay for minimal lag
    websocket.transport.set_write_buffer_limits(0)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                
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
                    
                elif msg_type == "key":
                    key = data.get("key", "")
                    press_special_key(key)
                    
            except Exception as e:
                # Silently catch parse or event execution errors to keep connection alive
                pass
    except websockets.exceptions.ConnectionClosed:
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
    
    # Start HTTP server in a separate thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()
    
    # Start WebSocket server
    async with websockets.serve(ws_handler, "0.0.0.0", PORT_WS):
        print("=" * 60)
        print("                 VIRTUAL MOUSE SERVER ACTIVE")
        print("=" * 60)
        print(f"  Local Web Address:  http://localhost:{PORT_HTTP}")
        print(f"  Network Address:    http://{local_ip}:{PORT_HTTP}")
        print(f"  WebSocket Port:     {PORT_WS}")
        print("-" * 60)
        print(f"  Instructions:")
        print(f"  1. Connect your phone to the same WiFi network.")
        print(f"  2. Open http://{local_ip}:{PORT_HTTP} on your phone browser.")
        print(f"  3. Tap 'Connect Now' in the web app to control the PC!")
        print("=" * 60)
        
        # Keep running
        await asyncio.Event().wait()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
