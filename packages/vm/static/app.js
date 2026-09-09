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
    const btnConnectUsb = document.getElementById("btn-connect-usb");
    const btnInstallPwa = document.getElementById("btn-install-pwa");

    // WiFi Accordion Elements
    const btnToggleWifiOptions = document.getElementById("btn-toggle-wifi-options");
    const wifiAdvancedOptions = document.getElementById("wifi-advanced-options");

    // Keypad Accordion Elements
    const btnTogglePrimaryActions = document.getElementById("btn-toggle-primary-actions");
    const contentPrimaryActions = document.getElementById("content-primary-actions");

    // Bluetooth Screen
    const btnScanBluetooth = document.getElementById("btn-scan-bluetooth");
    const btnConnectBtPan = document.getElementById("btn-connect-bt-pan");
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

    // Dedicated Keyboard & Compact Live Auto-Type UI
    const kbLiveInput = document.getElementById("kb-live-input");
    const btnLiveBackspace = document.getElementById("btn-live-backspace");
    const pillLiveTransmitting = document.getElementById("pill-live-transmitting");
    const keycodeBtns = document.querySelectorAll(".keycode-btn");
    const btnLiveClear = document.getElementById("btn-live-clear");
    const btnProminentEnter = document.getElementById("btn-prominent-enter");

    // Compact Media Transfer UI (Browse, Show, Direct Transfer)
    const btnBrowseImage = document.getElementById("btn-browse-image");
    const btnBrowseFile = document.getElementById("btn-browse-file");
    const btnShowPreview = document.getElementById("btn-show-preview");
    const compactImagePicker = document.getElementById("compact-image-picker");
    const compactFilePicker = document.getElementById("compact-file-picker");
    const compactStagedStrip = document.getElementById("compact-staged-strip");
    const stagedThumbBox = document.getElementById("staged-thumb-box");
    const stagedFileName = document.getElementById("staged-file-name");
    const stagedFileSize = document.getElementById("staged-file-size");
    const btnTransferDirectNow = document.getElementById("btn-transfer-direct-now");
    const btnCancelStaged = document.getElementById("btn-cancel-staged");
    const compactUploadProgress = document.getElementById("compact-upload-progress");
    const compactUploadBar = document.getElementById("compact-upload-bar");
    const compactUploadText = document.getElementById("compact-upload-text");
    const compactTransferStatus = document.getElementById("compact-transfer-status");
    const btnTriggerShowPreview = document.getElementById("btn-trigger-show-preview");

    // Image Preview Lightbox Modal Elements
    const modalImagePreview = document.getElementById("modal-image-preview");
    const previewModalImg = document.getElementById("preview-modal-img");
    const previewModalTitle = document.getElementById("preview-modal-title");
    const previewModalSub = document.getElementById("preview-modal-sub");
    const btnCloseImageModal = document.getElementById("btn-close-image-modal");
    const btnDismissImageModal = document.getElementById("btn-dismiss-image-modal");
    const btnModalDirectTransfer = document.getElementById("btn-modal-direct-transfer");

    // Art Studio Modal UI
    const modalArtTransfer = document.getElementById("modal-art-transfer");
    const btnCloseArtModal = document.getElementById("btn-close-art-modal");
    const artCanvas = document.getElementById("art-canvas");
    const colorSwatches = document.querySelectorAll(".color-swatch");
    const brushSizeBtns = document.querySelectorAll(".brush-size-btn");
    const btnClearArtCanvas = document.getElementById("btn-clear-art-canvas");
    const btnSubmitArtTransfer = document.getElementById("btn-submit-art-transfer");

    // Settings UI
    const sliderDpi = document.getElementById("slider-dpi");
    const lblDpiValue = document.getElementById("lbl-dpi-value");
    const selectSessionTimeout = document.getElementById("select-session-timeout");
    const btnReconnect = document.getElementById("btn-menu-reconnect");
    const btnDisconnect = document.getElementById("btn-action-disconnect");
    const chkAlwaysReconnect = document.getElementById("chk-always-reconnect");
    const toggleAlwaysReconnect = document.getElementById("toggle-always-reconnect");
    let clientSessionTimer = null;

    // File Transfer UI
    const btnTriggerUpload = document.getElementById("btn-trigger-upload");
    const fileUploadInput = document.getElementById("file-upload-input");
    const uploadProgressContainer = document.getElementById("upload-progress-container");
    const uploadFilename = document.getElementById("upload-filename");
    const uploadPercent = document.getElementById("upload-percent");
    const uploadProgressFill = document.getElementById("upload-progress-fill");
    const btnRefreshFiles = document.getElementById("btn-refresh-files");
    const fileListContainer = document.getElementById("file-list-container");

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

    // Restore Always Connect & Reconnect preference (default: true)
    let alwaysReconnect = window.localStorage.getItem("virtualMouse.alwaysReconnect") !== "false";
    if (chkAlwaysReconnect) chkAlwaysReconnect.checked = alwaysReconnect;
    if (toggleAlwaysReconnect) toggleAlwaysReconnect.checked = alwaysReconnect;

    function setAlwaysReconnect(val) {
        alwaysReconnect = !!val;
        window.localStorage.setItem("virtualMouse.alwaysReconnect", String(alwaysReconnect));
        if (chkAlwaysReconnect) chkAlwaysReconnect.checked = alwaysReconnect;
        if (toggleAlwaysReconnect) toggleAlwaysReconnect.checked = alwaysReconnect;
        showToast(alwaysReconnect ? "Always Connect & Reconnect: Enabled" : "Always Connect: Disabled");
    }

    if (chkAlwaysReconnect) {
        chkAlwaysReconnect.addEventListener("change", () => setAlwaysReconnect(chkAlwaysReconnect.checked));
    }
    if (toggleAlwaysReconnect) {
        toggleAlwaysReconnect.addEventListener("change", () => setAlwaysReconnect(toggleAlwaysReconnect.checked));
    }

    // Screen Wake Lock to prevent phone screen from turning off and disconnecting
    let wakeLock = null;
    async function requestWakeLock() {
        try {
            if ("wakeLock" in navigator && !wakeLock) {
                wakeLock = await navigator.wakeLock.request("screen");
                wakeLock.addEventListener("release", () => {
                    wakeLock = null;
                });
            }
        } catch (e) {
            // WakeLock not supported or ignored by platform
        }
    }

    function releaseWakeLock() {
        if (wakeLock) {
            try { wakeLock.release(); } catch (e) {}
            wakeLock = null;
        }
    }

    // Restore saved Connection Session Timeout (default 0 = Infinite / Never)
    const savedTimeout = window.localStorage.getItem("virtualMouse.sessionTimeout") || "0";
    if (selectSessionTimeout) {
        selectSessionTimeout.value = savedTimeout;
    }

    function stopClientSessionTimer() {
        if (clientSessionTimer) {
            clearTimeout(clientSessionTimer);
            clientSessionTimer = null;
        }
    }

    function startClientSessionTimer(timeoutMins) {
        stopClientSessionTimer();
        if (timeoutMins > 0) {
            clientSessionTimer = setTimeout(() => {
                console.warn(`Connection session timed out (${timeoutMins} mins)`);
                isUserDisconnect = true;
                if (socket) { try { socket.close(); } catch (e) {} }
                updateConnectionUI("disconnected", "Session Timed Out");
                const label = timeoutMins >= 60 ? `${timeoutMins / 60} hour(s)` : `${timeoutMins} mins`;
                showToast(`Session timed out (${label} limit reached). Reconnect whenever ready!`);
                navigateTo("screen-home");
            }, timeoutMins * 60 * 1000);
        }
    }

    function updateActiveSessionTimeout(timeoutMins) {
        window.localStorage.setItem("virtualMouse.sessionTimeout", String(timeoutMins));
        if (isConnected && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "set_session_timeout",
                timeoutMins: timeoutMins
            }));
        }
        if (isConnected) {
            startClientSessionTimer(timeoutMins);
        }
    }

    if (selectSessionTimeout) {
        selectSessionTimeout.addEventListener("change", () => {
            const mins = parseInt(selectSessionTimeout.value, 10) || 0;
            updateActiveSessionTimeout(mins);
            const label = mins === 0 ? "Infinite (Never Timeout)" : (mins >= 60 ? `${mins / 60} Hour(s)` : `${mins} Mins`);
            showToast(`Session Timeout set to: ${label}`);
        });
    }

    // Handle scan parameters and persistent auto-connect
    const hasScanParams = !!(paramIp && paramPin);
    if (hasScanParams) {
        window.localStorage.setItem("virtualMouse.userDisconnected", "false");
        isUserDisconnect = false;
        if (paramIp) window.localStorage.setItem("virtualMouse.lastConnectedIp", paramIp);
        if (paramPort) window.localStorage.setItem("virtualMouse.lastConnectedPort", paramPort);
        if (paramPin) window.localStorage.setItem("virtualMouse.lastConnectedPin", paramPin);
    }

    const userExplicitlyDisconnected = window.localStorage.getItem("virtualMouse.userDisconnected") === "true";
    const targetAutoIp = paramIp || savedHost || (isActualNetworkIP ? detectedHost : "");
    const targetAutoPin = paramPin || savedPin;
    const targetAutoPort = paramPort || savedPort || "5000";

    // If Always Connect is enabled or scanned via QR code, auto-connect immediately
    if (targetAutoIp && targetAutoPin && (alwaysReconnect || hasScanParams)) {
        if (hasScanParams) {
            const splashTagline = document.querySelector(".splash-tagline");
            if (splashTagline) {
                splashTagline.innerHTML = `<span style="color:#00f0ff;font-weight:600;display:inline-flex;align-items:center;gap:6px;"><span class="status-indicator connecting-state" style="display:inline-block;width:8px;height:8px;box-shadow:none;"></span> Connecting to PC (${targetAutoIp})...</span>`;
            }
        }
        if (!userExplicitlyDisconnected || hasScanParams) {
            setTimeout(() => {
                if (!isConnected && !isUserDisconnect) {
                    connectToServer(targetAutoIp, targetAutoPort, targetAutoPin);
                }
            }, 100);
        }
    }

    // ================= Navigation & View Management =================

    let splashTimeout = null;
    if (!hasScanParams) {
        splashTimeout = setTimeout(() => {
            if (!isConnected && screens.splash && screens.splash.classList.contains("active")) {
                navigateTo("screen-home");
            }
        }, 2000);
    }

    if (screens.splash) {
        screens.splash.addEventListener("click", () => {
            if (splashTimeout) clearTimeout(splashTimeout);
            if (!isConnected) {
                navigateTo("screen-home");
            }
        });
    }

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

    // --- Outside Expandable Card Details Sync & Accordion ---
    // (Removed connected card sync logic)

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

    // --- Expandable Card & Accordion Event Handlers ---
    if (btnToggleWifiOptions && wifiAdvancedOptions) {
        btnToggleWifiOptions.addEventListener("click", () => {
            btnToggleWifiOptions.classList.toggle("is-expanded");
            wifiAdvancedOptions.classList.toggle("is-expanded");
        });
    }

    if (btnTogglePrimaryActions && contentPrimaryActions) {
        btnTogglePrimaryActions.addEventListener("click", () => {
            btnTogglePrimaryActions.classList.toggle("is-expanded");
            contentPrimaryActions.classList.toggle("is-expanded");
        });
    }

    // --- USB Connect Button Handler ---
    if (btnConnectUsb) {
        btnConnectUsb.addEventListener("click", () => {
            const pin = inputPin.value.trim();
            if (!pin) {
                showToast("Please enter the Connect PIN in the WiFi tab first!");
                return;
            }
            // If they are on USB Tethering, window.location.hostname is the PC's USB IP.
            // If they are using ADB Reverse, they likely loaded the page via 127.0.0.1 or localhost.
            let usbIp = window.location.hostname;
            if (!usbIp || usbIp === "") {
                usbIp = "127.0.0.1";
            }
            const port = inputPort.value.trim() || "5001";
            
            showToast("Attempting USB Connection...");
            connectToServer(usbIp, port, pin);
        });
    }

    // --- Bluetooth Button Handlers ---
    if (btnScanBluetooth) {
        btnScanBluetooth.addEventListener("click", () => {
            showToast("Web Browsers do not support TCP connections over standard Bluetooth! Please use 'Bluetooth Network (PAN)' below instead.", 4000);
        });
    }

    if (btnConnectBtPan) {
        btnConnectBtPan.addEventListener("click", () => {
            const pin = inputPin.value.trim();
            if (!pin) {
                showToast("Please enter the Connect PIN in the WiFi tab first!");
                return;
            }
            let btIp = window.location.hostname;
            if (!btIp || btIp === "" || btIp === "localhost" || btIp === "127.0.0.1") {
                showToast("Cannot auto-detect Bluetooth IP. Please enter it manually in the WiFi tab.");
                return;
            }
            const port = inputPort.value.trim() || "5001";
            
            showToast("Attempting Bluetooth PAN Connection...");
            connectToServer(btIp, port, pin);
        });
    }

    // Initial sync on load

    // --- Keep-Alive Ping & Screen Wake Lock Helpers ---
    let lastPongReceivedTime = Date.now();
    let reconnectAttempts = 0;
    let isReconnecting = false;
    let lastConnectTarget = { ip: "", port: "", pin: "" };

    function startHeartbeat() {
        stopHeartbeat();
        lastPongReceivedTime = Date.now();
        heartbeatTimer = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
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

    function stopAutoReconnect() {
        if (autoReconnectTimer) {
            clearTimeout(autoReconnectTimer);
            autoReconnectTimer = null;
        }
        isReconnecting = false;
        reconnectAttempts = 0;
    }

    function scheduleAutoReconnect(ip, port, pin) {
        if (isUserDisconnect || !alwaysReconnect) return;

        const targetIp = ip || lastConnectTarget.ip || window.localStorage.getItem("virtualMouse.lastConnectedIp") || inputIp.value.trim();
        const targetPort = port || lastConnectTarget.port || window.localStorage.getItem("virtualMouse.lastConnectedPort") || inputPort.value.trim() || "5000";
        const targetPin = pin || lastConnectTarget.pin || window.localStorage.getItem("virtualMouse.lastConnectedPin") || inputPin.value.trim();

        if (!targetIp || !targetPin) return;

        lastConnectTarget = { ip: targetIp, port: targetPort, pin: targetPin };

        if (autoReconnectTimer) clearTimeout(autoReconnectTimer);
        isReconnecting = true;
        reconnectAttempts++;

        const delay = Math.min(3000, 1200 + Math.min(reconnectAttempts * 300, 1500));
        updateConnectionUI("connecting", `Reconnecting (attempt #${reconnectAttempts})...`);

        autoReconnectTimer = setTimeout(() => {
            if (!isConnected && !isUserDisconnect) {
                console.log(`[AutoReconnect] Infinite retry attempt #${reconnectAttempts} to ${lastConnectTarget.ip}:${lastConnectTarget.port}`);
                connectToServer(lastConnectTarget.ip, lastConnectTarget.port, lastConnectTarget.pin);
            }
        }, delay);
    }

    function connectToServer(ip, port, pin) {
        // Auto-fix: If opened on mobile and IP was set to 127.0.0.1, use the actual PC host IP
        const currentHost = window.location.hostname;
        if ((!ip || ip === "127.0.0.1" || ip === "localhost") && currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1") {
            ip = currentHost;
            if (inputIp) inputIp.value = ip;
        }

        if (ip && pin) {
            lastConnectTarget = { ip, port: port || "5000", pin };
        }

        stopHeartbeat();
        if (socket) {
            try { socket.close(); } catch (e) {}
            socket = null;
        }

        if (!isReconnecting) {
            updateConnectionUI("connecting");
        }
        
        const wsPort = port || "5000";
        const connectTimeout = setTimeout(() => {
            if (!isConnected) {
                if (socket) {
                    try { socket.close(); } catch (e) {}
                }
                if (alwaysReconnect && !isUserDisconnect) {
                    console.warn("[WS] Handshake timed out; retrying auto-reconnect...");
                    scheduleAutoReconnect(ip, wsPort, pin);
                } else {
                    updateConnectionUI("disconnected", "Connection Timed Out");
                    showToast("Could not connect to PC server.");
                    if (screens.splash && screens.splash.classList.contains("active")) {
                        navigateTo("screen-home");
                    }
                }
            }
        }, 5000);

        try {
            const isHttps = window.location.protocol === "https:";
            const wsProtocol = isHttps ? "wss" : "ws";
            
            socket = new WebSocket(`${wsProtocol}://${ip}:${wsPort}`);
            
            socket.onopen = () => {
                const codeToSend = pin || inputPin.value.trim();
                if (!codeToSend) {
                    showToast("Please enter the Connect PIN first.");
                    socket.close();
                    return;
                }
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
                    if (data.type === "chat_ack") {
                        handleChatAck(data);
                        return;
                    }
                    if (data.type === "chat") {
                        handleIncomingChat(data);
                        return;
                    }
                    if (data.type === "alt_tab_status") {
                        updateAltTabUI(data.active);
                        return;
                    }
                    if (data.type === "session_timeout") {
                        isUserDisconnect = true;
                        stopHeartbeat();
                        stopClientSessionTimer();
                        stopAutoReconnect();
                        releaseWakeLock();
                        if (socket) { try { socket.close(); } catch(e){} }
                        updateConnectionUI("disconnected", "Session Timed Out");
                        showToast(data.message || "Connection session timed out.");
                        navigateTo("screen-home");
                        return;
                    }
                    if (data.type === "auth_result") {
                        if (data.status === "success") {
                            clearTimeout(connectTimeout);
                            if (splashTimeout) clearTimeout(splashTimeout);
                            stopAutoReconnect();
                            
                            window.localStorage.setItem("virtualMouse.lastConnectedIp", ip);
                            window.localStorage.setItem("virtualMouse.lastConnectedPort", wsPort);
                            if (pin) window.localStorage.setItem("virtualMouse.lastConnectedPin", pin);
                            window.localStorage.setItem("virtualMouse.userDisconnected", "false");
                            
                            const devName = inputDevice.value || "My PC";
                            lblDeviceTitle.textContent = devName;
                            lblDeviceAddress.textContent = `${ip}:${wsPort}`;
                            
                            updateConnectionUI("connected");
                            startHeartbeat();
                            requestWakeLock();

                            // Default session timeout is 0 (Infinite / Never Disconnect)
                            const currentTimeoutMins = parseInt(selectSessionTimeout ? selectSessionTimeout.value : "0", 10) || 0;
                            updateActiveSessionTimeout(currentTimeoutMins);

                            isUserDisconnect = false;
                            showToast("Connected & Paired with PC successfully!");
                            
                            setTimeout(() => {
                                navigateTo("screen-keyboard");
                                if (kbLiveInput) {
                                    try { kbLiveInput.focus(); } catch (err) {}
                                }
                            }, 250);
                        } else {
                            clearTimeout(connectTimeout);
                            if (splashTimeout) clearTimeout(splashTimeout);
                            stopAutoReconnect();
                            showToast(data.message || "Invalid Connect PIN!");
                            updateConnectionUI("disconnected", "Invalid PIN / Code");
                            if (screens.splash && screens.splash.classList.contains("active")) {
                                navigateTo("screen-home");
                            }
                            if (socket) socket.close();
                        }
                    }
                } catch (err) {
                    console.error("[WS] Failed to parse message:", err);
                }
            };

            socket.onerror = () => {
                // Handled in onclose / connectTimeout
            };

            socket.onclose = () => {
                clearTimeout(connectTimeout);
                stopHeartbeat();
                stopClientSessionTimer();
                releaseWakeLock();
                const wasConnected = isConnected;
                isConnected = false;

                if (!isUserDisconnect && alwaysReconnect) {
                    scheduleAutoReconnect(ip, wsPort, pin);
                } else {
                    updateConnectionUI("disconnected");
                    if (wasConnected) {
                        showToast("Connection to PC closed.");
                    }
                }
            };
        } catch (e) {
            clearTimeout(connectTimeout);
            stopHeartbeat();
            console.warn("[WS] WebSocket construction failed:", e);
            if (alwaysReconnect && !isUserDisconnect) {
                scheduleAutoReconnect(ip, wsPort, pin);
            } else {
                startSimulatorFallback("Cannot connect directly. Running Interactive Mode.");
            }
        }
    }

    function startSimulatorFallback(reason) {
        if (splashTimeout) clearTimeout(splashTimeout);
        lblDeviceTitle.textContent = `${inputDevice.value || "My PC"} (Interactive)`;
        lblDeviceAddress.textContent = `${inputIp.value || "127.0.0.1"}:${inputPort.value || "5001"}`;
        
        updateConnectionUI("simulated");
        showToast(reason || "Opened in Interactive Mode!");
        
        setTimeout(() => {
            navigateTo("screen-keyboard");
            if (kbLiveInput) {
                try { kbLiveInput.focus(); } catch (err) {}
            }
        }, 300);
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
            isUserDisconnect = false;
            window.localStorage.setItem("virtualMouse.userDisconnected", "false");
            const ip = inputIp.value.trim() || "127.0.0.1";
            const port = inputPort.value.trim() || "5001";
            const pin = inputPin.value.trim();
            connectToServer(ip, port, pin);
        }
    });

    if (btnConnectBtPan) {
        btnConnectBtPan.addEventListener("click", () => {
            // Connect to the PC's Bluetooth adapter IP
            const btIp = window.location.hostname || inputIp.value.trim() || "127.0.0.1";
            isUserDisconnect = false;
            window.localStorage.setItem("virtualMouse.userDisconnected", "false");
            updateConnectionUI("connecting");
            showToast("Connecting via Bluetooth Network...");
            connectToServer(btIp, inputPort.value.trim() || "5001", inputPin.value.trim());
        });
    }

    // Bluetooth devices list items
    const btItems = document.querySelectorAll("#bt-device-list .device-item");
    btItems.forEach(device => {
        device.addEventListener("click", () => {
            const name = device.getAttribute("data-name") || "Windows PC (Bluetooth)";
            const addr = device.getAttribute("data-ip") || window.location.hostname || "127.0.0.1";
            isUserDisconnect = false;
            window.localStorage.setItem("virtualMouse.userDisconnected", "false");
            lblDeviceTitle.textContent = name;
            lblDeviceAddress.textContent = addr;
            connectToServer(addr, inputPort.value.trim() || "5001", inputPin.value.trim());
        });
    });

    function disconnectDevice() {
        isUserDisconnect = true;
        window.localStorage.setItem("virtualMouse.userDisconnected", "true");
        stopAutoReconnect();
        stopHeartbeat();
        stopClientSessionTimer();
        releaseWakeLock();
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
            if (isConnected) {
                requestWakeLock();
            } else if (!isUserDisconnect && alwaysReconnect) {
                const ip = window.localStorage.getItem("virtualMouse.lastConnectedIp") || inputIp.value.trim();
                const port = window.localStorage.getItem("virtualMouse.lastConnectedPort") || inputPort.value.trim() || "5000";
                const pin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || inputPin.value.trim();
                if (ip && pin) {
                    scheduleAutoReconnect(ip, port, pin);
                }
            }
        }
    });

    window.addEventListener("online", () => {
        if (!isConnected && !isUserDisconnect && alwaysReconnect) {
            const ip = window.localStorage.getItem("virtualMouse.lastConnectedIp") || inputIp.value.trim();
            const port = window.localStorage.getItem("virtualMouse.lastConnectedPort") || inputPort.value.trim() || "5000";
            const pin = window.localStorage.getItem("virtualMouse.lastConnectedPin") || inputPin.value.trim();
            if (ip && pin) {
                scheduleAutoReconnect(ip, port, pin);
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

    // Prominent Enter Button & Live Clear Button
    if (btnLiveClear && kbLiveInput) {
        btnLiveClear.addEventListener("click", () => {
            kbLiveInput.value = "";
            kbLiveInput.focus();
        });
    }

    if (btnProminentEnter) {
        btnProminentEnter.addEventListener("click", () => {
            sendMessage({
                type: "keycode",
                key: "enter"
            });
            if (kbLiveInput) kbLiveInput.focus();
        });
    }

    // =========================================================================
    // Direct Media Transfer Controller (Browse, Show, Direct PC Transfer)
    // =========================================================================
    let stagedMedia = null; // { file: File|Blob, name: string, size: number, type: string, previewUrl?: string }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    function stageCompactMedia(media) {
        stagedMedia = media;
        if (compactStagedStrip) compactStagedStrip.style.display = "flex";
        if (stagedFileName) stagedFileName.textContent = media.name;
        if (stagedFileSize) stagedFileSize.textContent = formatBytes(media.size);

        if (stagedThumbBox) {
            stagedThumbBox.innerHTML = "";
            if (media.previewUrl) {
                const img = document.createElement("img");
                img.src = media.previewUrl;
                img.alt = media.name;
                stagedThumbBox.appendChild(img);
            } else {
                stagedThumbBox.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" style="color:var(--color-cyan);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
            }
        }

        if (btnShowPreview) {
            btnShowPreview.disabled = false;
        }
    }

    function unstageCompactMedia() {
        stagedMedia = null;
        if (compactStagedStrip) compactStagedStrip.style.display = "none";
        if (compactImagePicker) compactImagePicker.value = "";
        if (compactFilePicker) compactFilePicker.value = "";
        if (btnShowPreview) btnShowPreview.disabled = true;
        if (compactUploadProgress) compactUploadProgress.style.display = "none";
    }

    if (btnCancelStaged) {
        btnCancelStaged.addEventListener("click", unstageCompactMedia);
    }

    // Browse Image Trigger
    if (btnBrowseImage && compactImagePicker) {
        btnBrowseImage.addEventListener("click", () => {
            compactImagePicker.click();
        });

        compactImagePicker.addEventListener("change", (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const file = files[0];
            const previewUrl = URL.createObjectURL(file);
            stageCompactMedia({
                file: file,
                name: file.name,
                size: file.size,
                type: "image",
                previewUrl: previewUrl
            });
            showToast(`Selected image: ${file.name}`);
        });
    }

    // Browse File Trigger
    if (btnBrowseFile && compactFilePicker) {
        btnBrowseFile.addEventListener("click", () => {
            compactFilePicker.click();
        });

        compactFilePicker.addEventListener("change", (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            const file = files[0];
            stageCompactMedia({
                file: file,
                name: file.name,
                size: file.size,
                type: "file"
            });
            showToast(`Selected file: ${file.name}`);
        });
    }

    // Show Lightbox Modal
    function openImagePreviewModal() {
        if (!stagedMedia) {
            showToast("Browse an image first to preview.");
            return;
        }
        if (modalImagePreview && previewModalImg) {
            previewModalImg.src = stagedMedia.previewUrl || "";
            if (previewModalTitle) previewModalTitle.textContent = stagedMedia.name;
            if (previewModalSub) previewModalSub.textContent = `${formatBytes(stagedMedia.size)} • Original Image (No Path)`;
            modalImagePreview.style.display = "flex";
        }
    }

    function closeImagePreviewModal() {
        if (modalImagePreview) modalImagePreview.style.display = "none";
    }

    if (btnShowPreview) {
        btnShowPreview.addEventListener("click", openImagePreviewModal);
    }
    if (btnTriggerShowPreview) {
        btnTriggerShowPreview.addEventListener("click", openImagePreviewModal);
    }
    if (btnCloseImageModal) {
        btnCloseImageModal.addEventListener("click", closeImagePreviewModal);
    }
    if (btnDismissImageModal) {
        btnDismissImageModal.addEventListener("click", closeImagePreviewModal);
    }

    // Direct Media Transfer Execution (Uploads original without showing paths)
    function executeDirectTransfer() {
        if (!stagedMedia) {
            showToast("Please browse an image or file first!");
            return;
        }

        const current = stagedMedia;
        closeImagePreviewModal();

        if (compactUploadProgress && compactUploadBar && compactUploadText) {
            compactUploadProgress.style.display = "block";
            compactUploadBar.style.width = "0%";
            compactUploadText.textContent = `Directly transferring ${current.name} to PC...`;
        }

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload", true);
        const pinVal = inputPin ? inputPin.value.trim() : "";
        xhr.setRequestHeader("x-pin", pinVal);
        xhr.setRequestHeader("x-file-name", encodeURIComponent(current.name));
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && compactUploadBar && compactUploadText) {
                const percent = Math.round((e.loaded / e.total) * 100);
                compactUploadBar.style.width = `${percent}%`;
                compactUploadText.textContent = `Transferring ${percent}%...`;
            }
        };

        xhr.onload = () => {
            if (compactUploadProgress) compactUploadProgress.style.display = "none";
            if (xhr.status === 200) {
                if (compactTransferStatus) {
                    compactTransferStatus.textContent = `✓ Original ${current.name} transferred & copied to PC clipboard!`;
                    compactTransferStatus.style.display = "block";
                    setTimeout(() => {
                        if (compactTransferStatus) compactTransferStatus.style.display = "none";
                    }, 4500);
                }
                showToast(`✓ Original ${current.name} transferred & copied to PC clipboard!`);
                unstageCompactMedia();
                if (typeof fetchFilesList === "function") fetchFilesList();
            } else {
                showToast("Transfer failed: " + xhr.responseText);
            }
        };

        xhr.onerror = () => {
            if (compactUploadProgress) compactUploadProgress.style.display = "none";
            showToast("Transfer error. Check PC connection.");
        };

        xhr.send(current.file);
    }

    if (btnTransferDirectNow) {
        btnTransferDirectNow.addEventListener("click", executeDirectTransfer);
    }
    if (btnModalDirectTransfer) {
        btnModalDirectTransfer.addEventListener("click", executeDirectTransfer);
    }

    // Art Studio Canvas Integration with Direct Transfer
    let artCtx = null;
    let isDrawingArt = false;
    let artColor = "#00f0ff";
    let artBrushSize = 5;
    let lastArtX = 0;
    let lastArtY = 0;

    function initArtCanvas() {
        if (!artCanvas) return;
        artCtx = artCanvas.getContext("2d");
        const rect = artCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = rect.width > 0 ? rect.width : 500;
        const height = 320;

        artCanvas.width = width * dpr;
        artCanvas.height = height * dpr;
        artCanvas.style.height = `${height}px`;

        artCtx.scale(dpr, dpr);
        artCtx.lineCap = "round";
        artCtx.lineJoin = "round";

        artCtx.fillStyle = "#080d16";
        artCtx.fillRect(0, 0, width, height);
    }

    function getCanvasCoordinates(e) {
        const rect = artCanvas.getBoundingClientRect();
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    function startArtStroke(e) {
        e.preventDefault();
        isDrawingArt = true;
        const coords = getCanvasCoordinates(e);
        lastArtX = coords.x;
        lastArtY = coords.y;
        artCtx.beginPath();
        artCtx.arc(lastArtX, lastArtY, artBrushSize / 2, 0, Math.PI * 2);
        artCtx.fillStyle = artColor;
        artCtx.fill();
    }

    function moveArtStroke(e) {
        if (!isDrawingArt) return;
        e.preventDefault();
        const coords = getCanvasCoordinates(e);
        artCtx.beginPath();
        artCtx.moveTo(lastArtX, lastArtY);
        artCtx.lineTo(coords.x, coords.y);
        artCtx.strokeStyle = artColor;
        artCtx.lineWidth = artBrushSize;
        artCtx.stroke();
        lastArtX = coords.x;
        lastArtY = coords.y;
    }

    function endArtStroke(e) {
        if (!isDrawingArt) return;
        e.preventDefault();
        isDrawingArt = false;
        artCtx.closePath();
    }

    if (artCanvas) {
        artCanvas.addEventListener("pointerdown", startArtStroke);
        artCanvas.addEventListener("pointermove", moveArtStroke);
        artCanvas.addEventListener("pointerup", endArtStroke);
        artCanvas.addEventListener("pointercancel", endArtStroke);
    }

    colorSwatches.forEach(swatch => {
        swatch.addEventListener("click", () => {
            colorSwatches.forEach(s => s.classList.remove("active"));
            swatch.classList.add("active");
            artColor = swatch.getAttribute("data-color") || "#00f0ff";
        });
    });

    brushSizeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            brushSizeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            artBrushSize = parseInt(btn.getAttribute("data-size") || "5", 10);
        });
    });

    if (btnClearArtCanvas && artCanvas) {
        btnClearArtCanvas.addEventListener("click", () => {
            if (!artCtx) return;
            const rect = artCanvas.getBoundingClientRect();
            artCtx.fillStyle = "#080d16";
            artCtx.fillRect(0, 0, rect.width, 360);
            showToast("Canvas cleared");
        });
    }

    if (btnCloseArtModal && modalArtTransfer) {
        btnCloseArtModal.addEventListener("click", () => {
            modalArtTransfer.style.display = "none";
        });
    }

    if (btnSubmitArtTransfer && artCanvas) {
        btnSubmitArtTransfer.addEventListener("click", () => {
            artCanvas.toBlob((blob) => {
                if (!blob) {
                    showToast("Could not export art canvas.");
                    return;
                }
                const filename = `sketch_${Date.now()}.png`;
                const previewUrl = URL.createObjectURL(blob);
                stageCompactMedia({
                    file: blob,
                    name: filename,
                    size: blob.size,
                    type: "image",
                    previewUrl: previewUrl
                });
                if (modalArtTransfer) modalArtTransfer.style.display = "none";
                showToast("Art sketch ready for direct transfer!");
            }, "image/png");
        });
    }

    // =========================================================================
    // Press-and-Hold (Auto-Repeat) for Backspace, Delete & Arrow Keys
    // =========================================================================
    function setupHoldToRepeatKey(element, getKeyName, options = {}) {
        if (!element) return;
        const initialDelay = options.initialDelay || 250;
        const repeatIntervalMs = options.repeatInterval || 60;
        let holdTimeout = null;
        let repeatInterval = null;
        let isHolding = false;
        let activePointerId = null;

        function fireKey() {
            const key = typeof getKeyName === 'function' ? getKeyName() : getKeyName;
            if (!key) return;
            sendMessage({ type: "keycode", key: key });
            if (navigator.vibrate) {
                try { navigator.vibrate(14); } catch (err) {}
            }
        }

        function startHold(e) {
            if (e && e.button && e.button !== 0) return;
            if (isHolding) return;
            isHolding = true;

            if (e && e.pointerId != null && element.setPointerCapture) {
                try {
                    element.setPointerCapture(e.pointerId);
                    activePointerId = e.pointerId;
                } catch (err) {}
            }

            element.classList.add("pressed");
            fireKey();

            holdTimeout = setTimeout(() => {
                element.classList.add("repeating");
                repeatInterval = setInterval(() => {
                    fireKey();
                }, repeatIntervalMs);
            }, initialDelay);
        }

        function stopHold(e) {
            if (!isHolding) return;
            isHolding = false;

            if (activePointerId != null && element.releasePointerCapture) {
                try {
                    element.releasePointerCapture(activePointerId);
                } catch (err) {}
                activePointerId = null;
            }
            if (holdTimeout) {
                clearTimeout(holdTimeout);
                holdTimeout = null;
            }
            if (repeatInterval) {
                clearInterval(repeatInterval);
                repeatInterval = null;
            }
            element.classList.remove("pressed", "repeating");
        }

        // Pointer Events (primary modern input)
        element.addEventListener("pointerdown", startHold);
        element.addEventListener("pointerup", stopHold);
        element.addEventListener("pointercancel", stopHold);
        element.addEventListener("pointerleave", (e) => {
            if (e.pointerType === "mouse") stopHold(e);
        });

        // Touch event fallbacks for mobile browsers
        element.addEventListener("touchend", stopHold, { passive: true });
        element.addEventListener("touchcancel", stopHold, { passive: true });

        // Mouse fallbacks
        element.addEventListener("mouseup", stopHold);

        // Suppress default context menu & click
        element.addEventListener("contextmenu", (e) => e.preventDefault());
        element.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    // Attach Hold-to-Repeat to Live Backspace pill
    if (btnLiveBackspace) {
        setupHoldToRepeatKey(btnLiveBackspace, "backspace");
    }

    // Attach Hold-to-Repeat to all buttons with .hold-repeat-btn (Arrow keys, Backspace, Delete)
    const holdRepeatBtns = document.querySelectorAll(".hold-repeat-btn");
    holdRepeatBtns.forEach(btn => {
        if (btn === btnLiveBackspace) return;
        const key = btn.getAttribute("data-key");
        if (key) {
            setupHoldToRepeatKey(btn, key);
        }
    });

    // Enter Key Dedicated Trigger
    if (btnProminentEnter) {
        let enterDebounce = false;
        function triggerEnterKey(e) {
            if (e && e.button && e.button !== 0) return;
            if (e && e.cancelable) e.preventDefault();
            if (enterDebounce) return;
            enterDebounce = true;
            setTimeout(() => { enterDebounce = false; }, 140);

            btnProminentEnter.classList.add("pressed");
            setTimeout(() => btnProminentEnter.classList.remove("pressed"), 180);

            if (navigator.vibrate) {
                try { navigator.vibrate(25); } catch (err) {}
            }

            if (altTabCycleStep > 0) {
                finishPrimaryAltTab();
            }

            sendMessage({
                type: "keycode",
                key: "enter"
            });
        }

        btnProminentEnter.addEventListener("pointerdown", triggerEnterKey);
        btnProminentEnter.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerEnterKey(e);
        });
    }

    // =========================================================================
    // Primary Key & Modifier Alt+Tab App Switcher Controller
    // =========================================================================
    const btnPrimaryAltTab = document.getElementById("btn-primary-alt-tab");
    let altTabCycleStep = 0;
    let altTabReleaseTimer = null;
    let altTabHoldInterval = null;

    function stepPrimaryAltTab() {
        altTabCycleStep++;
        sendMessage({ type: "alt_tab_step", direction: "next" });

        if (btnPrimaryAltTab) {
            btnPrimaryAltTab.classList.add("cycling");
            const screenLabel = altTabCycleStep === 1 ? "2nd App" : altTabCycleStep === 2 ? "3rd App" : `${altTabCycleStep + 1}th App`;
            btnPrimaryAltTab.textContent = `Alt+Tab (${screenLabel})`;
        }

        if (navigator.vibrate) navigator.vibrate(22);

        if (altTabReleaseTimer) clearTimeout(altTabReleaseTimer);
        altTabReleaseTimer = setTimeout(() => {
            finishPrimaryAltTab();
        }, 1800);

        const screenName = altTabCycleStep === 1 ? "2nd" : altTabCycleStep === 2 ? "3rd" : `${altTabCycleStep + 1}th`;
        showToast(`Swapping to ${screenName} screen (Tap again for next app)...`);
    }

    function finishPrimaryAltTab() {
        if (altTabReleaseTimer) {
            clearTimeout(altTabReleaseTimer);
            altTabReleaseTimer = null;
        }
        if (altTabHoldInterval) {
            clearInterval(altTabHoldInterval);
            altTabHoldInterval = null;
        }
        if (altTabCycleStep > 0) {
            sendMessage({ type: "alt_tab_release" });
            showToast("Switched to app ✓");
        }
        altTabCycleStep = 0;
        if (btnPrimaryAltTab) {
            btnPrimaryAltTab.classList.remove("cycling");
            btnPrimaryAltTab.textContent = "Alt+Tab ⇥";
        }
    }

    if (btnPrimaryAltTab) {
        let holdStartTimer = null;
        btnPrimaryAltTab.addEventListener("pointerdown", (e) => {
            if (e.button && e.button !== 0) return;
            stepPrimaryAltTab();

            // Continuous hold to advance tabs
            holdStartTimer = setTimeout(() => {
                altTabHoldInterval = setInterval(() => {
                    stepPrimaryAltTab();
                }, 320);
            }, 380);
        });

        const stopHoldAction = () => {
            if (holdStartTimer) {
                clearTimeout(holdStartTimer);
                holdStartTimer = null;
            }
            if (altTabHoldInterval) {
                clearInterval(altTabHoldInterval);
                altTabHoldInterval = null;
            }
        };

        btnPrimaryAltTab.addEventListener("pointerup", stopHoldAction);
        btnPrimaryAltTab.addEventListener("pointercancel", stopHoldAction);
        btnPrimaryAltTab.addEventListener("pointerleave", stopHoldAction);

        btnPrimaryAltTab.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    // Tool 3: Keycode Buttons & Modifiers
    keycodeBtns.forEach(btn => {
        // Skip buttons with dedicated hold handlers, primary Alt+Tab, or dedicated Enter
        if (btn.classList.contains("hold-repeat-btn") || btn === btnPrimaryAltTab || btn === btnProminentEnter) {
            return;
        }

        btn.addEventListener("click", () => {
            // Any other keycode press finishes any active Alt+Tab session
            if (altTabCycleStep > 0) {
                finishPrimaryAltTab();
            }

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
            isUserDisconnect = false;
            window.localStorage.setItem("virtualMouse.userDisconnected", "false");
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
                isUserDisconnect = false;
                window.localStorage.setItem("virtualMouse.userDisconnected", "false");
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

    // --- File Transfer Logic ---
    if (btnTriggerUpload && fileUploadInput) {
        btnTriggerUpload.addEventListener("click", () => {
            fileUploadInput.click();
        });

        fileUploadInput.addEventListener("change", (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            uploadFile(files[0]);
        });
    }

    if (btnRefreshFiles) {
        btnRefreshFiles.addEventListener("click", fetchFilesList);
    }

    function uploadFile(file) {
        if (!uploadProgressContainer || !uploadFilename || !uploadPercent || !uploadProgressFill) return;
        
        uploadProgressContainer.style.display = "block";
        uploadFilename.textContent = file.name;
        uploadPercent.textContent = "0%";
        uploadProgressFill.style.width = "0%";
        btnTriggerUpload.disabled = true;

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload", true);
        xhr.setRequestHeader("x-pin", inputPin.value.trim());
        xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
        xhr.setRequestHeader("Content-Type", "application/octet-stream");

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                uploadPercent.textContent = percentComplete + "%";
                uploadProgressFill.style.width = percentComplete + "%";
            }
        };

        xhr.onload = () => {
            btnTriggerUpload.disabled = false;
            if (xhr.status === 200) {
                uploadPercent.textContent = "Done!";
                showToast("File uploaded successfully");
                setTimeout(() => {
                    uploadProgressContainer.style.display = "none";
                    fetchFilesList(); // refresh list automatically
                }, 1500);
            } else {
                // Fix 4: 413 is now returned for oversized files — show a clear message
                const friendly = xhr.status === 413
                    ? "File too large! Maximum size is 200 MB."
                    : "Upload failed (" + xhr.status + ")";
                uploadPercent.textContent = "Error";
                uploadProgressFill.style.background = "#ef4444";
                showToast(friendly);
                setTimeout(() => {
                    uploadProgressContainer.style.display = "none";
                    uploadProgressFill.style.background = "var(--color-cyan)";
                }, 3000);
            }
            fileUploadInput.value = ""; // clear input
        };

        xhr.onerror = () => {
            btnTriggerUpload.disabled = false;
            uploadPercent.textContent = "Error";
            uploadProgressFill.style.background = "#ef4444";
            showToast("Upload error. Check connection.");
            setTimeout(() => {
                uploadProgressContainer.style.display = "none";
                uploadProgressFill.style.background = "var(--color-cyan)";
            }, 3000);
            fileUploadInput.value = "";
        };

        xhr.send(file);
    }

    function fetchFilesList() {
        if (!fileListContainer) return;
        
        fetch(`/api/files?pin=${encodeURIComponent(inputPin.value.trim())}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    showToast(data.error);
                    return;
                }
                renderFilesList(data);
            })
            .catch(err => {
                console.error("Failed to fetch files:", err);
                fileListContainer.innerHTML = '<p class="empty-state" style="color:#ef4444;">Failed to load files</p>';
            });
    }

    function renderFilesList(files) {
        if (!fileListContainer) return;
        fileListContainer.innerHTML = "";
        
        if (files.length === 0) {
            fileListContainer.innerHTML = '<p class="empty-state">No files found on PC.</p>';
            return;
        }

        files.forEach(f => {
            const sizeKB = (f.size / 1024).toFixed(1);
            let sizeStr = sizeKB + " KB";
            if (sizeKB > 1024) {
                sizeStr = (sizeKB / 1024).toFixed(2) + " MB";
            }

            const item = document.createElement("div");
            item.className = "file-list-item";
            
            const fileInfo = document.createElement("div");
            fileInfo.className = "file-info";

            const fileNameSpan = document.createElement("span");
            fileNameSpan.className = "file-name";
            fileNameSpan.title = f.name;
            fileNameSpan.textContent = f.name;

            const fileSizeSpan = document.createElement("span");
            fileSizeSpan.className = "file-size";
            fileSizeSpan.textContent = sizeStr;

            fileInfo.appendChild(fileNameSpan);
            fileInfo.appendChild(fileSizeSpan);

            const fileActions = document.createElement("div");
            fileActions.className = "file-actions";

            const downloadAnchor = document.createElement("a");
            downloadAnchor.href = `/api/files/${encodeURIComponent(f.name)}?pin=${encodeURIComponent(inputPin.value.trim())}`;
            downloadAnchor.className = "file-action-btn";
            downloadAnchor.setAttribute("download", "");
            downloadAnchor.title = "Download";
            downloadAnchor.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "file-action-btn del-btn";
            deleteBtn.setAttribute("data-filename", f.name);
            deleteBtn.title = "Delete from PC";
            deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

            fileActions.appendChild(downloadAnchor);
            fileActions.appendChild(deleteBtn);

            item.appendChild(fileInfo);
            item.appendChild(fileActions);
            fileListContainer.appendChild(item);
        });

        // Attach delete listeners
        const delBtns = fileListContainer.querySelectorAll(".del-btn");
        delBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const filename = e.currentTarget.getAttribute("data-filename");
                if (confirm(`Delete ${filename} from PC?`)) {
                    deleteFile(filename);
                }
            });
        });
    }

    function deleteFile(filename) {
        fetch(`/api/files/${encodeURIComponent(filename)}?pin=${encodeURIComponent(inputPin.value.trim())}`, {
            method: 'DELETE'
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("Deleted " + filename);
                fetchFilesList();
            } else {
                showToast("Failed to delete");
            }
        })
        .catch(err => {
            console.error("Delete error:", err);
            showToast("Delete error");
        });
    }

    // Auto-fetch files if the settings screen is opened
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            if (item.getAttribute("data-screen") === "screen-settings") {
                fetchFilesList();
            }
        });
    });

});
