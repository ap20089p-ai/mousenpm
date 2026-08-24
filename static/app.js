/* -------------------------------------------------------------
 * VIRTUAL MOUSE & KEYBOARD - FRONTEND CONTROLLER
 * Supports:
 * 1. PWA Service Worker & Install Prompt
 * 2. PIN Handshake Authentication & Network Discovery
 * 3. Live Keystroke Auto-Typing & Desktop TextPad Transmitter
 * 4. Keycode Buttons, Modifiers & PC Shortcuts
 * 5. Touchpad gestures, Multi-touch, DPI sensitivity & Fallbacks
 * ------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    // --- Application State ---
    let socket = null;
    let isConnected = false;
    let isSimulatorMode = false;
    let sensitivity = 1.1; // DPI multiplier (1600 = 1.1x)
    let scrollSensitivity = 0.8;
    let deferredPrompt = null;
    let heartbeatTimer = null;
    let autoReconnectTimer = null;
    let isUserDisconnect = false;

    // Trackpad gesture variables
    let lastX = 0;
    let lastY = 0;
    let scrollLastY = 0;
    let isMoving = false;
    let isTwoFingerScrolling = false;
    let touchStartTimestamp = 0;
    const clickMovementThreshold = 3;

    // --- DOM Elements ---
    const screens = {
        splash: document.getElementById("screen-splash"),
        home: document.getElementById("screen-home"),
        mouse: document.getElementById("screen-mouse"),
        keyboard: document.getElementById("screen-keyboard"),
        settings: document.getElementById("screen-settings")
    };
    
    const bottomNav = document.getElementById("main-bottom-nav");
    const navItems = document.querySelectorAll(".nav-item");
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    // WiFi Form Inputs & PIN
    const inputIp = document.getElementById("ip-address");
    const inputPort = document.getElementById("port-number");
    const inputPin = document.getElementById("connect-pin");
    const inputDevice = document.getElementById("device-name");
    const statusDot = document.querySelector(".connection-status .status-indicator");
    const statusText = document.getElementById("txt-status-detail");
    const btnConnectWifi = document.getElementById("btn-connect-wifi");
    const btnOpenDirect = document.getElementById("btn-open-direct");
    const btnConnectUsb = document.getElementById("btn-connect-usb");
    const btnInstallPwa = document.getElementById("btn-install-pwa");

    // Bluetooth Screen
    const btnScanBluetooth = document.getElementById("btn-scan-bluetooth");
    const bluetoothDevices = document.querySelectorAll(".device-item");

    // Mouse Controller UI
    const trackpadArea = document.getElementById("trackpad-area");
    const touchGlowCursor = document.getElementById("touch-glow-cursor");
    const lblDeviceTitle = document.getElementById("lbl-device-title");
    const lblDeviceAddress = document.getElementById("lbl-device-address");
    const lblPillState = document.getElementById("lbl-pill-state");
    const btnLeftClick = document.getElementById("btn-left-click");
    const btnRightClick = document.getElementById("btn-right-click");
    const btnScrollUp = document.getElementById("btn-scroll-up");
    const btnScrollDown = document.getElementById("btn-scroll-down");
    const scrollNotch = document.getElementById("scroll-wheel-notch");
    const btnQuickKeyboard = document.getElementById("btn-quick-keyboard");

    // Dedicated Keyboard & TextPad UI
    const kbLiveInput = document.getElementById("kb-live-input");
    const btnLiveBackspace = document.getElementById("btn-live-backspace");
    const kbTextpadInput = document.getElementById("kb-textpad-input");
    const btnSendTextpad = document.getElementById("btn-send-textpad");
    const btnTextpadClear = document.getElementById("btn-textpad-clear");
    const btnClearAllText = document.getElementById("btn-clear-all-text");
    const lblKbStatus = document.getElementById("lbl-kb-status");
    const pillLiveTransmitting = document.getElementById("pill-live-transmitting");
    const keycodeBtns = document.querySelectorAll(".keycode-btn");

    // Settings UI
    const sliderDpi = document.getElementById("slider-dpi");
    const lblDpiValue = document.getElementById("lbl-dpi-value");
    const btnReconnect = document.getElementById("btn-menu-reconnect");
    const btnDisconnect = document.getElementById("btn-action-disconnect");

    // --- PWA Service Worker Registration & Install Prompt ---
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js")
                .then((reg) => {
                    console.log("PWA Service Worker registered:", reg.scope);
                })
                .catch((err) => {
                    console.warn("Service Worker registration failed:", err);
                });
        });
    }

    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (btnInstallPwa) {
            btnInstallPwa.classList.remove("hidden");
        }
    });

    if (btnInstallPwa) {
        btnInstallPwa.addEventListener("click", async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === "accepted") {
                    showToast("Installing Virtual Mouse App...");
                }
                deferredPrompt = null;
                btnInstallPwa.classList.add("hidden");
            } else {
                showToast("App install prompt is ready in browser menu!");
            }
        });
    }

    // --- Read URL Parameters for 1-Click Connection & PIN ---
    const urlParams = new URLSearchParams(window.location.search);
    const paramIp = urlParams.get("ip");
    const paramPort = urlParams.get("port");
    const paramPin = urlParams.get("code") || urlParams.get("pin");

    // Restore saved settings or detected values
    const savedHost = window.localStorage.getItem("virtualMouse.lastConnectedIp") || "";
    const savedPort = window.localStorage.getItem("virtualMouse.lastConnectedPort") || "5001";
    const savedPin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || "";

    const detectedHost = window.location.hostname || "127.0.0.1";
    const isActualNetworkIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(detectedHost) && detectedHost !== "127.0.0.1";

    let initialIp = paramIp;
    if (!initialIp) {
        if (isActualNetworkIP) {
            // When opened on phone from PC server (e.g. http://10.145.195.86:5000), always use that IP!
            initialIp = detectedHost;
        } else if (savedHost && savedHost !== "127.0.0.1" && savedHost !== "localhost") {
            initialIp = savedHost;
        } else {
            initialIp = detectedHost === "localhost" ? "127.0.0.1" : (detectedHost || "");
        }
    }

    inputIp.value = initialIp;
    inputPort.value = paramPort || savedPort || "5001";
    inputPin.value = paramPin || savedPin || "";

    // Auto-connect on load if URL params or saved pairing credentials are present
    const targetAutoIp = paramIp || savedHost;
    const targetAutoPin = paramPin || savedPin;
    const targetAutoPort = paramPort || savedPort || "5000";

    if (targetAutoIp && targetAutoPin) {
        setTimeout(() => {
            if (!isConnected && !isUserDisconnect) {
                connectToServer(targetAutoIp, targetAutoPort, targetAutoPin);
            }
        }, 800);
    }


    // ================= Navigation & View Management =================

    let splashTimeout = setTimeout(() => {
        navigateTo("screen-home");
    }, 2000);

    screens.splash.addEventListener("click", () => {
        clearTimeout(splashTimeout);
        navigateTo("screen-home");
    });

    function navigateTo(targetScreenId) {
        if (targetScreenId === "screen-splash") {
            bottomNav.classList.add("hidden");
        } else {
            bottomNav.classList.remove("hidden");
        }

        Object.entries(screens).forEach(([key, screenEl]) => {
            if (screenEl && screenEl.id === targetScreenId) {
                screenEl.classList.add("active");
            } else if (screenEl) {
                screenEl.classList.remove("active");
            }
        });

        navItems.forEach(item => {
            const itemScreen = item.getAttribute("data-screen");
            if (itemScreen === targetScreenId ||
               ((targetScreenId === "screen-how-to-connect" || targetScreenId === "screen-troubleshooting") && itemScreen === "screen-settings")) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });
    }

    // Bottom Navigation Bar
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-screen");
            navigateTo(target);
        });
    });

    // Quick switch from Mouse screen to Keyboard screen
    if (btnQuickKeyboard) {
        btnQuickKeyboard.addEventListener("click", () => {
            navigateTo("screen-keyboard");
            if (kbLiveInput) kbLiveInput.focus();
        });
    }

    // Tab Switcher (WiFi / Bluetooth / USB)
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabPanels.forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.getAttribute("data-tab");
            const panel = document.getElementById(`panel-${tabId}`);
            if (panel) panel.classList.add("active");
        });
    });

    // ================= Connection Protocols & PIN Handshake =================

    function updateConnectionUI(state, customMessage) {
        statusDot.className = "status-indicator";
        
        if (state === "disconnected") {
            isConnected = false;
            isSimulatorMode = false;
            statusDot.classList.add("disconnect-state");
            statusText.textContent = customMessage || "Not Connected";
            btnConnectWifi.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> Start & Connect`;
            btnConnectWifi.disabled = false;
            if (lblPillState) lblPillState.textContent = "Offline";
            if (lblKbStatus) lblKbStatus.textContent = "Offline (Interactive)";
        } else if (state === "connecting") {
            statusDot.classList.add("connecting-state");
            statusText.textContent = "Authenticating & Connecting...";
            btnConnectWifi.innerHTML = `<span class="status-indicator connecting-state" style="margin-right:8px;box-shadow:none;"></span> Connecting...`;
            btnConnectWifi.disabled = true;
        } else if (state === "connected") {
            isConnected = true;
            statusDot.classList.add("connect-state");
            statusText.textContent = `Connected to ${lblDeviceTitle.textContent}`;
            btnConnectWifi.innerHTML = `Connected`;
            btnConnectWifi.disabled = false;
            if (lblPillState) lblPillState.textContent = "Active";
            if (lblKbStatus) lblKbStatus.textContent = "Live connected to PC";
        } else if (state === "simulated") {
            isConnected = false;
            isSimulatorMode = true;
            statusDot.className = "status-indicator connect-state";
            statusText.textContent = "Interactive Mode";
            btnConnectWifi.innerHTML = `Running Interactive`;
            btnConnectWifi.disabled = false;
            if (lblPillState) lblPillState.textContent = "Interactive";
            if (lblKbStatus) lblKbStatus.textContent = "Interactive Mode";
        }
    }

    // --- Keep-Alive Ping & Auto-Disconnect Helpers ---
    let lastPongReceivedTime = Date.now();

    function startHeartbeat() {
        stopHeartbeat();
        lastPongReceivedTime = Date.now();
        heartbeatTimer = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                // If no pong or traffic received in 15s, auto-disconnect cleanly
                if (Date.now() - lastPongReceivedTime > 15000) {
                    console.warn("Heartbeat timeout: Auto-disconnecting stale connection");
                    stopHeartbeat();
                    try { socket.close(); } catch (e) {}
                    updateConnectionUI("disconnected", "Auto-Disconnected (Lost Connection)");
                    showToast("Disconnected: PC server lost / timed out.");
                    return;
                }
                socket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
            }
        }, 5000); // Send ping every 5 seconds
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    function scheduleAutoReconnect(ip, port, pin) {
        if (autoReconnectTimer) clearTimeout(autoReconnectTimer);
        autoReconnectTimer = setTimeout(() => {
            if (!isConnected && !isUserDisconnect) {
                connectToServer(ip, port, pin);
            }
        }, 3000);
    }

    function connectToServer(ip, port, pin) {
        // Auto-fix: If opened on mobile and IP was set to 127.0.0.1, use the actual PC host IP
        const currentHost = window.location.hostname;
        if ((!ip || ip === "127.0.0.1" || ip === "localhost") && currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1") {
            ip = currentHost;
            if (inputIp) inputIp.value = ip;
        }

        if (autoReconnectTimer) {
            clearTimeout(autoReconnectTimer);
            autoReconnectTimer = null;
        }
        stopHeartbeat();
        if (socket) {
            try { socket.close(); } catch (e) {}
            socket = null;
        }

        updateConnectionUI("connecting");
        
        const connectTimeout = setTimeout(() => {
            if (!isConnected) {
                if (socket) socket.close();
                updateConnectionUI("disconnected", "Connection Timed Out");
                showToast("Could not connect to PC server.");
            }
        }, 4000);

        try {
            const wsPort = port || "5001";
            const isHttps = window.location.protocol === "https:";
            const wsProtocol = isHttps ? "wss" : "ws";
            
            socket = new WebSocket(`${wsProtocol}://${ip}:${wsPort}`);
            
            socket.onopen = () => {
                const codeToSend = pin || inputPin.value.trim() || "DEMO";
                socket.send(JSON.stringify({
                    type: "auth",
                    code: codeToSend
                }));
            };

            socket.onmessage = (event) => {
                lastPongReceivedTime = Date.now();
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "pong") {
                        // Heartbeat ack acknowledged
                        return;
                    }
                    if (data.type === "auth_result") {
                        if (data.status === "success") {
                            clearTimeout(connectTimeout);
                            
                            window.localStorage.setItem("virtualMouse.lastConnectedIp", ip);
                            window.localStorage.setItem("virtualMouse.lastConnectedPort", wsPort);
                            if (pin) window.localStorage.setItem("virtualMouse.lastConnectedPin", pin);
                            
                            const devName = inputDevice.value || "My PC";
                            lblDeviceTitle.textContent = devName;
                            lblDeviceAddress.textContent = `${ip}:${wsPort}`;
                            
                            updateConnectionUI("connected");
                            startHeartbeat();
                            isUserDisconnect = false;
                            showToast("Connected & Paired with PC successfully!");
                            
                            setTimeout(() => {
                                navigateTo("screen-mouse");
                            }, 600);
                        } else {
                            clearTimeout(connectTimeout);
                            showToast(data.message || "Invalid Connect PIN!");
                            updateConnectionUI("disconnected", "Invalid PIN / Code");
                            if (socket) socket.close();
                        }
                    }
                } catch (err) {}
            };


            socket.onerror = () => {
                // Error handled by timeout
            };

            socket.onclose = () => {
                clearTimeout(connectTimeout);
                stopHeartbeat();
                if (isConnected) {
                    updateConnectionUI("disconnected");
                    if (!isUserDisconnect) {
                        showToast("Connection lost. Reconnecting...");
                        scheduleAutoReconnect(ip, wsPort, pin);
                    } else {
                        showToast("Connection to PC closed.");
                    }
                }
            };
        } catch (e) {
            clearTimeout(connectTimeout);
            stopHeartbeat();
            startSimulatorFallback("Cannot connect directly. Running Interactive Mode.");
        }
    }

    function startSimulatorFallback(reason) {
        lblDeviceTitle.textContent = `${inputDevice.value || "My PC"} (Interactive)`;
        lblDeviceAddress.textContent = `${inputIp.value || "127.0.0.1"}:${inputPort.value || "5001"}`;
        
        updateConnectionUI("simulated");
        showToast(reason || "Opened in Interactive Mode!");
        
        setTimeout(() => {
            navigateTo("screen-mouse");
        }, 600);
    }

    function sendMessage(msgObj) {
        // Attach PIN if available
        const currentPin = inputPin.value.trim();
        if (currentPin) msgObj.code = currentPin;

        if (isConnected && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgObj));
        } else if (isSimulatorMode) {
            // Visual tactile feedback in interactive mode
            if (msgObj.type === "text") {
                showToast(`Transmitted: "${msgObj.text}"`);
            } else if (msgObj.type === "keycode" || msgObj.type === "key") {
                showToast(`Keycode: [${msgObj.key.toUpperCase()}]`);
            }
        }
    }

    // Option 1: Connect button
    btnConnectWifi.addEventListener("click", () => {
        if (isConnected) {
            disconnectDevice();
        } else {
            const ip = inputIp.value.trim() || "127.0.0.1";
            const port = inputPort.value.trim() || "5001";
            const pin = inputPin.value.trim();
            connectToServer(ip, port, pin);
        }
    });

    // Option 2: Direct "Open Mouse & Keycode UI" button
    btnOpenDirect.addEventListener("click", () => {
        const ip = inputIp.value.trim();
        const port = inputPort.value.trim() || "5001";
        const pin = inputPin.value.trim();

        if (ip && pin) {
            // Try connecting in background and immediately navigate
            connectToServer(ip, port, pin);
        } else {
            startSimulatorFallback("Opening full Mouse & Keycode UI...");
        }
        navigateTo("screen-mouse");
    });

    // USB Connection trigger
    btnConnectUsb.addEventListener("click", () => {
        updateConnectionUI("connecting");
        setTimeout(() => {
            lblDeviceTitle.textContent = "USB Device Connection";
            lblDeviceAddress.textContent = "Direct USB Cable Mode";
            isSimulatorMode = true;
            updateConnectionUI("simulated");
            showToast("Connected via USB (Interactive)!");
            navigateTo("screen-mouse");
        }, 900);
    });

    // Real Web Bluetooth Scanner & PAN Network Handler
    if (btnScanBluetooth) {
        btnScanBluetooth.addEventListener("click", async () => {
            if ("bluetooth" in navigator) {
                try {
                    btnScanBluetooth.innerHTML = `<span class="status-indicator connecting-state" style="margin-right:8px;box-shadow:none;"></span> Scanning Nearby Bluetooth...`;
                    btnScanBluetooth.disabled = true;

                    // Trigger browser native Web Bluetooth pairing picker
                    const device = await navigator.bluetooth.requestDevice({
                        acceptAllDevices: true
                    });

                    if (device) {
                        lblDeviceTitle.textContent = device.name || "Bluetooth Device";
                        lblDeviceAddress.textContent = "Direct Bluetooth Pair";
                        isSimulatorMode = true;
                        updateConnectionUI("simulated");
                        showToast(`Paired with ${device.name || "Bluetooth Device"}!`);
                        navigateTo("screen-mouse");
                    }
                } catch (err) {
                    if (err.name !== "NotFoundError") {
                        showToast("Bluetooth prompt cancelled or not granted.");
                    }
                } finally {
                    btnScanBluetooth.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11"></path></svg> Scan Bluetooth Devices`;
                    btnScanBluetooth.disabled = false;
                }
            } else {
                showToast("Web Bluetooth API is not supported in this browser. Use Bluetooth Tethering instead!");
            }
        });
    }

    const btnConnectBtPan = document.getElementById("btn-connect-bt-pan");
    if (btnConnectBtPan) {
        btnConnectBtPan.addEventListener("click", () => {
            // Connect to the PC's Bluetooth adapter IP
            const btIp = "169.254.205.112";
            updateConnectionUI("connecting");
            showToast("Connecting via Bluetooth Network...");
            connectToServer(btIp, "5001", inputPin.value.trim());
        });
    }

    // Bluetooth devices list items
    const btItems = document.querySelectorAll("#bt-device-list .device-item");
    btItems.forEach(device => {
        device.addEventListener("click", () => {
            const name = device.getAttribute("data-name") || "Windows PC (Bluetooth)";
            const addr = device.getAttribute("data-ip") || "169.254.205.112";
            lblDeviceTitle.textContent = name;
            lblDeviceAddress.textContent = addr;
            connectToServer(addr, "5001", inputPin.value.trim());
        });
    });

    function disconnectDevice() {
        isUserDisconnect = true;
        if (autoReconnectTimer) {
            clearTimeout(autoReconnectTimer);
            autoReconnectTimer = null;
        }
        stopHeartbeat();
        if (socket) {
            try { socket.close(1000, "User disconnected"); } catch (e) {}
            socket = null;
        }
        updateConnectionUI("disconnected");
        showToast("Disconnected.");
        navigateTo("screen-home");
    }

    btnDisconnect.addEventListener("click", disconnectDevice);

    // --- Persistent Connection: Auto-Reconnect when returning to App / Tab ---
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (!isConnected && !isUserDisconnect) {
                const ip = window.localStorage.getItem("virtualMouse.lastConnectedIp") || inputIp.value.trim();
                const port = window.localStorage.getItem("virtualMouse.lastConnectedPort") || inputPort.value.trim() || "5000";
                const pin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || inputPin.value.trim();
                if (ip && pin) {
                    showToast("Restoring connection to PC...");
                    connectToServer(ip, port, pin);
                }
            }
        }
    });

    window.addEventListener("online", () => {
        if (!isConnected && !isUserDisconnect) {
            const ip = window.localStorage.getItem("virtualMouse.lastConnectedIp") || inputIp.value.trim();
            const port = window.localStorage.getItem("virtualMouse.lastConnectedPort") || inputPort.value.trim() || "5000";
            const pin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || inputPin.value.trim();
            if (ip && pin) {
                connectToServer(ip, port, pin);
            }
        }
    });


    // ================= Trackpad Gestures Handler =================

    trackpadArea.addEventListener("touchstart", (e) => {
        e.preventDefault();
        touchStartTimestamp = Date.now();
        
        if (e.touches.length === 1) {
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            isMoving = true;
            isTwoFingerScrolling = false;

            const rect = trackpadArea.getBoundingClientRect();
            touchGlowCursor.style.left = `${lastX - rect.left}px`;
            touchGlowCursor.style.top = `${lastY - rect.top}px`;
            touchGlowCursor.classList.add("active");
        } else if (e.touches.length === 2) {
            isMoving = false;
            isTwoFingerScrolling = true;
            scrollLastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            touchGlowCursor.classList.remove("active");
        }
    }, { passive: false });

    trackpadArea.addEventListener("touchmove", (e) => {
        e.preventDefault();
        
        if (isMoving && e.touches.length === 1) {
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;

            let deltaX = (currentX - lastX) * sensitivity;
            let deltaY = (currentY - lastY) * sensitivity;

            sendMessage({
                type: "move",
                dx: deltaX,
                dy: deltaY
            });

            lastX = currentX;
            lastY = currentY;

            const rect = trackpadArea.getBoundingClientRect();
            touchGlowCursor.style.left = `${currentX - rect.left}px`;
            touchGlowCursor.style.top = `${currentY - rect.top}px`;
        } else if (isTwoFingerScrolling && e.touches.length === 2) {
            const currentScrollY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const deltaScrollY = (currentScrollY - scrollLastY) * scrollSensitivity;

            if (Math.abs(deltaScrollY) > 1) {
                sendMessage({
                    type: "scroll",
                    dy: deltaScrollY
                });
                scrollLastY = currentScrollY;
            }
        }
    }, { passive: false });

    trackpadArea.addEventListener("touchend", (e) => {
        e.preventDefault();
        touchGlowCursor.classList.remove("active");

        const touchDuration = Date.now() - touchStartTimestamp;
        if (touchDuration < 250 && !isTwoFingerScrolling && e.changedTouches.length === 1) {
            sendMessage({
                type: "click",
                button: "left",
                action: "click"
            });
            
            // Touch ripple visual
            touchGlowCursor.classList.add("active");
            setTimeout(() => touchGlowCursor.classList.remove("active"), 150);
        }

        if (e.touches.length === 0) {
            isMoving = false;
            isTwoFingerScrolling = false;
        }
    }, { passive: false });

    // Click Buttons
    function bindClickButton(btnEl, buttonName) {
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

        btnEl.addEventListener("click", () => {
            sendMessage({
                type: "click",
                button: buttonName,
                action: "click"
            });
        });
    }

    bindClickButton(btnLeftClick, "left");
    bindClickButton(btnRightClick, "right");

    // ================= Auto-Scroll & Scroll Wheel Controller =================
    let autoScrollInterval = null;
    let holdScrollTimeout = null;
    let isHandsFreeAutoScrolling = false;
    let handsFreeDirection = 0; // 1 for Up, -1 for Down

    function animateNotch(amt) {
        if (!scrollNotch) return;
        const offset = amt > 0 ? -12 : 12;
        scrollNotch.style.transform = `translateY(calc(-50% + ${offset}px))`;
        setTimeout(() => {
            scrollNotch.style.transform = "translateY(-50%)";
        }, 120);
    }

    function startHoldingScroll(direction) {
        stopAutoScroll();

        // Immediate first step
        const dy = direction * 4;
        sendMessage({ type: "scroll", dy: dy });
        animateNotch(dy);

        const btn = direction > 0 ? btnScrollUp : btnScrollDown;
        if (btn) btn.classList.add("auto-scrolling");

        // Start continuous scrolling loop after initial hold threshold
        holdScrollTimeout = setTimeout(() => {
            autoScrollInterval = setInterval(() => {
                sendMessage({ type: "scroll", dy: dy });
                animateNotch(dy);
            }, 60);
        }, 220);
    }

    function stopHoldingScroll() {
        if (holdScrollTimeout) {
            clearTimeout(holdScrollTimeout);
            holdScrollTimeout = null;
        }
        if (!isHandsFreeAutoScrolling && autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
        if (btnScrollUp) btnScrollUp.classList.remove("auto-scrolling");
        if (btnScrollDown) btnScrollDown.classList.remove("auto-scrolling");
    }

    function toggleHandsFreeAutoScroll(direction) {
        if (isHandsFreeAutoScrolling && handsFreeDirection === direction) {
            stopAutoScroll();
            showToast("Auto-Scroll Stopped");
            return;
        }

        stopAutoScroll();
        isHandsFreeAutoScrolling = true;
        handsFreeDirection = direction;

        const dy = direction * 3;
        const modeText = direction > 0 ? "AUTO ▲" : "AUTO ▼";
        const lblScroll = document.querySelector(".scroll-label");
        if (lblScroll) lblScroll.textContent = modeText;

        const activeBtn = direction > 0 ? btnScrollUp : btnScrollDown;
        if (activeBtn) activeBtn.classList.add("hands-free-active");

        showToast(`Hands-Free Auto-Scroll ${direction > 0 ? "Up" : "Down"} Active`);

        autoScrollInterval = setInterval(() => {
            sendMessage({ type: "scroll", dy: dy });
            animateNotch(dy);
        }, 70);
    }

    function stopAutoScroll() {
        if (holdScrollTimeout) {
            clearTimeout(holdScrollTimeout);
            holdScrollTimeout = null;
        }
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
        isHandsFreeAutoScrolling = false;
        handsFreeDirection = 0;

        const lblScroll = document.querySelector(".scroll-label");
        if (lblScroll) lblScroll.textContent = "Scroll";

        if (btnScrollUp) {
            btnScrollUp.classList.remove("auto-scrolling", "hands-free-active");
        }
        if (btnScrollDown) {
            btnScrollDown.classList.remove("auto-scrolling", "hands-free-active");
        }
    }

    function setupScrollArrow(btnEl, direction) {
        if (!btnEl) return;
        let lastTapTime = 0;

        // Pointer press-and-hold + double tap toggle
        btnEl.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            const now = Date.now();
            if (now - lastTapTime < 300) {
                toggleHandsFreeAutoScroll(direction);
                lastTapTime = 0;
                return;
            }
            lastTapTime = now;

            if (isHandsFreeAutoScrolling) {
                stopAutoScroll();
                return;
            }

            startHoldingScroll(direction);
        });

        btnEl.addEventListener("pointerup", (e) => {
            e.preventDefault();
            stopHoldingScroll();
        });

        btnEl.addEventListener("pointercancel", stopHoldingScroll);
        btnEl.addEventListener("mouseleave", stopHoldingScroll);

        // Standard click fallback
        btnEl.addEventListener("click", (e) => {
            if (!holdScrollTimeout && !autoScrollInterval) {
                const dy = direction * 4;
                sendMessage({ type: "scroll", dy: dy });
                animateNotch(dy);
            }
        });
    }

    setupScrollArrow(btnScrollUp, 1);
    setupScrollArrow(btnScrollDown, -1);

    // Tap on central scroll slider toggles auto-scroll
    const scrollSlider = document.querySelector(".scroll-indicator-slider");
    if (scrollSlider) {
        scrollSlider.addEventListener("click", () => {
            if (isHandsFreeAutoScrolling) {
                stopAutoScroll();
                showToast("Auto-Scroll Stopped");
            } else {
                toggleHandsFreeAutoScroll(-1); // Default auto scroll down
            }
        });
    }

    // Stop hands-free auto scroll if user touches trackpad
    trackpadArea.addEventListener("touchstart", () => {
        if (isHandsFreeAutoScrolling) {
            stopAutoScroll();
        }
    }, { passive: true });


    // Prevent Backspace key from ever navigating back or closing browser tab
    document.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" || e.keyCode === 8) {
            const active = document.activeElement;
            const isInputField = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
            if (!isInputField) {
                e.preventDefault();
            }
        }
    });

    // ================= Dedicated Keyboard & TextPad Tools =================

    function triggerLivePulse() {
        if (pillLiveTransmitting) {
            pillLiveTransmitting.textContent = "Sent ⚡";
            setTimeout(() => {
                pillLiveTransmitting.textContent = "Live Stream ⚡";
            }, 300);
        }
    }

    // Tool 1: Live Keystroke Auto-Typing (Supports Mobile Soft Keyboards & Backspace)
    kbLiveInput.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" || e.keyCode === 8) {
            e.preventDefault();
            sendMessage({
                type: "keycode",
                key: "backspace"
            });
            kbLiveInput.value = "";
            triggerLivePulse();
        } else if (e.key === "Enter" || e.keyCode === 13) {
            e.preventDefault();
            sendMessage({
                type: "keycode",
                key: "enter"
            });
            kbLiveInput.value = "";
            triggerLivePulse();
        }
    });

    kbLiveInput.addEventListener("beforeinput", (e) => {
        if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
            e.preventDefault();
            sendMessage({
                type: "keycode",
                key: "backspace"
            });
            kbLiveInput.value = "";
            triggerLivePulse();
        }
    });

    kbLiveInput.addEventListener("input", (e) => {
        if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
            kbLiveInput.value = "";
            return;
        }
        const typedVal = e.target.value;
        if (typedVal.length > 0) {
            sendMessage({
                type: "text",
                text: typedVal
            });
            kbLiveInput.value = "";
            triggerLivePulse();
        }
    });

    const btnLiveEnter = document.getElementById("btn-live-enter");
    if (btnLiveEnter) {
        btnLiveEnter.addEventListener("click", () => {
            sendMessage({
                type: "keycode",
                key: "enter"
            });
            kbLiveInput.focus();
        });
    }

    if (btnLiveBackspace) {
        btnLiveBackspace.addEventListener("click", () => {
            sendMessage({
                type: "keycode",
                key: "backspace"
            });
            kbLiveInput.focus();
        });
    }


    // Tool 2: Desktop TextPad (Multi-line block sender)
    btnSendTextpad.addEventListener("click", () => {
        const content = kbTextpadInput.value;
        if (!content || content.trim().length === 0) {
            showToast("Please enter some text in the TextPad first!");
            return;
        }

        sendMessage({
            type: "text",
            text: content
        });

        showToast(`Sent ${content.length} characters to Desktop TextPad!`);
    });

    btnTextpadClear.addEventListener("click", () => {
        kbTextpadInput.value = "";
        showToast("TextPad cleared");
    });

    btnClearAllText.addEventListener("click", () => {
        kbLiveInput.value = "";
        kbTextpadInput.value = "";
        showToast("All text cleared");
    });

    // Tool 3: Keycode Buttons & Modifiers
    keycodeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const keyName = btn.getAttribute("data-key");
            if (!keyName) return;

            // Visual feedback
            btn.classList.add("pressed");
            setTimeout(() => btn.classList.remove("pressed"), 180);

            if (navigator.vibrate) {
                navigator.vibrate(25);
            }

            sendMessage({
                type: "keycode",
                key: keyName
            });
        });
    });

    // ================= Settings Screen Logic =================



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

    btnReconnect.addEventListener("click", () => {
        const ip = window.localStorage.getItem("virtualMouse.lastConnectedIp") || inputIp.value.trim();
        const port = window.localStorage.getItem("virtualMouse.lastConnectedPort") || inputPort.value.trim();
        const pin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || inputPin.value.trim();
        if (ip && pin) {
            connectToServer(ip, port, pin);
        } else {
            showToast("Please enter IP and Connect PIN on the home screen.");
            navigateTo("screen-home");
        }
    });

    // Dedicated Screen Navigation for How to Connect & Troubleshooting
    const btnSupportUse = document.getElementById("btn-support-use");
    if (btnSupportUse) {
        btnSupportUse.addEventListener("click", () => {
            navigateTo("screen-how-to-connect");
        });
    }
    
    const btnSupportFaq = document.getElementById("btn-support-faq");
    if (btnSupportFaq) {
        btnSupportFaq.addEventListener("click", () => {
            navigateTo("screen-troubleshooting");
        });
    }

    const btnBackHowToConnect = document.getElementById("btn-back-how-to-connect");
    if (btnBackHowToConnect) {
        btnBackHowToConnect.addEventListener("click", () => {
            navigateTo("screen-settings");
        });
    }

    const btnBackTroubleshooting = document.getElementById("btn-back-troubleshooting");
    if (btnBackTroubleshooting) {
        btnBackTroubleshooting.addEventListener("click", () => {
            navigateTo("screen-settings");
        });
    }

    const btnGuideGoConnect = document.getElementById("btn-guide-go-connect");
    if (btnGuideGoConnect) {
        btnGuideGoConnect.addEventListener("click", () => {
            navigateTo("screen-home");
        });
    }

    const btnTroubleshootReconnect = document.getElementById("btn-troubleshoot-reconnect");
    if (btnTroubleshootReconnect) {
        btnTroubleshootReconnect.addEventListener("click", () => {
            const ip = window.localStorage.getItem("virtualMouse.lastConnectedIp") || inputIp.value.trim();
            const port = window.localStorage.getItem("virtualMouse.lastConnectedPort") || inputPort.value.trim();
            const pin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || inputPin.value.trim();
            if (ip && pin) {
                connectToServer(ip, port, pin);
            } else {
                navigateTo("screen-home");
            }
        });
    }


    // ================= Utility Toast Notification =================

    function showToast(message) {
        const activeToast = document.querySelector(".app-toast");
        if (activeToast) activeToast.remove();

        const toast = document.createElement("div");
        toast.className = "app-toast";
        toast.textContent = message;
        
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
