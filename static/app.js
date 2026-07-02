/* -------------------------------------------------------------
 * VIRTUAL MOUSE - FRONTEND LOGIC
 * Supports Multi-touch gestures, WebSockets, DPI scaling,
 * Scroll notch physics, Keyboard transmission, and fallback simulator.
 * ------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    // --- Application State ---
    let socket = null;
    let isConnected = false;
    let isSimulatorMode = false;
    let sensitivity = 1.0; // DPI multiplier (1600 = 1.0x)
    let scrollSensitivity = 0.8;
    let lastConnectedIp = "";
    let lastConnectedPort = "5000";

    // Trackpad gesture variables
    let lastX = 0;
    let lastY = 0;
    let scrollLastY = 0;
    let isMoving = false;
    let isTwoFingerScrolling = false;
    let touchStartTimestamp = 0;
    const clickMovementThreshold = 3; // pixels

    // --- DOM Elements ---
    const screens = {
        splash: document.getElementById("screen-splash"),
        home: document.getElementById("screen-home"),
        mouse: document.getElementById("screen-mouse"),
        settings: document.getElementById("screen-settings")
    };
    
    const bottomNav = document.getElementById("main-bottom-nav");
    const navItems = document.querySelectorAll(".nav-item");
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    // WiFi Form Inputs
    const inputIp = document.getElementById("ip-address");
    const inputPort = document.getElementById("port-number");
    const inputDevice = document.getElementById("device-name");
    const statusDot = document.querySelector(".connection-status .status-indicator");
    const statusText = document.getElementById("txt-status-detail");
    const btnConnectWifi = document.getElementById("btn-connect-wifi");
    const btnConnectUsb = document.getElementById("btn-connect-usb");

    // Bluetooth Screen
    const btnScanBluetooth = document.getElementById("btn-scan-bluetooth");
    const bluetoothDevices = document.querySelectorAll(".device-item");

    // Mouse Controller UI
    const trackpadArea = document.getElementById("trackpad-area");
    const touchGlowCursor = document.getElementById("touch-glow-cursor");
    const lblDeviceTitle = document.getElementById("lbl-device-title");
    const lblDeviceAddress = document.getElementById("lbl-device-address");
    const btnLeftClick = document.getElementById("btn-left-click");
    const btnRightClick = document.getElementById("btn-right-click");
    const btnScrollUp = document.getElementById("btn-scroll-up");
    const btnScrollDown = document.getElementById("btn-scroll-down");
    const scrollNotch = document.getElementById("scroll-wheel-notch");
    const toggleScrollMode = document.getElementById("toggle-scroll-mode");
    const lblScrollState = document.getElementById("lbl-scroll-state");

    // Keyboard Entry Overlay
    const btnKeyboardTrigger = document.getElementById("btn-keyboard-trigger");
    const overlayKeyboard = document.getElementById("overlay-keyboard");
    const btnCloseKeyboard = document.getElementById("btn-close-keyboard");
    const kbHiddenInput = document.getElementById("kb-hidden-input");
    const btnKbBackspace = document.getElementById("btn-kb-backspace");
    const btnKbEnter = document.getElementById("btn-kb-enter");

    // Settings UI
    const toggleDarkMode = document.getElementById("toggle-dark-mode");
    const sliderDpi = document.getElementById("slider-dpi");
    const lblDpiValue = document.getElementById("lbl-dpi-value");
    const btnReconnect = document.getElementById("btn-menu-reconnect");
    const btnDisconnect = document.getElementById("btn-action-disconnect");
    const supportAbout = document.getElementById("btn-support-about");

    // --- Auto-fill IP ---
    // If the website is loaded from a PC (e.g. 192.168.1.15:5000), pre-fill the host IP.
    const detectedHost = window.location.hostname || "127.0.0.1";
    inputIp.value = detectedHost === "localhost" ? "127.0.0.1" : detectedHost;

    // ================= Navigation & View Management =================

    // Auto-transition from Splash to Home Screen after 2.2 seconds
    let splashTimeout = setTimeout(() => {
        navigateTo("screen-home");
    }, 2200);

    // Skip Splash Screen on click
    screens.splash.addEventListener("click", () => {
        clearTimeout(splashTimeout);
        navigateTo("screen-home");
    });

    function navigateTo(targetScreenId) {
        // Toggle visibility of bottom nav
        if (targetScreenId === "screen-splash") {
            bottomNav.classList.add("hidden");
        } else {
            bottomNav.classList.remove("hidden");
        }

        // Active screens toggle
        Object.entries(screens).forEach(([key, screenEl]) => {
            if (screenEl.id === targetScreenId) {
                screenEl.classList.add("active");
            } else {
                screenEl.classList.remove("active");
            }
        });

        // Set Nav Item active state
        navItems.forEach(item => {
            if (item.getAttribute("data-screen") === targetScreenId) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        // Ensure Keyboard Overlay closes on screen change
        closeKeyboardOverlay();
    }

    // Bottom Navigation Bar handler
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-screen");
            
            // Prevent navigating to mouse control if not connected (unless simulator mode is on)
            if (target === "screen-mouse" && !isConnected && !isSimulatorMode) {
                showToast("Please connect to a device first!");
                navigateTo("screen-home");
                return;
            }
            
            navigateTo(target);
        });
    });

    // Connection Method Tab Switcher (WiFi / Bluetooth / USB)
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabPanels.forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.getAttribute("data-tab");
            document.getElementById(`panel-${tabId}`).classList.add("active");
        });
    });

    // ================= Connection Protocols =================

    function updateConnectionUI(state) {
        statusDot.className = "status-indicator";
        
        if (state === "disconnected") {
            isConnected = false;
            isSimulatorMode = false;
            statusDot.classList.add("disconnect-state");
            statusText.textContent = "Not Connected";
            btnConnectWifi.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> Connect Now`;
            btnConnectWifi.disabled = false;
        } else if (state === "connecting") {
            statusDot.classList.add("connecting-state");
            statusText.textContent = "Connecting...";
            btnConnectWifi.innerHTML = `<span class="status-indicator connecting-state" style="margin-right:8px;box-shadow:none;"></span> Connecting...`;
            btnConnectWifi.disabled = true;
        } else if (state === "connected") {
            isConnected = true;
            statusDot.classList.add("connect-state");
            statusText.textContent = `Connected to ${lblDeviceTitle.textContent}`;
            btnConnectWifi.innerHTML = `Connected`;
            btnConnectWifi.disabled = false;
        } else if (state === "simulated") {
            isConnected = false;
            isSimulatorMode = true;
            statusDot.className = "status-indicator connect-state";
            statusText.textContent = "Connected (Simulated)";
            btnConnectWifi.innerHTML = `Running Simulator`;
            btnConnectWifi.disabled = false;
        }
    }

    function connectToServer(ip, port) {
        updateConnectionUI("connecting");
        
        // Timeout to initiate simulator fallback if server is unreachable
        const connectTimeout = setTimeout(() => {
            if (!isConnected) {
                if (socket) socket.close();
                startSimulatorFallback();
            }
        }, 3000);

        try {
            let wsUrl = "";
            // If user enters an ngrok address or an https domain, use wss:// (secure websocket)
            if (ip.includes("ngrok") || ip.includes(".app") || ip.includes(".dev") || ip.includes(".io")) {
                // Remove http/https if they pasted the full URL
                let cleanIp = ip.replace("https://", "").replace("http://", "").replace(/\/$/, "");
                wsUrl = `wss://${cleanIp}`;
            } else {
                // Local network connection defaults to port 5001
                const wsPort = 5001; 
                wsUrl = `ws://${ip}:${wsPort}`;
            }
            socket = new WebSocket(wsUrl);
            
            socket.onopen = () => {
                clearTimeout(connectTimeout);
                
                lastConnectedIp = ip;
                lastConnectedPort = port;
                
                const devName = inputDevice.value || "My Laptop";
                lblDeviceTitle.textContent = devName;
                lblDeviceAddress.textContent = `${ip}:${port}`;
                
                updateConnectionUI("connected");
                showToast("Successfully connected to PC!");
                
                setTimeout(() => {
                    navigateTo("screen-mouse");
                }, 800);
            };

            socket.onerror = (err) => {
                // Let the timeout handle fallback or close event handle failure
            };

            socket.onclose = () => {
                clearTimeout(connectTimeout);
                if (isConnected) {
                    showToast("Connection to server closed.");
                    updateConnectionUI("disconnected");
                    navigateTo("screen-home");
                }
            };
        } catch (e) {
            clearTimeout(connectTimeout);
            startSimulatorFallback();
        }
    }

    function startSimulatorFallback() {
        lblDeviceTitle.textContent = `${inputDevice.value || "My Laptop"} (Simulated)`;
        lblDeviceAddress.textContent = `${inputIp.value || "127.0.0.1"}:${inputPort.value || "5000"}`;
        
        updateConnectionUI("simulated");
        showToast("Server not detected. Running in Demo/Simulator Mode!");
        
        setTimeout(() => {
            navigateTo("screen-mouse");
        }, 800);
    }

    function sendMessage(msgObj) {
        if (isConnected && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgObj));
        } else if (isSimulatorMode) {
            // Log in simulator mode
            if (msgObj.type === "text") {
                showToast(`Simulator transmitted text: "${msgObj.text}"`);
            } else if (msgObj.type === "key") {
                showToast(`Simulator key: [${msgObj.key.toUpperCase()}]`);
            }
        }
    }

    // Connect trigger button
    btnConnectWifi.addEventListener("click", () => {
        if (isConnected || isSimulatorMode) {
            disconnectDevice();
        } else {
            const ip = inputIp.value.trim() || "127.0.0.1";
            const port = inputPort.value.trim() || "5000";
            connectToServer(ip, port);
        }
    });

    // USB Connection trigger
    btnConnectUsb.addEventListener("click", () => {
        updateConnectionUI("connecting");
        setTimeout(() => {
            lblDeviceTitle.textContent = "USB Device Connection";
            lblDeviceAddress.textContent = "Direct USB Interface";
            isSimulatorMode = true;
            updateConnectionUI("simulated");
            showToast("Connected via USB (Simulation)!");
            navigateTo("screen-mouse");
        }, 1200);
    });

    // Bluetooth scanner trigger
    btnScanBluetooth.addEventListener("click", () => {
        btnScanBluetooth.innerHTML = `<span class="status-indicator connecting-state" style="margin-right:8px;box-shadow:none;"></span> Scanning...`;
        btnScanBluetooth.disabled = true;
        
        setTimeout(() => {
            btnScanBluetooth.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg> Scan Devices`;
            btnScanBluetooth.disabled = false;
            showToast("Scan finished. 3 devices found.");
        }, 1500);
    });

    // Select Bluetooth device
    bluetoothDevices.forEach(device => {
        device.addEventListener("click", () => {
            const name = device.getAttribute("data-name");
            const addr = device.getAttribute("data-ip");
            
            updateConnectionUI("connecting");
            setTimeout(() => {
                lblDeviceTitle.textContent = name;
                lblDeviceAddress.textContent = addr;
                isSimulatorMode = true;
                updateConnectionUI("simulated");
                showToast(`Connected to ${name} via Bluetooth!`);
                navigateTo("screen-mouse");
            }, 1000);
        });
    });

    function disconnectDevice() {
        if (socket) {
            socket.close();
            socket = null;
        }
        updateConnectionUI("disconnected");
        showToast("Disconnected successfully.");
        navigateTo("screen-home");
    }

    btnDisconnect.addEventListener("click", disconnectDevice);
    document.getElementById("btn-action-disconnect").addEventListener("click", disconnectDevice);


    // ================= Trackpad Gestures Handler =================

    trackpadArea.addEventListener("touchstart", (e) => {
        // Prevent scrolling page on mobile
        e.preventDefault();
        
        touchStartTimestamp = Date.now();
        isMoving = false;
        
        // Single-finger vs Multi-finger gestures
        if (e.touches.length === 1) {
            isTwoFingerScrolling = false;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            
            // Render touch indicator cursor
            const rect = trackpadArea.getBoundingClientRect();
            const localX = e.touches[0].clientX - rect.left;
            const localY = e.touches[0].clientY - rect.top;
            
            touchGlowCursor.style.left = `${localX}px`;
            touchGlowCursor.style.top = `${localY}px`;
            touchGlowCursor.style.opacity = "1";
        } else if (e.touches.length === 2) {
            isTwoFingerScrolling = true;
            scrollLastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            touchGlowCursor.style.opacity = "0";
        }
    });

    trackpadArea.addEventListener("touchmove", (e) => {
        e.preventDefault();
        
        if (e.touches.length === 1 && !isTwoFingerScrolling) {
            const clientX = e.touches[0].clientX;
            const clientY = e.touches[0].clientY;
            
            const dx = clientX - lastX;
            const dy = clientY - lastY;
            
            // Check if touch shifted enough to be considered cursor movement
            if (Math.abs(dx) > clickMovementThreshold || Math.abs(dy) > clickMovementThreshold) {
                isMoving = true;
            }
            
            // Adjust delta calculations with Sensitivity multiplier (DPI)
            const finalDx = dx * sensitivity;
            const finalDy = dy * sensitivity;
            
            sendMessage({
                type: "move",
                dx: finalDx,
                dy: finalDy
            });
            
            lastX = clientX;
            lastY = clientY;

            // Track glow cursor
            const rect = trackpadArea.getBoundingClientRect();
            const localX = clientX - rect.left;
            const localY = clientY - rect.top;
            
            touchGlowCursor.style.left = `${localX}px`;
            touchGlowCursor.style.top = `${localY}px`;
        } else if (e.touches.length === 2 && isTwoFingerScrolling) {
            const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const scrollDy = currentY - scrollLastY;
            
            // Send vertical scroll commands (inverted for typical intuitive drag)
            const scrollAmt = -scrollDy * scrollSensitivity;
            
            sendMessage({
                type: "scroll",
                dy: scrollAmt
            });
            
            scrollLastY = currentY;
        }
    });

    trackpadArea.addEventListener("touchend", (e) => {
        e.preventDefault();
        touchGlowCursor.style.opacity = "0";
        
        // Tap action to Left Click
        if (!isMoving && !isTwoFingerScrolling) {
            const elapsed = Date.now() - touchStartTimestamp;
            if (elapsed < 250) {
                // Click Visual Cue on trackpad
                triggerTrackpadClickVisual(lastX, lastY);
                
                sendMessage({
                    type: "click",
                    button: "left",
                    action: "click"
                });
            }
        }
        
        isTwoFingerScrolling = false;
        isMoving = false;
    });

    function triggerTrackpadClickVisual(clientX, clientY) {
        const tapRipple = document.createElement("div");
        tapRipple.className = "touch-glowing-cursor";
        
        const rect = trackpadArea.getBoundingClientRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        
        tapRipple.style.left = `${localX}px`;
        tapRipple.style.top = `${localY}px`;
        tapRipple.style.width = "40px";
        tapRipple.style.height = "40px";
        tapRipple.style.opacity = "0.8";
        tapRipple.style.transition = "transform 0.25s ease-out, opacity 0.25s ease-out";
        tapRipple.style.transform = "translate(-50%, -50%) scale(0.1)";
        
        trackpadArea.appendChild(tapRipple);
        
        // Animate expand and fade out
        requestAnimationFrame(() => {
            tapRipple.style.transform = "translate(-50%, -50%) scale(1.6)";
            tapRipple.style.opacity = "0";
        });
        
        setTimeout(() => {
            tapRipple.remove();
        }, 300);
    }

    // ================= Click Controls (Left & Right Buttons) =================

    function bindClickButton(btnEl, buttonName) {
        // Touch events
        btnEl.addEventListener("touchstart", (e) => {
            e.preventDefault();
            btnEl.classList.add("active");
            sendMessage({
                type: "click",
                button: buttonName,
                action: "down"
            });
        });
        
        btnEl.addEventListener("touchend", (e) => {
            e.preventDefault();
            btnEl.classList.remove("active");
            sendMessage({
                type: "click",
                button: buttonName,
                action: "up"
            });
        });

        // Fallbacks for mouse click tests in emulator browser
        btnEl.addEventListener("mousedown", () => {
            if ('ontouchstart' in window) return;
            btnEl.classList.add("active");
            sendMessage({
                type: "click",
                button: buttonName,
                action: "down"
            });
        });

        btnEl.addEventListener("mouseup", () => {
            if ('ontouchstart' in window) return;
            btnEl.classList.remove("active");
            sendMessage({
                type: "click",
                button: buttonName,
                action: "up"
            });
        });
    }

    bindClickButton(btnLeftClick, "left");
    bindClickButton(btnRightClick, "right");


    // ================= Scroll Wheel Slider / Arrows =================

    // Arrow clicks
    btnScrollUp.addEventListener("click", () => {
        sendMessage({ type: "scroll", dy: 4 });
        animateNotch(4);
    });

    btnScrollDown.addEventListener("click", () => {
        sendMessage({ type: "scroll", dy: -4 });
        animateNotch(-4);
    });

    function animateNotch(amt) {
        const offset = amt > 0 ? -12 : 12;
        scrollNotch.style.transform = `translateY(calc(-50% + ${offset}px))`;
        setTimeout(() => {
            scrollNotch.style.transform = "translateY(-50%)";
        }, 120);
    }

    // Scroll Notch Drag Logic (spring back scroll)
    let isDraggingNotch = false;
    let notchStartY = 0;
    const scrollMaxTravel = 20; // max px notch can drag up/down

    scrollNotch.addEventListener("touchstart", (e) => {
        e.preventDefault();
        isDraggingNotch = true;
        notchStartY = e.touches[0].clientY;
        scrollNotch.style.transition = "none";
    });

    window.addEventListener("touchmove", (e) => {
        if (!isDraggingNotch) return;
        
        const clientY = e.touches[0].clientY;
        let deltaY = clientY - notchStartY;
        
        // Constrain movement
        if (deltaY > scrollMaxTravel) deltaY = scrollMaxTravel;
        if (deltaY < -scrollMaxTravel) deltaY = -scrollMaxTravel;
        
        // Move notch physically
        scrollNotch.style.transform = `translateY(calc(-50% + ${deltaY}px))`;
        
        // Proportional scroll triggers based on travel
        const scrollVal = -deltaY / 4;
        if (Math.abs(scrollVal) > 0.5) {
            sendMessage({
                type: "scroll",
                dy: scrollVal
            });
        }
    });

    window.addEventListener("touchend", () => {
        if (!isDraggingNotch) return;
        isDraggingNotch = false;
        
        // Spring back notch animation
        scrollNotch.style.transition = "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        scrollNotch.style.transform = "translateY(-50%)";
    });

    // Scroll Mode Switch Toggle
    toggleScrollMode.addEventListener("change", () => {
        const enabled = toggleScrollMode.checked;
        lblScrollState.textContent = enabled ? "Enabled" : "Disabled";
        lblScrollState.style.color = enabled ? "var(--color-success)" : "var(--text-muted)";
        // Inhibit/allow two-finger scroll
        scrollSensitivity = enabled ? 0.8 : 0;
    });


    // ================= Virtual Keyboard Overlay =================

    btnKeyboardTrigger.addEventListener("click", () => {
        overlayKeyboard.classList.add("open");
        kbHiddenInput.focus();
    });

    btnCloseKeyboard.addEventListener("click", closeKeyboardOverlay);
    
    function closeKeyboardOverlay() {
        overlayKeyboard.classList.remove("open");
        kbHiddenInput.blur();
        kbHiddenInput.value = "";
    }

    // Listen to input text changes to transmit characters
    kbHiddenInput.addEventListener("input", (e) => {
        const typedVal = e.target.value;
        if (typedVal.length > 0) {
            sendMessage({
                type: "text",
                text: typedVal
            });
            // Clear to prepare for next keystroke character
            kbHiddenInput.value = "";
        }
    });

    // Backspace button
    btnKbBackspace.addEventListener("click", () => {
        sendMessage({
            type: "key",
            key: "backspace"
        });
        kbHiddenInput.focus();
    });

    // Enter button
    btnKbEnter.addEventListener("click", () => {
        sendMessage({
            type: "key",
            key: "enter"
        });
        kbHiddenInput.focus();
    });


    // ================= Settings Screen Logic =================

    // Dark Mode Toggle
    toggleDarkMode.addEventListener("change", () => {
        if (toggleDarkMode.checked) {
            document.body.classList.add("dark-theme");
            document.body.classList.remove("light-theme");
        } else {
            document.body.classList.add("light-theme");
            document.body.classList.remove("dark-theme");
        }
    });

    // DPI Sensitivity Slider
    sliderDpi.addEventListener("input", () => {
        const val = parseInt(sliderDpi.value);
        if (val === 800) {
            sensitivity = 0.55;
            lblDpiValue.textContent = "Slow (800)";
        } else if (val === 1200) {
            sensitivity = 0.8;
            lblDpiValue.textContent = "Low (1200)";
        } else if (val === 1600) {
            sensitivity = 1.1;
            lblDpiValue.textContent = "Medium (1600)";
        } else if (val === 2000) {
            sensitivity = 1.45;
            lblDpiValue.textContent = "Fast (2000)";
        } else if (val === 2400) {
            sensitivity = 1.8;
            lblDpiValue.textContent = "High (2400)";
        } else if (val === 2800) {
            sensitivity = 2.15;
            lblDpiValue.textContent = "Super (2800)";
        } else if (val === 3200) {
            sensitivity = 2.5;
            lblDpiValue.textContent = "Ultra (3200)";
        }
    });

    // Menu Item Reconnect
    btnReconnect.addEventListener("click", () => {
        if (lastConnectedIp) {
            connectToServer(lastConnectedIp, lastConnectedPort);
        } else {
            showToast("No previous device profile found.");
        }
    });

    // Support screens click callbacks (Informational toasts)
    document.getElementById("btn-support-use").addEventListener("click", () => {
        showToast("How to Use: Connect WiFi client to same subnet, open URL.");
    });
    
    document.getElementById("btn-support-faq").addEventListener("click", () => {
        showToast("FAQ: Toggle firewall rules if connection times out.");
    });


    // ================= Utility Toast Notification =================

    function showToast(message) {
        // Remove active toasts
        const activeToast = document.querySelector(".app-toast");
        if (activeToast) activeToast.remove();

        const toast = document.createElement("div");
        toast.className = "app-toast";
        toast.textContent = message;
        
        // CSS Style Inject specifically for Toast
        toast.style.position = "absolute";
        toast.style.bottom = "84px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%) translateY(10px)";
        toast.style.backgroundColor = "rgba(14, 21, 36, 0.95)";
        toast.style.border = "1px solid var(--border-color)";
        toast.style.color = "var(--text-primary)";
        toast.style.padding = "10px 18px";
        toast.style.borderRadius = "20px";
        toast.style.fontSize = "0.8rem";
        toast.style.fontWeight = "500";
        toast.style.zIndex = "500";
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.25s ease, transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        toast.style.boxShadow = "0 8px 24px rgba(0,0,0,0.5), 0 0 1px 1px rgba(255,255,255,0.08)";
        toast.style.pointerEvents = "none";
        toast.style.textAlign = "center";
        toast.style.whiteSpace = "nowrap";

        document.querySelector(".app-container").appendChild(toast);
        
        // Render tick
        requestAnimationFrame(() => {
            toast.style.opacity = "1";
            toast.style.transform = "translateX(-50%) translateY(0)";
        });

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(-50%) translateY(10px)";
            setTimeout(() => toast.remove(), 250);
        }, 2500);
    }
});
