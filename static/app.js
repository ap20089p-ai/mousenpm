/* -------------------------------------------------------------
 * UNIFIED VIRTUAL MOUSE & KEYBOARD CONTROLLER (v3.5)
 * Automatic Desktop / Mobile View Detection & Controller
 * ------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
    
    // --- Application State ---
    let socket = null;
    let isConnected = false;
    let isSimulatorMode = false;
    let isServerActive = true;
    let sensitivity = 1.1;
    let scrollSensitivity = 0.8;
    let deferredPrompt = null;
    let heartbeatTimer = null;
    let autoReconnectTimer = null;
    let isUserDisconnect = false;

    // Trackpad gesture state
    let lastX = 0;
    let lastY = 0;
    let scrollLastY = 0;
    let isMoving = false;
    let isTwoFingerScrolling = false;
    let touchStartTimestamp = 0;

    // --- DOM Elements ---
    const viewDesktop = document.getElementById("view-desktop-dashboard");
    const viewMobile = document.getElementById("view-mobile-app");

    const btnSwitchToMobile = document.getElementById("btn-switch-to-mobile");
    const btnSwitchToDesktop = document.getElementById("btn-switch-to-desktop");

    // Desktop Controls
    const valDesktopIp = document.getElementById("val-desktop-ip");
    const valWsPort = document.getElementById("val-ws-port");
    const valMobileUrl = document.getElementById("val-mobile-url");
    const statusPill = document.getElementById("status-pill");
    const txtServerStatus = document.getElementById("txt-server-status");
    const btnToggleServer = document.getElementById("btn-toggle-server");
    const lblToggleText = document.getElementById("lbl-toggle-text");
    const btnCopyIp = document.getElementById("btn-copy-ip");
    const btnRegenPin = document.getElementById("btn-regen-pin");

    const overlayNetworkOff = document.getElementById("overlay-network-off");
    const overlayQrOff = document.getElementById("overlay-qr-off");

    const pinDigits = [
        document.getElementById("pin-d1"),
        document.getElementById("pin-d2"),
        document.getElementById("pin-d3"),
        document.getElementById("pin-d4")
    ];

    // Mobile Screens
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

    // Mobile Form Inputs
    const inputIp = document.getElementById("ip-address");
    const inputPort = document.getElementById("port-number");
    const inputPin = document.getElementById("connect-pin");
    const inputDevice = document.getElementById("device-name");
    const statusDot = document.querySelector(".connection-status .status-indicator");
    const statusText = document.getElementById("txt-status-detail");
    const btnConnectWifi = document.getElementById("btn-connect-wifi");
    const btnOpenDirect = document.getElementById("btn-open-direct");
    const btnInstallPwa = document.getElementById("btn-install-pwa");

    // Touchpad & Keycode Controls
    const trackpadArea = document.getElementById("trackpad-area");
    const touchGlowCursor = document.getElementById("touch-glow-cursor");
    const lblDeviceTitle = document.getElementById("lbl-device-title");
    const lblDeviceAddress = document.getElementById("lbl-device-address");
    const lblPillState = document.getElementById("lbl-pill-state");
    const btnLeftClick = document.getElementById("btn-left-click");
    const btnRightClick = document.getElementById("btn-right-click");
    const btnScrollUp = document.getElementById("btn-scroll-up");
    const btnScrollDown = document.getElementById("btn-scroll-down");
    const btnQuickKeyboard = document.getElementById("btn-quick-keyboard");

    const kbLiveInput = document.getElementById("kb-live-input");
    const btnLiveBackspace = document.getElementById("btn-live-backspace");
    const kbTextpadInput = document.getElementById("kb-textpad-input");
    const btnSendTextpad = document.getElementById("btn-send-textpad");
    const btnTextpadClear = document.getElementById("btn-textpad-clear");
    const btnClearAllText = document.getElementById("btn-clear-all-text");
    const lblKbStatus = document.getElementById("lbl-kb-status");
    const keycodeBtns = document.querySelectorAll(".keycode-btn");

    // Settings UI
    const sliderDpi = document.getElementById("slider-dpi");
    const lblDpiValue = document.getElementById("lbl-dpi-value");
    const btnReconnect = document.getElementById("btn-menu-reconnect");
    const btnDisconnect = document.getElementById("btn-action-disconnect");

    // --- Mode Detection & Switching ---
    const urlParams = new URLSearchParams(window.location.search);
    const paramMode = urlParams.get("mode");
    const paramIp = urlParams.get("ip");
    const paramPort = urlParams.get("port");
    const paramPin = urlParams.get("code") || urlParams.get("pin");

    const isMobileWidth = window.innerWidth <= 768;
    const forceMobile = paramMode === "mobile" || paramIp || isMobileWidth;

    if (forceMobile) {
        showMobileView();
    } else {
        showDesktopView();
    }

    function showDesktopView() {
        viewDesktop.classList.remove("hidden");
        viewMobile.classList.add("hidden");
        fetchServerInfo();
    }

    function showMobileView() {
        viewDesktop.classList.add("hidden");
        viewMobile.classList.remove("hidden");
        initMobileApp();
    }

    if (btnSwitchToMobile) {
        btnSwitchToMobile.addEventListener("click", showMobileView);
    }
    if (btnSwitchToDesktop) {
        btnSwitchToDesktop.addEventListener("click", showDesktopView);
    }

    // =================================================================
    // DESKTOP DASHBOARD CONTROLLER
    // =================================================================
    async function fetchServerInfo() {
        if (!isServerActive) return;
        try {
            const res = await fetch("/api/info");
            if (!res.ok) throw new Error("API error");
            const data = await res.json();
            
            if (valDesktopIp) valDesktopIp.textContent = data.ip || "127.0.0.1";
            if (valWsPort) valWsPort.textContent = data.ws_port || "5001";
            
            updatePinDisplay(data.pin || "7235");
            
            const mobileUrl = `http://${data.ip}:${data.http_port}/?mode=mobile&ip=${data.ip}&port=${data.ws_port}&code=${data.pin}`;
            if (valMobileUrl) valMobileUrl.textContent = mobileUrl;
            
            renderQrCode(mobileUrl);
        } catch (err) {
            if (valDesktopIp) valDesktopIp.textContent = window.location.hostname || "127.0.0.1";
            updatePinDisplay("7235");
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


    // ================= Navigation & View Management ==========
    if (btnToggleServer) {
        btnToggleServer.addEventListener("click", () => {
            isServerActive = !isServerActive;
            if (isServerActive) {
                statusPill.className = "server-status-pill online";
                txtServerStatus.textContent = "Server Running";
                btnToggleServer.className = "toggle-server-btn";
                lblToggleText.textContent = "Stop Server";
                if (overlayNetworkOff) overlayNetworkOff.classList.add("hidden");
                if (overlayQrOff) overlayQrOff.classList.add("hidden");
                fetchServerInfo();
            } else {
                statusPill.className = "server-status-pill offline";
                txtServerStatus.textContent = "Server Stopped";
                btnToggleServer.className = "toggle-server-btn start-state";
                lblToggleText.textContent = "Start Server";
                if (overlayNetworkOff) overlayNetworkOff.classList.remove("hidden");
                if (overlayQrOff) overlayQrOff.classList.remove("hidden");
                updatePinDisplay("----");
            }
        });
    }

    if (btnRegenPin) {
        btnRegenPin.addEventListener("click", async () => {
            if (!isServerActive) return;
            btnRegenPin.disabled = true;
            try {
                const res = await fetch("/api/pin/regen");
                if (res.ok) {
                    const data = await res.json();
                    if (data.pin) fetchServerInfo();
                }
            } catch (e) {}
            setTimeout(() => { btnRegenPin.disabled = false; }, 500);
        });
    }

    if (btnCopyIp) {
        btnCopyIp.addEventListener("click", () => {
            const ipText = valDesktopIp.textContent;
            if (ipText && ipText !== "Detecting...") {
                navigator.clipboard.writeText(ipText);
                btnCopyIp.textContent = "Copied!";
                setTimeout(() => { btnCopyIp.textContent = "Copy"; }, 1500);
            }
        });
    }

    // =================================================================
    // MOBILE CONTROLLER CONTROLLER
    // =================================================================
    function initMobileApp() {
        // Auto-fill IP/Port/PIN from URL parameters or storage
        const savedHost = window.localStorage.getItem("virtualMouse.lastConnectedIp") || "";
        const savedPort = window.localStorage.getItem("virtualMouse.lastConnectedPort") || "5001";
        const savedPin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || "";

        const detectedHost = window.location.hostname || "127.0.0.1";
        const isActualIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(detectedHost) && detectedHost !== "127.0.0.1";

        let initialIp = paramIp;
        if (!initialIp) {
            if (isActualIP) initialIp = detectedHost;
            else if (savedHost && savedHost !== "127.0.0.1" && savedHost !== "localhost") initialIp = savedHost;
            else initialIp = detectedHost === "localhost" ? "127.0.0.1" : (detectedHost || "");
        }

        if (inputIp) inputIp.value = initialIp;
        if (inputPort) inputPort.value = paramPort || savedPort || "5001";
        if (inputPin) inputPin.value = paramPin || savedPin || "";

        if (paramIp && paramPin) {
            setTimeout(() => {
                connectToServer(paramIp, paramPort || "5001", paramPin);
            }, 800);
        }

        let splashTimeout = setTimeout(() => {
            navigateTo("screen-home");
        }, 1800);

        if (screens.splash) {
            screens.splash.addEventListener("click", () => {
                clearTimeout(splashTimeout);
                navigateTo("screen-home");
            });
        }
    }

    function navigateTo(targetScreenId) {
        if (targetScreenId === "screen-splash") {
            if (bottomNav) bottomNav.classList.add("hidden");
        } else {
            if (bottomNav) bottomNav.classList.remove("hidden");
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

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            navigateTo(item.getAttribute("data-screen"));
        });
    });

    if (btnQuickKeyboard) {
        btnQuickKeyboard.addEventListener("click", () => {
            navigateTo("screen-keyboard");
            if (kbLiveInput) kbLiveInput.focus();
        });
    }

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabPanels.forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            const panel = document.getElementById(`panel-${btn.getAttribute("data-tab")}`);
            if (panel) panel.classList.add("active");
        });
    });

    // Connection UI State
    function updateConnectionUI(state, customMessage) {
        if (!statusDot || !statusText || !btnConnectWifi) return;
        statusDot.className = "status-indicator";
        
        if (state === "disconnected") {
            isConnected = false;
            isSimulatorMode = false;
            statusDot.classList.add("disconnect-state");
            statusText.textContent = customMessage || "Not Connected";
            btnConnectWifi.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg> Start & Connect`;
            btnConnectWifi.disabled = false;
            if (lblPillState) lblPillState.textContent = "Offline";
            if (lblKbStatus) lblKbStatus.textContent = "Offline (Interactive)";
        } else if (state === "connecting") {
            statusDot.classList.add("connecting-state");
            statusText.textContent = "Authenticating & Connecting...";
            btnConnectWifi.innerHTML = `<span class="status-indicator connecting-state" style="margin-right:8px;"></span> Connecting...`;
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
        const currentHost = window.location.hostname;
        if ((!ip || ip === "127.0.0.1" || ip === "localhost") && currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1") {
            ip = currentHost;
            if (inputIp) inputIp.value = ip;
        }

        if (autoReconnectTimer) clearTimeout(autoReconnectTimer);
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
                            if (lblDeviceTitle) lblDeviceTitle.textContent = devName;
                            if (lblDeviceAddress) lblDeviceAddress.textContent = `${ip}:${wsPort}`;
                            
                            updateConnectionUI("connected");
                            startHeartbeat();
                            isUserDisconnect = false;
                            showToast("Connected & Paired with PC successfully!");
                            
                            setTimeout(() => {
                                navigateTo("screen-mouse");
                            }, 500);
                        } else {
                            clearTimeout(connectTimeout);
                            showToast(data.message || "Invalid Connect PIN!");
                            updateConnectionUI("disconnected", "Invalid PIN");
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
        if (lblDeviceTitle) lblDeviceTitle.textContent = `${inputDevice.value || "My PC"} (Interactive)`;
        if (lblDeviceAddress) lblDeviceAddress.textContent = `${inputIp.value || "127.0.0.1"}:${inputPort.value || "5001"}`;
        updateConnectionUI("simulated");
        showToast(reason || "Opened Interactive Mode!");
        setTimeout(() => navigateTo("screen-mouse"), 500);
    }

    function sendMessage(msgObj) {
        // Attach PIN if available
        const currentPin = inputPin.value.trim();
        if (currentPin) msgObj.code = currentPin;

        if (isConnected && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgObj));
        } else if (isSimulatorMode) {
            if (msgObj.type === "text") showToast(`Transmitted: "${msgObj.text}"`);
            else if (msgObj.type === "keycode" || msgObj.type === "key") showToast(`Keycode: [${msgObj.key.toUpperCase()}]`);
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
            if (ip && pin) connectToServer(ip, port, pin);
            else startSimulatorFallback("Opening Mouse & Keycode UI...");
            navigateTo("screen-mouse");
        }
    });

    function disconnectDevice() {
        isUserDisconnect = true;
        if (autoReconnectTimer) clearTimeout(autoReconnectTimer);
        stopHeartbeat();
        if (socket) {
            try { socket.close(1000, "User disconnect"); } catch (e) {}
            socket = null;
        }
        updateConnectionUI("disconnected");
        showToast("Disconnected.");
        navigateTo("screen-home");
    }

    if (btnDisconnect) btnDisconnect.addEventListener("click", disconnectDevice);

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


    // Trackpad Handlers
    if (trackpadArea) {
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
                sendMessage({ type: "move", dx: deltaX, dy: deltaY });
                lastX = currentX;
                lastY = currentY;
                const rect = trackpadArea.getBoundingClientRect();
                touchGlowCursor.style.left = `${currentX - rect.left}px`;
                touchGlowCursor.style.top = `${currentY - rect.top}px`;
            } else if (isTwoFingerScrolling && e.touches.length === 2) {
                const currentScrollY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const deltaScrollY = (currentScrollY - scrollLastY) * scrollSensitivity;
                if (Math.abs(deltaScrollY) > 1) {
                    sendMessage({ type: "scroll", dy: deltaScrollY });
                    scrollLastY = currentScrollY;
                }
            }
        }, { passive: false });

        trackpadArea.addEventListener("touchend", (e) => {
            e.preventDefault();
            touchGlowCursor.classList.remove("active");
            const touchDuration = Date.now() - touchStartTimestamp;
            if (touchDuration < 250 && !isTwoFingerScrolling && e.changedTouches.length === 1) {
                sendMessage({ type: "click", button: "left", action: "click" });
            }
            if (e.touches.length === 0) {
                isMoving = false;
                isTwoFingerScrolling = false;
            }
        }, { passive: false });
    }

    function bindClickButton(btnEl, buttonName) {
        if (!btnEl) return;
        btnEl.addEventListener("touchstart", (e) => {
            e.preventDefault();
            sendMessage({ type: "click", button: buttonName, action: "down" });
        });
        btnEl.addEventListener("touchend", (e) => {
            e.preventDefault();
            sendMessage({ type: "click", button: buttonName, action: "up" });
        });
        btnEl.addEventListener("click", () => {
            sendMessage({ type: "click", button: buttonName, action: "click" });
        });
    }

    bindClickButton(btnLeftClick, "left");
    bindClickButton(btnRightClick, "right");

<<<<<<< HEAD
    // ================= Auto-Scroll & Scroll Wheel Controller ==========
=======
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

>>>>>>> parent of f13ef9f (chore: initialize project dependencies and update application configuration)
    const btnLiveEnter = document.getElementById("btn-live-enter");
    if (btnLiveEnter) {
        btnLiveEnter.addEventListener("click", () => {
            sendMessage({ type: "keycode", key: "enter" });
            if (kbLiveInput) kbLiveInput.focus();
        });
    }

    if (btnLiveBackspace) {
        btnLiveBackspace.addEventListener("click", () => {
            sendMessage({ type: "keycode", key: "backspace" });
            if (kbLiveInput) kbLiveInput.focus();
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

    // PWA Support
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("sw.js").catch(() => {});
        });
    }



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
        toast.style.position = "fixed";
        toast.style.bottom = "84px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%) translateY(10px)";
        toast.style.backgroundColor = "rgba(7, 12, 20, 0.95)";
        toast.style.border = "1px solid rgba(0, 240, 255, 0.3)";
        toast.style.color = "#ffffff";
        toast.style.padding = "10px 18px";
        toast.style.borderRadius = "20px";
        toast.style.fontSize = "0.8rem";
        toast.style.fontWeight = "500";
        toast.style.zIndex = "500";
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        toast.style.pointerEvents = "none";
        toast.style.textAlign = "center";
        toast.style.whiteSpace = "nowrap";

        document.body.appendChild(toast);
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
