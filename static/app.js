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

    function updatePinDisplay(pinStr) {
        const str = String(pinStr).padStart(4, "0");
        for (let i = 0; i < 4; i++) {
            if (pinDigits[i]) pinDigits[i].textContent = str[i] || "-";
        }
    }

    function renderQrCode(url) {
        const qrContainer = document.getElementById("qrcode");
        if (!qrContainer) return;
        qrContainer.innerHTML = "";
        
        try {
            if (typeof QRCode !== "undefined") {
                new QRCode(qrContainer, {
                    text: url,
                    width: 125,
                    height: 125,
                    colorDark : "#070c14",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            } else {
                qrContainer.innerHTML = `<p style="font-size:0.75rem;color:#0088ff;text-align:center;">${url}</p>`;
            }
        } catch (e) {
            qrContainer.innerHTML = `<p style="font-size:0.75rem;color:#0088ff;text-align:center;">${url}</p>`;
        }
    }

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
            if (item.getAttribute("data-screen") === targetScreenId) {
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

    function startHeartbeat() {
        stopHeartbeat();
        heartbeatTimer = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "ping" }));
            }
        }, 10000);
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
                startSimulatorFallback("Connection timed out. Opened Interactive Mode.");
            }
        }, 3500);

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
                try {
                    const data = JSON.parse(event.data);
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
        const currentPin = inputPin.value.trim();
        if (currentPin) msgObj.code = currentPin;

        if (isConnected && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msgObj));
        } else if (isSimulatorMode) {
            if (msgObj.type === "text") showToast(`Transmitted: "${msgObj.text}"`);
            else if (msgObj.type === "keycode" || msgObj.type === "key") showToast(`Keycode: [${msgObj.key.toUpperCase()}]`);
        }
    }

    if (btnConnectWifi) {
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
    }

    if (btnOpenDirect) {
        btnOpenDirect.addEventListener("click", () => {
            const ip = inputIp.value.trim();
            const port = inputPort.value.trim() || "5001";
            const pin = inputPin.value.trim();
            if (ip && pin) connectToServer(ip, port, pin);
            else startSimulatorFallback("Opening Mouse & Keycode UI...");
            navigateTo("screen-mouse");
        });
    }

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

    function handleTabClose() {
        isUserDisconnect = true;
        if (autoReconnectTimer) clearTimeout(autoReconnectTimer);
        stopHeartbeat();
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            try { socket.close(1000, "Tab close"); } catch (e) {}
            socket = null;
        }
    }

    window.addEventListener("beforeunload", handleTabClose);
    window.addEventListener("pagehide", handleTabClose);

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

    if (btnScrollUp) btnScrollUp.addEventListener("click", () => { sendMessage({ type: "scroll", dy: 4 }); });
    if (btnScrollDown) btnScrollDown.addEventListener("click", () => { sendMessage({ type: "scroll", dy: -4 }); });

    // Keyboard Input Handlers
    if (kbLiveInput) {
        kbLiveInput.addEventListener("input", (e) => {
            const typedVal = e.target.value;
            if (typedVal.length > 0) {
                sendMessage({ type: "text", text: typedVal });
                kbLiveInput.value = "";
            }
        });
    }

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

    if (btnSendTextpad) {
        btnSendTextpad.addEventListener("click", () => {
            const content = kbTextpadInput ? kbTextpadInput.value : "";
            if (content && content.trim().length > 0) {
                sendMessage({ type: "text", text: content });
                showToast(`Sent ${content.length} characters to PC!`);
            }
        });
    }

    if (btnTextpadClear && kbTextpadInput) btnTextpadClear.addEventListener("click", () => { kbTextpadInput.value = ""; });
    if (btnClearAllText) btnClearAllText.addEventListener("click", () => { if (kbLiveInput) kbLiveInput.value = ""; if (kbTextpadInput) kbTextpadInput.value = ""; });

    keycodeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const keyName = btn.getAttribute("data-key");
            if (keyName) sendMessage({ type: "keycode", key: keyName });
        });
    });

    // PWA Support
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("sw.js").catch(() => {});
        });
    }

    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (btnInstallPwa) btnInstallPwa.classList.remove("hidden");
    });

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
