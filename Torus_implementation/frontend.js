(() => {
  const CALL_STATE = {
    WAITING: "waiting",
    CONNECTED: "connected"
  };

  // Prefer the local signaling server on port 5002 (matches server.js default)
  const DEFAULT_SIGNAL_SERVER = (window.location.port === '3000' || window.location.port === '') ? window.location.origin : window.location.protocol + '//' + window.location.hostname + ':5002';
  const RTC_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:openrelay.metered.ca:80" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turns:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      {
        urls: "turns:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  };

  let isStarted = false;

  const state = {
    role: "doctor",
    roomId: "",
    doctorUrl: "",
    socket: null,
    signalServerUrl: "",
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    pendingIceCandidates: [],
    callState: CALL_STATE.WAITING,
    isPatientConnected: false,
    isJoined: false,
    hasPeer: false,
    hasCreatedOffer: false,
    hasManualSessionStart: false,
    hasShownDoctorJoinedPopup: false,
    hasClickedProceed: false,
    doctorBeginReceived: false,
    doctorClickedBegin: false,
    cameraEnabled: true,
    micEnabled: true,
    useFrontCamera: true,
    userId: "",
    isMockStream: false
  };

  function sendTelemetry(type, message, details = null) {
    try {
      const payload = {
        roomId: state.roomId || "unknown",
        role: state.role || "unknown",
        type,
        message,
        details: details ? (typeof details === "string" ? details : JSON.stringify(details)) : null
      };
      console.log(`[TELEMETRY] ${type}: ${message}`, details || "");
      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (e) {}
  }
  window.sendTelemetry = sendTelemetry;

  const dom = {
    subtitle: null,
    connectionPill: null,
    doctorPanel: null,
    patientPanel: null,
    doctorPlaceholder: null,
    patientPlaceholder: null,
    patientTile: null,
    patientTileMarkup: "",
    callStatePanel: null,
    controlsSection: null,
    testingBtn: null,
    endBtn: null,
    backBtn: null,
    doctorVideo: null,
    patientVideo: null,
    doctorJoinedModal: null,
    doctorJoinedModalAction: null,
    doctorJoinedModalMessage: null
  };

  function normalizeRoomId(value) {
    return String(value || "").trim().toUpperCase();
  }

  function setElementDisplay(element, display) {
    if (!element) return;
    element.style.display = display;
  }

  function setConnectionLabel(text) {
    if (!dom.connectionPill) return;

    const label = dom.connectionPill.querySelector("span:last-child") || dom.connectionPill;
    label.textContent = text;
  }

  function togglePatientPlaceholder(hide) {
    const placeholders = document.querySelectorAll("#patientPlaceholder");
    placeholders.forEach((el) => {
      if (hide) {
        el.classList.add("hidden");
      } else {
        el.classList.remove("hidden");
      }
    });
  }

  function readConfig() {
    const params = new URLSearchParams(window.location.search);
    const roleParam = String(params.get("role") || "").toLowerCase();
    state.role = (roleParam === "patient" || roleParam === "pat") ? "patient" : "doctor";

    const roomFromUrl = normalizeRoomId(params.get("room"));
    state.roomId = roomFromUrl || "";

    const currentView = params.get('view') || '';
    if (currentView === 'ultrasound-scanning') {
      if (state.role === 'doctor') {
        state.doctorClickedBegin = true;
      } else {
        state.doctorBeginReceived = true;
      }
    }
  }

  function cacheDom() {
    dom.subtitle = document.getElementById("consultationSubtitle");
    dom.connectionPill = document.querySelector(".connected-pill");
    dom.doctorPanel = document.getElementById("doctorVideoPanel");
    dom.patientPanel = document.getElementById("patientVideoPanel");
    dom.doctorPlaceholder = document.getElementById("doctorPlaceholder");
    dom.patientPlaceholder = document.getElementById("patientPlaceholder");
    dom.patientTile = document.getElementById("patientVideoTile");
    dom.patientTileMarkup = dom.patientTile ? dom.patientTile.innerHTML : "";
    dom.callStatePanel = document.getElementById("callStatePanel");
    dom.controlsSection = dom.callStatePanel;
    dom.testingBtn = document.getElementById("testingBtn");
    dom.endBtn = document.getElementById("endConsultationBtn");
    dom.backBtn = document.getElementById("backToDashboardBtn");
    dom.doctorPanelTitle = document.getElementById("doctorPanelTitle");
    dom.patientPanelTitle = document.getElementById("patientPanelTitle");
    dom.patientPanelLabel = dom.patientPanel ? dom.patientPanel.querySelector(".feed-label.bottom-text") : null;
    dom.flipBtn = document.getElementById("flipBtn");
    dom.remoteVideo = document.getElementById("remoteVideo");
    dom.localVideo = document.getElementById("localVideo");
    dom.panelFullscreenButtons = Array.from(document.querySelectorAll(".panel-fullscreen-btn"));
    dom.panelMenuButtons = Array.from(document.querySelectorAll(".panel-menu-btn"));
    dom.doctorJoinedModal = document.getElementById("doctorJoinedModal");
    dom.doctorJoinedModalAction = document.getElementById("doctorJoinedModalAction");
    dom.doctorJoinedModalMessage = document.getElementById("doctorJoinedModalMessage");
  }

  function buildSignalServerCandidates() {
    const params = new URLSearchParams(window.location.search);
    const signalFromQuery = params.get("signal") || params.get("signalServer") || params.get("signalServerUrl") || "";
    const stored = localStorage.getItem("signalServerUrl") || "";
    const host = window.location.hostname || "127.0.0.1";
    const pageProtocol = window.location.protocol === "https:" ? "https:" : "http:";
    const wsProtocol = pageProtocol === "https:" ? "wss:" : "ws:";

    const socketIoCandidates = [];
    const webSocketCandidates = [];

    const pushUnique = (list, value) => {
      if (!value || typeof value !== "string") {
        return;
      }
      if (!list.includes(value)) {
        list.push(value);
      }
    };

    const normalizeSocketIoUrl = (rawValue) => {
      if (!rawValue) return "";
      try {
        const parsed = new URL(rawValue, window.location.origin);
        if (parsed.protocol === "ws:") parsed.protocol = "http:";
        if (parsed.protocol === "wss:") parsed.protocol = "https:";
        return parsed.origin;
      } catch (_error) {
        return "";
      }
    };

    const deriveWebSocketUrls = (rawValue) => {
      if (!rawValue) return [];

      try {
        const parsed = new URL(rawValue, window.location.origin);
        if (parsed.protocol === "http:") parsed.protocol = "ws:";
        if (parsed.protocol === "https:") parsed.protocol = "wss:";

        const trimmedPath = parsed.pathname && parsed.pathname !== "/"
          ? parsed.pathname.replace(/\/+$/, "")
          : "";
        const baseHost = `${parsed.protocol}//${parsed.host}`;
        const results = [];

        if (trimmedPath && trimmedPath !== "/socket.io") {
          results.push(`${baseHost}${trimmedPath}`);
        } else {
          results.push(baseHost);
          results.push(`${baseHost}/ws`);
        }

        return [...new Set(results)];
      } catch (_error) {
        return [];
      }
    };

    const addFromRaw = (rawValue) => {
      const ioUrl = normalizeSocketIoUrl(rawValue);
      if (ioUrl) {
        pushUnique(socketIoCandidates, ioUrl);
      }

      const wsUrls = deriveWebSocketUrls(rawValue);
      wsUrls.forEach((wsUrl) => pushUnique(webSocketCandidates, wsUrl));
    };

    addFromRaw(signalFromQuery);
    addFromRaw(stored);
    addFromRaw(DEFAULT_SIGNAL_SERVER);

    [5002].forEach((port) => {
      pushUnique(socketIoCandidates, `${pageProtocol}//127.0.0.1:${port}`);
      pushUnique(socketIoCandidates, `${pageProtocol}//${host}:${port}`);

      pushUnique(webSocketCandidates, `${wsProtocol}//127.0.0.1:${port}`);
      pushUnique(webSocketCandidates, `${wsProtocol}//${host}:${port}`);
      pushUnique(webSocketCandidates, `${wsProtocol}//127.0.0.1:${port}/ws`);
      pushUnique(webSocketCandidates, `${wsProtocol}//${host}:${port}/ws`);
    });

    return {
      socketIoCandidates,
      webSocketCandidates
    };
  }

  // Probe a URL (HTTP/HTTPS) to check whether a signaling server is alive.
  // Converts ws/wss to http/https for probing when necessary.
  async function probeUrl(rawUrl, timeoutMs = 1600) {
    if (!rawUrl) return false;

    try {
      let probe = rawUrl;
      // normalize ws:// -> http://, wss:// -> https://
      probe = probe.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');

      // if path contains /ws or /socket.io, probe the origin root first
      try {
        const urlObj = new URL(probe, window.location.origin);
        urlObj.pathname = urlObj.pathname && urlObj.pathname !== '/' ? urlObj.pathname.replace(/\/+$/, '') : urlObj.pathname;
        // if path ends with /ws or /socket.io, probe root origin
        if (/\/ws$|\/socket.io$/i.test(urlObj.pathname || '')) {
          urlObj.pathname = '/';
        }
        probe = urlObj.toString();
      } catch (e) {
        // ignore
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(probe, { method: 'GET', signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      return resp && resp.ok;
    } catch (err) {
      return false;
    }
  }

  async function handleSignalMessage(event, socket) {
    if (state.socket !== socket) {
      return;
    }

    try {
      const data = JSON.parse(String(event.data || "{}"));
      const incomingRoomId = normalizeRoomId(data.roomId || data.room);
      if (incomingRoomId && state.roomId && incomingRoomId !== state.roomId) {
        return;
      }

      if (data.type === "share-report") {
        if (state.role === "patient") {
          console.log("Report generated event received on Patient side:", data);
          const modal = document.getElementById("patientReportGeneratedModal");
          if (modal) {
            modal.classList.remove("hidden");
            modal.setAttribute("aria-hidden", "false");
          }
        }
        return;
      }

      if (data.type === "share-captured-images") {
        if (state.role === "patient") {
          console.log("Captured images shared event received on Patient side:", data);
          state.sharedImages = data.images || [];
          const normalizedRoom = String(state.room || "default").trim().toUpperCase();
          localStorage.setItem("torus-shared-images-" + normalizedRoom, JSON.stringify(state.sharedImages));

          const btn = document.getElementById("patientCapturedImagesBtn");
          if (btn) {
            btn.style.display = "inline-flex";
            btn.classList.remove("hidden");
          }
        }
        return;
      }

      if (data.type === "joined-room") {
        const isSelf = data.success === true || !data.role;
        if (!isSelf) {
          console.log("Another peer joined via Socket.IO:", data.role);
          console.log("Peer connection is resetting to negotiate new call...");
          resetPeerConnection();
          state.hasPeer = true;
          setConnectionLabel("Connected");
          setConnectionPillState(true);
          
          if (state.role === "patient" && data.role === "doctor") {
            showDoctorJoinedPopup();
            if (dom.testingBtn && !state.hasClickedProceed) {
              dom.testingBtn.textContent = "Doctor Joined, Please click here to begin consultation";
              dom.testingBtn.disabled = false;
              dom.testingBtn.classList.remove("is-waiting");
              dom.testingBtn.classList.add("ultrasound-ready");
            }
          }
          
          if (state.role === "doctor") {
            if (dom.testingBtn && !state.doctorClickedBegin) {
              dom.testingBtn.textContent = "Patient Joined, Please click here to begin consultation";
              dom.testingBtn.disabled = false;
              dom.testingBtn.classList.remove("is-waiting");
              dom.testingBtn.classList.add("ultrasound-ready");
            }
            console.log("Doctor starting WebRTC negotiation (peer joined)...");
            await createOffer();
          } else {
            console.log("Patient sending ready signal to doctor...");
            sendSignal("ready", { roomId: state.roomId });
          }
          return;
        }

        state.isJoined = true;
        console.log("User joined:", state.role);
        const participants = Number(data.participants || 0);
        const hasPeer = participants > 1;
        state.hasPeer = hasPeer;

        if (!hasPeer) {
          clearRemoteVideo();
        }

        setConnectionLabel(hasPeer ? "Connected" : "Waiting");
        setConnectionPillState(hasPeer);
        setCallState(CALL_STATE.WAITING, state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient");

        if (state.role === "patient") {
          if (hasPeer) {
            showDoctorJoinedPopup();
            if (dom.testingBtn && !state.hasClickedProceed) {
              dom.testingBtn.textContent = "Doctor Joined, Please click here to begin consultation";
              dom.testingBtn.disabled = false;
              dom.testingBtn.classList.remove("is-waiting");
              dom.testingBtn.classList.add("ultrasound-ready");
            }
          } else {
            if (dom.testingBtn) {
              dom.testingBtn.textContent = "Waiting for Doctor";
              dom.testingBtn.disabled = true;
              dom.testingBtn.classList.add("is-waiting");
              dom.testingBtn.classList.remove("ultrasound-ready");
            }
          }
        } else {
          // Doctor self-joined
          if (hasPeer) {
            if (dom.testingBtn && !state.doctorClickedBegin) {
              dom.testingBtn.textContent = "Patient Joined, Please click here to begin consultation";
              dom.testingBtn.disabled = false;
              dom.testingBtn.classList.remove("is-waiting");
              dom.testingBtn.classList.add("ultrasound-ready");
            }
          } else {
            if (dom.testingBtn) {
              dom.testingBtn.textContent = "Waiting for Patient";
              dom.testingBtn.disabled = true;
              dom.testingBtn.classList.add("is-waiting");
              dom.testingBtn.classList.remove("ultrasound-ready");
            }
          }
        }
        return;
      }

      if (data.type === "waiting-state") {
        state.hasPeer = false;
        clearRemoteVideo();
        setCallState(CALL_STATE.WAITING, state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient");
        return;
      }

      if (data.type === "doctor-joined" || data.type === "user-joined") {
        console.log("Peer connection is resetting to negotiate new call (user-joined)...");
        resetPeerConnection();
        state.hasPeer = true;
        setConnectionLabel("Connected");
        setConnectionPillState(true);
        if (dom.callStatePanel) {
          dom.callStatePanel.style.display = "none";
        }
        if (state.role === "patient" && data.type === "doctor-joined") {
          showDoctorJoinedPopup();
        }

        console.log("Auto-negotiating ready signal due to user-joined event");
        sendSignal("ready", { roomId: state.roomId });
        return;
      }

      if (data.type === "patient-proceed") {
        if (state.role === "doctor") {
          if (dom.testingBtn && !state.doctorClickedBegin) {
            dom.testingBtn.textContent = "Patient Joined, Please click here to begin consultation";
            dom.testingBtn.disabled = false;
            dom.testingBtn.classList.remove("is-waiting");
            dom.testingBtn.classList.add("ultrasound-ready");
          }
        }
        return;
      }

      if (data.type === "doctor-begin") {
        if (state.role === "patient") {
          state.doctorBeginReceived = true;
          if (window.navigateSPA) {
            window.navigateSPA('ultrasound-scanning');
          } else {
            window.location.href = `ultrasound-scanning.html?room=${state.roomId}&role=patient`;
          }
          setCallState(CALL_STATE.CONNECTED);
          if (state.socket && state.socket.readyState === WebSocket.OPEN && state.roomId && state.isJoined) {
            sendSignal("ready", { roomId: state.roomId });
          }
        }
        return;
      }

      if (data.type === "patient-report-redirect") {
        if (state.role === "patient") {
          console.log("Redirecting patient to diagnostic dashboard");
          window.location.href = `diagnostic-dashboard.html?room=${state.roomId}&role=patient`;
        }
        return;
      }

      if (data.type === "connect-success" || data.type === "both-users-connected") {
        state.isJoined = true;
        const participants = Number(data.participants || 0);
        const hasPeer = participants > 1;
        state.hasPeer = hasPeer;
        setConnectionLabel(hasPeer ? "Connected" : "Waiting");
        setConnectionPillState(hasPeer);
        setCallState(CALL_STATE.WAITING, state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient");

        if (hasPeer) {
          console.log("Auto-negotiating ready signal due to connect-success event");
          sendSignal("ready", { roomId: state.roomId });
        }

        if (state.role === "patient") {
          if (hasPeer) {
            if (dom.testingBtn && !state.hasClickedProceed) {
              dom.testingBtn.textContent = "Doctor Joined, Please click here to begin consultation";
              dom.testingBtn.disabled = false;
              dom.testingBtn.classList.remove("is-waiting");
              dom.testingBtn.classList.add("ultrasound-ready");
            }
          } else {
            if (dom.testingBtn) {
              dom.testingBtn.textContent = "Waiting for Doctor";
              dom.testingBtn.disabled = true;
            }
          }
        }
        return;
      }

      if (data.type === "user-left") {
        resetPeerConnection();
        state.hasPeer = false;
        state.isPatientConnected = false;
        setConnectionLabel("Waiting");
        setConnectionPillState(false);
        clearRemoteVideo();
        setCallState(CALL_STATE.WAITING, "Waiting for patient...");
        return;
      }

      if (data.type === "ready") {
        if (state.role === "doctor") {
          console.log("Doctor received ready message, resetting and negotiating...");
          resetPeerConnection();
          await createOffer();
        }
        return;
      }

      if (data.type === "offer" && data.offer) {
        await handleOffer({ offer: data.offer });
        return;
      }

      if (data.type === "answer" && data.answer) {
        await handleAnswer({ answer: data.answer });
        return;
      }

      if (data.type === "candidate" && data.candidate) {
        await handleIceCandidate({ candidate: data.candidate });
        return;
      }

      if (data.type === "ice-candidate" && data.candidate) {
        await handleIceCandidate({ candidate: data.candidate });
        return;
      }

      if (data.type === "error-message") {
        const errorMessage = data.message || "Signaling error";
        console.warn(errorMessage);
        setCallState(CALL_STATE.WAITING, errorMessage);
      }
    } catch (error) {
      console.error("Signal parse error", error);
    }
  }

  function connectToSignalServer(signalServerUrl) {
    return new Promise((resolve, reject) => {
      console.log(`[socket.io] Initializing with URL: ${signalServerUrl}`);

      if (!window.io) {
        const error = new Error("window.io not found - socket.io library not loaded");
        console.error(error.message);
        return reject(error);
      }

      const ioSocket = window.io(signalServerUrl, {
        path: "/socket.io",
        transports: ["websocket", "polling"]
      });

      console.log(`[socket.io] Socket instance created, waiting for connection...`);

      const socket = createSignalSocketAdapter(ioSocket, signalServerUrl);
      state.signalServerUrl = signalServerUrl;
      state.socket = socket;

      let settled = false;
      const timeoutHandle = setTimeout(() => {
        if (!settled) {
          console.warn(`[socket.io] Connection timeout after 10s: ${signalServerUrl}`);
          finishReject(new Error("socket.io connection timeout"));
        }
      }, 10000);

      const finishResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        localStorage.setItem("signalServerUrl", signalServerUrl);
        console.log(`[socket.io] ✓ Connected and resolved: ${signalServerUrl}`);
        resolve(socket);
      };

      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (state.socket === socket) {
          state.socket = null;
        }
        if (socket && socket.close) socket.close();
        console.error(`[socket.io] ✗ Connection rejected:`, error?.message);
        reject(error);
      };

      const sendJoinMessage = () => {
        if (!state.roomId || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(JSON.stringify({
          type: "join",
          room: state.roomId,
          role: state.role
        }));

        console.log("join sent:", state.roomId, state.role);
      };

      const sendReadyIfPossible = () => {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN || !state.roomId || !state.isJoined) {
          return;
        }
        sendSignal("ready", { roomId: state.roomId });
      };

      socket.onopen = () => {
        if (state.socket !== socket) {
          console.warn("[socket.io] onopen: socket was replaced, ignoring");
          return;
        }

        console.log("[socket.io] ✓ onopen event fired");
        console.log("[socket.io] Connected ID:", ioSocket.id || "unknown");
        sendJoinMessage();
        finishResolve();
      };

      socket.onerror = (err) => {
        if (state.socket !== socket) {
          console.warn("[socket.io] onerror: socket was replaced, ignoring");
          return;
        }

        console.error("[socket.io] ✗ onerror event:", err);
        finishReject(err instanceof Error ? err : new Error("websocket error / server is down"));
      };

      socket.onclose = () => {
        if (state.socket !== socket) {
          console.warn("[socket.io] onclose: socket was replaced, ignoring");
          return;
        }

        console.warn("[socket.io] onclose event fired");
        state.isJoined = false;
        state.hasCreatedOffer = false;

        if (!settled) {
          finishReject(new Error("websocket error / server is down"));
          return;
        }

        setCallState(CALL_STATE.WAITING, "Unable to connect signaling server");
      };

      socket.onmessage = (event) => {
        void handleSignalMessage(event, socket);
      };

      // Hook into socket.io events for debugging
      ioSocket.on("connect", () => {
        console.log("[socket.io] 'connect' event fired, ID:", ioSocket.id);
      });

      ioSocket.on("connect_error", (error) => {
        console.error("[socket.io] 'connect_error' event:", error?.message || error);
      });

      ioSocket.on("disconnect", (reason) => {
        console.warn("[socket.io] 'disconnect' event:", reason);
      });
    });
  }

  function connectToNativeWebSocket(signalServerUrl) {
    return new Promise((resolve, reject) => {
      console.log(`[native-ws] Initializing connection to: ${signalServerUrl}`);

      const socket = new WebSocket(signalServerUrl);
      state.signalServerUrl = signalServerUrl;
      state.socket = socket;

      let settled = false;
      const timeoutHandle = setTimeout(() => {
        if (!settled) {
          console.warn(`[native-ws] Connection timeout after 10s: ${signalServerUrl}`);
          finishReject(new Error("native WebSocket connection timeout"));
        }
      }, 10000);

      const finishResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        localStorage.setItem("signalServerUrl", signalServerUrl);
        console.log(`[native-ws] ✓ Connected and resolved: ${signalServerUrl}`);
        resolve(socket);
      };

      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (state.socket === socket) {
          state.socket = null;
        }
        if (socket && socket.close) socket.close();
        console.error(`[native-ws] ✗ Connection rejected:`, error?.message);
        reject(error);
      };

      socket.onopen = () => {
        if (state.socket !== socket) {
          console.warn("[native-ws] onopen: socket was replaced, ignoring");
          return;
        }

        console.log("[native-ws] ✓ onopen event fired");

        if (state.roomId && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "join",
            room: state.roomId,
            role: state.role
          }));
          console.log("[native-ws] join sent:", state.roomId, state.role);
        }

        finishResolve();
      };

      socket.onerror = (err) => {
        if (state.socket !== socket) {
          console.warn("[native-ws] onerror: socket was replaced, ignoring");
          return;
        }

        console.error("[native-ws] ✗ onerror event:", err);
        finishReject(err instanceof Error ? err : new Error("websocket error / server is down"));
      };

      socket.onclose = () => {
        if (state.socket !== socket) {
          console.warn("[native-ws] onclose: socket was replaced, ignoring");
          return;
        }

        console.warn("[native-ws] onclose event fired");
        state.isJoined = false;
        state.hasCreatedOffer = false;

        if (!settled) {
          finishReject(new Error("websocket error / server is down"));
          return;
        }

        setCallState(CALL_STATE.WAITING, "Unable to connect signaling server");
      };

      socket.onmessage = (event) => {
        void handleSignalMessage(event, socket);
      };

      console.log("[native-ws] WebSocket instance created, waiting for open event...");
    });
  }

  async function connectSignaling() {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      console.log("✓ Socket already connected, skipping reconnect");
      return;
    }

    const { socketIoCandidates, webSocketCandidates } = buildSignalServerCandidates();
    console.log("📡 Signal Server Candidates:");
    console.log("  Socket.IO URLs:", socketIoCandidates);
    console.log("  WebSocket URLs:", webSocketCandidates);

    // Probe candidates first and prefer any server that responds to an HTTP health check.
    try {
      for (let i = 0; i < socketIoCandidates.length; i++) {
        const candidate = socketIoCandidates[i];
        // probe origin (http/https)
        // eslint-disable-next-line no-await-in-loop
        const ok = await probeUrl(candidate);
        if (ok) {
          console.log('[probe] Socket.IO candidate responsive, prioritizing:', candidate);
          socketIoCandidates.splice(i, 1);
          socketIoCandidates.unshift(candidate);
          break;
        }
      }

      for (let i = 0; i < webSocketCandidates.length; i++) {
        const candidate = webSocketCandidates[i];
        // eslint-disable-next-line no-await-in-loop
        const ok = await probeUrl(candidate);
        if (ok) {
          console.log('[probe] WebSocket candidate responsive, prioritizing:', candidate);
          webSocketCandidates.splice(i, 1);
          webSocketCandidates.unshift(candidate);
          break;
        }
      }
    } catch (probeErr) {
      console.warn('[probe] Error while probing signal servers:', probeErr && probeErr.message);
    }

    let lastError = null;

    console.log("🔗 Attempting Socket.IO connections...");
    for (const signalServerUrl of socketIoCandidates) {
      try {
        console.log(`  → Trying: ${signalServerUrl}`);
        const socket = await connectToSignalServer(signalServerUrl);
        console.log(`  ✓ Connected via Socket.IO: ${signalServerUrl}`);
        state.socket = socket;
        window.torusSocket = socket.rawSocket || socket;
        return;
      } catch (error) {
        console.warn(`  ✗ Socket.IO failed (${signalServerUrl}):`, error?.message);
        lastError = error;
      }
    }

    console.log("🔗 Attempting native WebSocket connections...");
    for (const signalServerUrl of webSocketCandidates) {
      try {
        console.log(`  → Trying: ${signalServerUrl}`);
        const socket = await connectToNativeWebSocket(signalServerUrl);
        console.log(`  ✓ Connected via WebSocket: ${signalServerUrl}`);
        state.socket = socket;
        window.torusSocket = socket.rawSocket || socket;
        return;
      } catch (error) {
        console.warn(`  ✗ WebSocket failed (${signalServerUrl}):`, error?.message);
        lastError = error;
      }
    }

    const finalError = lastError || new Error("websocket error / server is down");
    console.error("❌ All connection attempts failed:", finalError.message);
    throw finalError;
  }

  function setConnectionPillState(isConnected) {
    if (!dom.connectionPill) return;

    dom.connectionPill.classList.toggle("is-connected", isConnected);
    dom.connectionPill.classList.toggle("is-waiting", !isConnected);
  }

  function setSubtitle(text) {
    if (dom.subtitle) {
      dom.subtitle.textContent = text;
    }
  }

  function generateRoomId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  function buildPatientLink(roomId) {
    const current = new URL(window.location.href);
    return `${current.origin}${current.pathname}?room=${encodeURIComponent(roomId)}&role=patient`;
  }

  function buildDoctorLink(roomId) {
    return `connected-device.html?room=${encodeURIComponent(roomId)}&role=doctor`;
  }

  function buildAbsoluteDoctorUrl(roomId) {
    const current = new URL(window.location.href);
    current.searchParams.set("room", normalizeRoomId(roomId));
    current.searchParams.set("role", "doctor");
    return current.toString();
  }

  function buildReportLink() {
    const current = new URL(window.location.href);
    current.pathname = current.pathname.replace(/connected-device\.html$/i, "report-generation.html");
    return current.toString();
  }

  function buildNavigationUrl(pageName) {
    const current = new URL(window.location.href);
    current.pathname = current.pathname.replace(/[^/]+$/i, pageName);
    return current.toString();
  }

  function createVideoElement(muted, elementId = "") {
    const video = document.createElement("video");
    video.className = "video-stream";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted;
    if (elementId) {
      video.id = elementId;
    }
    return video;
  }

  let isFlipped = false;

  function getRoleSpecificTitles() {
    return state.role === "doctor"
      ? {
        rightTitle: "Patient Camera",
        selfLabel: "Doctor",
        peerLabel: "Patient"
      }
      : {
        rightTitle: "Doctor Camera",
        selfLabel: "Patient",
        peerLabel: "Doctor"
      };
  }

  function updatePanelTitles() {
    const titles = getRoleSpecificTitles();

    if (dom.doctorPanelTitle) {
      dom.doctorPanelTitle.textContent = "Ultrasound Video Feed";
    }

    if (dom.patientPanelTitle) {
      dom.patientPanelTitle.textContent = titles.rightTitle;
    }

    if (dom.patientPanelLabel) {
      dom.patientPanelLabel.textContent = titles.rightTitle;
    }
  }

  function attachLocalVideo() {
    renderRoleVideoLayout();
  }

  function hasRemoteStream() {
    return Boolean(state.remoteStream && state.remoteStream.getTracks().length > 0);
  }

  function getMainStreamForRole() {
    // Keep the main panel reserved for the peer video.
    // The doctor's own camera should live in the preview tile.
    return state.remoteStream;
  }

  function getOverlayStreamForRole() {
    // Always show the local stream in the preview tile once the doctor camera is started.
    return state.localStream;
  }

  async function tryPlayVideo(videoElement) {
    if (!videoElement) {
      return;
    }

    const id = videoElement.id || "unnamed";
    try {
      await videoElement.play();
      sendTelemetry("video", `tryPlayVideo success: ${id}`, { muted: videoElement.muted });
    } catch (error) {
      console.warn("Video autoplay blocked, trying muted play:", error?.message || error);
      sendTelemetry("video", `tryPlayVideo blocked (unmuted), trying muted: ${id}`, { error: error.message });
      videoElement.muted = true;
      try {
        await videoElement.play();
        sendTelemetry("video", `tryPlayVideo success (muted fallback): ${id}`);
      } catch (muteError) {
        console.error("Muted play also failed:", muteError?.message || muteError);
        sendTelemetry("error", `tryPlayVideo failed completely: ${id}`, { error: muteError.message });
      }
    }
  }

  function renderRoleVideoLayout() {
    updatePanelTitles();
    const mainStream = getMainStreamForRole();
    const overlayStream = getOverlayStreamForRole();
    const mainVideo = dom.remoteVideo;
    const overlayVideo = dom.localVideo;
    const patientTile = dom.patientTile;

    if (mainVideo) {
      if (mainStream) {
        if (mainVideo.srcObject !== mainStream) {
          mainVideo.srcObject = mainStream;
          mainVideo.muted = false;
          void tryPlayVideo(mainVideo);
        }
        togglePatientPlaceholder(true);
      } else {
        mainVideo.srcObject = null;
        togglePatientPlaceholder(false);
      }
    }

    if (overlayVideo) {
      if (overlayStream) {
        if (overlayVideo.srcObject !== overlayStream) {
          overlayVideo.srcObject = overlayStream;
          overlayVideo.muted = true;
          void tryPlayVideo(overlayVideo);
        }
        overlayVideo.style.transform = isFlipped ? "scaleX(-1)" : "scaleX(1)";
        overlayVideo.style.display = "block";
        if (patientTile) {
          patientTile.style.display = "none";
        }
      } else {
        overlayVideo.srcObject = null;
        overlayVideo.style.display = "none";
        if (patientTile) {
          patientTile.style.display = "flex";
        }
      }
    }

    // Sync other consultation and patient/doctor video elements
    const patientVideo = document.getElementById("patientVideo");
    if (patientVideo) {
      if (state.role === "doctor") {
        if (mainStream) {
          if (patientVideo.srcObject !== mainStream) {
            patientVideo.srcObject = mainStream;
            patientVideo.muted = false;
            void tryPlayVideo(patientVideo);
          }
          togglePatientPlaceholder(true);
        } else {
          patientVideo.srcObject = null;
          togglePatientPlaceholder(false);
        }
      } else {
        // patient local preview
        if (overlayStream) {
          if (patientVideo.srcObject !== overlayStream) {
            patientVideo.srcObject = overlayStream;
            patientVideo.muted = true;
            void tryPlayVideo(patientVideo);
          }
          togglePatientPlaceholder(true);
        } else {
          patientVideo.srcObject = null;
          togglePatientPlaceholder(false);
        }
      }
    }

    const consultationPatientVideo = document.getElementById("consultationPatientVideo");
    if (consultationPatientVideo) {
      if (state.role === "doctor") {
        if (mainStream) {
          if (consultationPatientVideo.srcObject !== mainStream) {
            consultationPatientVideo.srcObject = mainStream;
            consultationPatientVideo.muted = false;
            void tryPlayVideo(consultationPatientVideo);
          }
          const placeholder = document.getElementById("consultationPlaceholder");
          if (placeholder) placeholder.classList.add("hidden");
        } else {
          consultationPatientVideo.srcObject = null;
          const placeholder = document.getElementById("consultationPlaceholder");
          if (placeholder) placeholder.classList.remove("hidden");
        }
      } else {
        // patient local preview
        if (overlayStream) {
          if (consultationPatientVideo.srcObject !== overlayStream) {
            consultationPatientVideo.srcObject = overlayStream;
            consultationPatientVideo.muted = true;
            void tryPlayVideo(consultationPatientVideo);
          }
          const placeholder = document.getElementById("consultationPlaceholder");
          if (placeholder) placeholder.classList.add("hidden");
        } else {
          consultationPatientVideo.srcObject = null;
          const placeholder = document.getElementById("consultationPlaceholder");
          if (placeholder) placeholder.classList.remove("hidden");
        }
      }
    }

    const doctorTileVideo = document.getElementById("doctorTileVideo");
    if (doctorTileVideo) {
      if (state.role === "patient") {
        if (mainStream) {
          if (doctorTileVideo.srcObject !== mainStream) {
            doctorTileVideo.srcObject = mainStream;
            doctorTileVideo.muted = false;
            void tryPlayVideo(doctorTileVideo);
          }
        } else {
          doctorTileVideo.srcObject = null;
        }
      } else {
        // doctor local preview
        if (overlayStream) {
          if (doctorTileVideo.srcObject !== overlayStream) {
            doctorTileVideo.srcObject = overlayStream;
            doctorTileVideo.muted = true;
            void tryPlayVideo(doctorTileVideo);
          }
        } else {
          doctorTileVideo.srcObject = null;
        }
      }
    }
  }

  function clearRemoteVideo() {
    state.remoteStream = null;
    renderRoleVideoLayout();
  }

  function setTestingButtonState(isPatientConnected) {
    if (!dom.testingBtn) return;

    const hasPeer = dom.connectionPill && dom.connectionPill.classList.contains("is-connected");

    if (state.role === "patient") {
      if (state.doctorBeginReceived) {
        dom.testingBtn.textContent = "Ultra Sound in Progress";
        dom.testingBtn.disabled = false;
        dom.testingBtn.classList.add("ultrasound-ready");
        dom.testingBtn.classList.remove("is-waiting");
      } else if (state.hasClickedProceed) {
        dom.testingBtn.textContent = "Waiting for Doctor to start...";
        dom.testingBtn.disabled = true;
        dom.testingBtn.classList.add("is-waiting");
        dom.testingBtn.classList.remove("ultrasound-ready");
      } else if (state.hasPeer || hasPeer) {
        dom.testingBtn.textContent = "Doctor Joined, Please click here to begin consultation";
        dom.testingBtn.disabled = false;
        dom.testingBtn.classList.add("ultrasound-ready");
        dom.testingBtn.classList.remove("is-waiting");
      } else {
        dom.testingBtn.textContent = "Waiting for Doctor";
        dom.testingBtn.disabled = true;
        dom.testingBtn.classList.add("is-waiting");
        dom.testingBtn.classList.remove("ultrasound-ready");
      }
    } else {
      // Doctor role
      if (isPatientConnected || hasPeer) {
        if (state.hasClickedProceed || state.doctorClickedBegin) {
          if (state.doctorClickedBegin) {
            dom.testingBtn.textContent = "Ultrasound Scanning";
            dom.testingBtn.disabled = false;
            dom.testingBtn.classList.remove("is-waiting");
            dom.testingBtn.classList.add("ultrasound-ready");
          } else {
            dom.testingBtn.textContent = "Patient Joined, Please click here to begin consultation";
            dom.testingBtn.disabled = false;
            dom.testingBtn.classList.remove("is-waiting");
            dom.testingBtn.classList.add("ultrasound-ready");
          }
        } else {
          dom.testingBtn.textContent = "Waiting for Patient";
          dom.testingBtn.disabled = true;
          dom.testingBtn.classList.add("is-waiting");
          dom.testingBtn.classList.remove("ultrasound-ready");
        }
      } else {
        dom.testingBtn.textContent = "Waiting for Patient";
        dom.testingBtn.disabled = true;
        dom.testingBtn.classList.add("is-waiting");
        dom.testingBtn.classList.remove("ultrasound-ready");
      }
    }

    if (isPatientConnected) {
      dom.testingBtn.classList.add("active-ultrasound", "is-connected");
    } else {
      dom.testingBtn.classList.remove("active-ultrasound", "is-connected");
    }
  }

  function resetTestingButtonState() {
    if (!dom.testingBtn) return;

    dom.testingBtn.disabled = true;
    dom.testingBtn.textContent = state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient";
    dom.testingBtn.classList.remove("active-ultrasound", "is-connected", "ultrasound-ready");
    dom.testingBtn.classList.add("is-waiting");
  }

  function resetVideoPlaceholders() {
    if (dom.doctorPlaceholder) {
      dom.doctorPlaceholder.classList.remove("hidden");
    }

    togglePatientPlaceholder(false);

    const remoteVideo = document.getElementById("remoteVideo");
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }

    const localVideo = document.getElementById("localVideo");
    if (localVideo) {
      localVideo.srcObject = null;
      localVideo.style.transform = isFlipped ? "scaleX(-1)" : "scaleX(1)";
    }
  }

  function setElementHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle("hidden", hidden);
  }

  function hideDoctorJoinedPopup() {
    setElementHidden(dom.doctorJoinedModal, true);
  }

  function showDoctorJoinedPopup() {
    if (state.role !== "patient" || state.hasShownDoctorJoinedPopup) {
      return;
    }

    state.hasShownDoctorJoinedPopup = true;

    // Show browser notification popup as alert
    window.alert("Doctor Joined");

    if (dom.testingBtn) {
      dom.testingBtn.textContent = "Doctor Joined, Please click here to begin consultation";
      dom.testingBtn.disabled = false;
      dom.testingBtn.classList.remove("is-waiting");
      dom.testingBtn.classList.add("ultrasound-ready");
    }
  }

  function setInitialConsultationVisibility(hidden) {
    // Only hide connected pill, not patient details
    setElementHidden(document.querySelector(".connected-pill"), hidden);
  }

  function showInitialState() {
    const currentView = new URLSearchParams(window.location.search).get('view') || 'connected-device';
    if (currentView !== 'connected-device') return;

    state.callState = CALL_STATE.WAITING;
    state.isPatientConnected = false;
    state.hasManualSessionStart = false;
    hideDoctorJoinedPopup();
    updatePanelTitles();

    // Initial state requirements: show doctor panel, testing/end buttons and waiting.
    setElementDisplay(dom.doctorPanel, "flex");
    setElementDisplay(dom.patientPanel, "flex");
    setElementDisplay(dom.testingBtn, "block");
    setElementDisplay(dom.endBtn, "block");
    setElementDisplay(dom.patientTile, "flex");

    setConnectionLabel("Waiting");
    setConnectionPillState(false);
    resetTestingButtonState();
    resetVideoPlaceholders();
    if (state.localStream) {
      if (dom.localVideo) {
        dom.localVideo.style.display = "block";
        if (dom.localVideo.srcObject !== state.localStream) {
          dom.localVideo.srcObject = state.localStream;
          dom.localVideo.muted = true;
          void tryPlayVideo(dom.localVideo);
        }
      }
      if (dom.patientTile) {
        dom.patientTile.style.display = "none";
      }
    } else {
      if (dom.localVideo) {
        dom.localVideo.style.display = "none";
      }
      if (dom.patientTile) {
        dom.patientTile.style.display = "flex";
      }
    }
    setInitialConsultationVisibility(false);

    setSessionDetailsVisibility(false);
    renderWaitingState(state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient");
  }

  function showFullUI() {
    setInitialConsultationVisibility(false);

    if (dom.callStatePanel) {
      dom.callStatePanel.style.display = "flex";
    }

    const leftPanel = document.getElementById("doctorVideoPanel");
    const rightPanel = document.getElementById("patientVideoPanel");
    if (leftPanel) leftPanel.classList.add("active");
    if (rightPanel) rightPanel.classList.add("active");
  }

  function showWaitingState(waitingMessage = "Waiting...") {
    setConnectionLabel("Waiting");
    setConnectionPillState(false);

    const currentView = new URLSearchParams(window.location.search).get('view') || 'connected-device';
    if (currentView !== 'connected-device') return;

    if (dom.testingBtn) {
      dom.testingBtn.disabled = true;
      dom.testingBtn.classList.remove("is-connected", "active-ultrasound", "ultrasound-ready");
      dom.testingBtn.classList.add("is-waiting");
      if (state.role === "patient") {
        dom.testingBtn.textContent = "Waiting for Doctor";
      } else {
        dom.testingBtn.textContent = state.doctorClickedBegin ? "Connecting..." : "Waiting for Patient";
      }
    }

    renderWaitingState(
      waitingMessage && waitingMessage !== "Waiting..."
        ? waitingMessage
        : (state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient")
    );

    const hasPeer = dom.connectionPill && dom.connectionPill.classList.contains("is-connected");
    if (state.role === "patient" && hasPeer) {
      setElementDisplay(dom.controlsSection, "none");
    } else {
      setElementDisplay(dom.controlsSection, "flex");
    }
  }

  function showConnectedState() {
    state.callState = CALL_STATE.CONNECTED;
    state.isPatientConnected = true;

    setConnectionLabel("Connected");
    setConnectionPillState(true);
    setTestingButtonState(true);

    const currentView = new URLSearchParams(window.location.search).get('view') || 'connected-device';
    if (currentView !== 'connected-device') return;

    // Connected state requirements: reveal details, controls and patient tile.
    setElementDisplay(dom.doctorPanel, "flex");
    setElementDisplay(dom.patientPanel, "flex");
    setElementDisplay(dom.patientTile, "flex");
    setElementDisplay(dom.controlsSection, "flex");
    setElementDisplay(dom.testingBtn, "block");
    setElementDisplay(dom.endBtn, "block");

    showFullUI();
    setSessionDetailsVisibility(true);

    if (dom.callStatePanel) {
      dom.callStatePanel.innerHTML = "";
    }

    togglePatientPlaceholder(true);

    renderRoleVideoLayout();
    renderControlsState();
    showLiveCallUI();
  }

  function showInitialUI() {
    showInitialState();
  }

  function setInitialState() {
    showInitialState();
  }

  function showWaiting() {
    showWaitingState();
  }

  function showConnectedUI() {
    showConnectedState();
  }

  function setSessionDetailsVisibility(isPatientConnected) {
    const patientDetailsSection = document.getElementById("patientDetailsSection");
    if (!patientDetailsSection) {
      return;
    }

    patientDetailsSection.style.display = isPatientConnected ? "block" : "none";
  }

  function hasActivePatientConnection() {
    return hasRemoteStream();
  }

  function syncConsultationUi(waitingMessage = "Waiting...") {
    const currentView = new URLSearchParams(window.location.search).get('view') || 'connected-device';
    if (currentView !== 'connected-device') return;

    const isConnected = state.callState === CALL_STATE.CONNECTED || (state.role === "patient" && state.doctorBeginReceived);
    state.isPatientConnected = isConnected;

    if (isConnected) {
      showConnectedState();
      return;
    }

    setConnectionLabel("Waiting");
    setConnectionPillState(false);
    setTestingButtonState(false);
    setSessionDetailsVisibility(false);
    renderWaitingState(
      waitingMessage && waitingMessage !== "Waiting..."
        ? waitingMessage
        : (state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient")
    );
  }

  function setCallState(nextState, waitingMessage = "Waiting...") {
    const currentView = new URLSearchParams(window.location.search).get('view') || 'connected-device';
    if (currentView !== 'connected-device') return;

    state.callState = nextState === CALL_STATE.CONNECTED ? CALL_STATE.CONNECTED : CALL_STATE.WAITING;
    syncConsultationUi(waitingMessage);
  }

  function setPatientConnectionState(isPatientConnected, waitingMessage = "Waiting...") {
    setCallState(isPatientConnected ? CALL_STATE.CONNECTED : CALL_STATE.WAITING, waitingMessage);
  }

  function showLiveCallUI() {
    const leftPanel = document.getElementById("doctorVideoPanel");
    const rightPanel = document.getElementById("patientVideoPanel");
    if (leftPanel) leftPanel.classList.add("active");
    if (rightPanel) rightPanel.classList.add("active");
  }

  function renderWaitingState(message) {
    if (!dom.callStatePanel) return;
    renderControlsState();
  }

  function renderControlsState() {
    if (!dom.callStatePanel) return;

    dom.callStatePanel.style.display = "flex";
    dom.callStatePanel.style.alignItems = "center";
    dom.callStatePanel.style.justifyContent = "center";

    dom.callStatePanel.innerHTML = `
      <div class="call-controls">
        <button class="control-btn active" id="camToggleBtn" type="button" aria-label="Toggle camera">
          <i data-lucide="video"></i>
        </button>
        <button class="control-btn active" id="micToggleBtn" type="button" aria-label="Toggle microphone">
          <i data-lucide="mic"></i>
        </button>
        <button class="control-btn" id="settingsBtn" type="button" aria-label="Call settings">
          <i data-lucide="settings"></i>
        </button>
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }

    bindControlButtons();
  }

  window.torusToggleCamera = function(enabled) {
    if (enabled === undefined) {
      state.cameraEnabled = !state.cameraEnabled;
    } else {
      state.cameraEnabled = !!enabled;
    }
    
    const activeStream = window.torusLocalStream || state.localStream;
    if (activeStream) {
      activeStream.getVideoTracks().forEach((track) => {
        track.enabled = state.cameraEnabled;
      });
    }
    
    // Update landing view button
    const camToggleBtn = document.getElementById("camToggleBtn");
    if (camToggleBtn) {
      camToggleBtn.classList.toggle("active", state.cameraEnabled);
      camToggleBtn.classList.toggle("off", !state.cameraEnabled);
    }
    
    // Update scanning view button
    const consultationVideoBtn = document.getElementById("consultationVideoBtn");
    if (consultationVideoBtn) {
      consultationVideoBtn.classList.toggle("is-off", !state.cameraEnabled);
    }
    
    console.log(`📹 Camera toggled: ${state.cameraEnabled ? "ON" : "OFF"}`);
  };

  window.torusToggleMic = function(enabled) {
    if (enabled === undefined) {
      state.micEnabled = !state.micEnabled;
    } else {
      state.micEnabled = !!enabled;
    }
    
    const activeStream = window.torusLocalStream || state.localStream;
    if (activeStream) {
      activeStream.getAudioTracks().forEach((track) => {
        track.enabled = state.micEnabled;
      });
    }
    
    // Update landing view button
    const micToggleBtn = document.getElementById("micToggleBtn");
    if (micToggleBtn) {
      micToggleBtn.classList.toggle("active", state.micEnabled);
      micToggleBtn.classList.toggle("off", !state.micEnabled);
    }
    
    // Update scanning view button
    const consultationMicBtn = document.getElementById("consultationMicBtn");
    if (consultationMicBtn) {
      consultationMicBtn.classList.toggle("is-off", !state.micEnabled);
    }
    
    console.log(`🎤 Microphone toggled: ${state.micEnabled ? "ON" : "OFF"}`);
  };

  function bindControlButtons() {
    const camToggleBtn = document.getElementById("camToggleBtn");
    const micToggleBtn = document.getElementById("micToggleBtn");
    const settingsBtn = document.getElementById("settingsBtn");

    if (camToggleBtn) {
      camToggleBtn.onclick = () => {
        window.torusToggleCamera();
      };
    }

    if (micToggleBtn) {
      micToggleBtn.onclick = () => {
        window.torusToggleMic();
      };
    }

    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        const settingsModal = document.getElementById("settingsModal");
        if (settingsModal) {
          settingsModal.classList.remove("hidden");
        }
      });
    }
  }

  async function getCameraConstraints() {
    let videoInputs = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices
      ? (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput")
      : [];

    // Filter out depth and infrared sensor inputs (only select RGB/Color inputs)
    videoInputs = videoInputs.filter(device => {
      const label = (device.label || "").toLowerCase();
      return !label.includes("depth") && !label.includes("ir") && !label.includes("infrared");
    });

    let videoConstraint = {};

    if (videoInputs.length > 1) {
      // Toggle device index based on useFrontCamera
      const selectedDevice = videoInputs[state.useFrontCamera ? 0 : 1] || videoInputs[0];
      if (selectedDevice && selectedDevice.deviceId) {
        console.log(`🎥 Device-Aware Selection: Using camera [${selectedDevice.label || selectedDevice.deviceId}]`);
        videoConstraint = { deviceId: { exact: selectedDevice.deviceId } };
      }
    }

    if (!videoConstraint.deviceId) {
      // fallback to facingMode if single camera or unable to enumerate
      videoConstraint = { facingMode: state.useFrontCamera ? "user" : "environment" };
    }

    // Add ideal resolution parameters
    videoConstraint.width = { ideal: 1280 };
    videoConstraint.height = { ideal: 720 };

    return {
      video: videoConstraint,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
  }

  async function ensureLocalStream() {
    if (state.localStream) return;

    const isTestMode = /test=1|skipCamera=true/i.test(window.location.search);
    if (isTestMode) {
      console.log("🧪 TEST MODE: Skipping camera - will connect signaling only");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.alert("Use HTTPS. Camera not supported.");
      throw new Error("getUserMedia unsupported. Use HTTPS or localhost.");
    }

    // Helper function to try loading a stream with given constraints
    const tryGetUserMedia = async (constraints) => {
      console.log("📷 [TRACE] navigator.mediaDevices.getUserMedia called with:", JSON.stringify(constraints));
      return await navigator.mediaDevices.getUserMedia(constraints);
    };

    let stream = null;
    let baseConstraints = await getCameraConstraints();

    // Stage 1: Try device-specific constraints + audio
    try {
      stream = await tryGetUserMedia(baseConstraints);
    } catch (err1) {
      console.warn("Stage 1 camera request failed (device + audio):", err1);
      
      // Stage 2: Try device-specific constraints, Video-Only
      try {
        stream = await tryGetUserMedia({ video: baseConstraints.video });
      } catch (err2) {
        console.warn("Stage 2 camera request failed (device video-only):", err2);

        // Stage 3: Try device-specific without exact modifier + audio
        if (baseConstraints.video && baseConstraints.video.deviceId && baseConstraints.video.deviceId.exact) {
          const softVideoConstraint = { ...baseConstraints.video, deviceId: baseConstraints.video.deviceId.exact };
          try {
            stream = await tryGetUserMedia({ video: softVideoConstraint, audio: baseConstraints.audio });
          } catch (err3) {
            console.warn("Stage 3 camera request failed (soft device + audio):", err3);

            // Stage 4: Try device-specific without exact modifier, Video-Only
            try {
              stream = await tryGetUserMedia({ video: softVideoConstraint });
            } catch (err4) {
              console.warn("Stage 4 camera request failed (soft device video-only):", err4);
            }
          }
        }
      }
    }

    // Fallbacks if device-specific failed completely
    if (!stream) {
      // Stage 5: Try generic facingMode + audio
      try {
        stream = await tryGetUserMedia({
          video: { facingMode: state.useFrontCamera ? "user" : "environment" },
          audio: true
        });
      } catch (err5) {
        console.warn("Stage 5 camera request failed (facingMode + audio):", err5);

        // Stage 6: Try generic facingMode, Video-Only
        try {
          stream = await tryGetUserMedia({
            video: { facingMode: state.useFrontCamera ? "user" : "environment" }
          });
        } catch (err6) {
          console.warn("Stage 6 camera request failed (facingMode video-only):", err6);

          // Stage 7: Try basic video-only
          try {
            stream = await tryGetUserMedia({ video: true });
          } catch (err7) {
            console.warn("Stage 7 camera request failed (basic video-only):", err7);

            // Stage 8: Try basic audio-only
            try {
              stream = await tryGetUserMedia({ audio: true });
            } catch (err8) {
              console.error("All media streams failed to load:", err8);
              sendTelemetry("error", "All media streams failed to load", { error: err8.message });
              throw err8;
            }
          }
        }
      }
    }

    state.localStream = stream;
    window.torusLocalStream = stream;
    
    try {
      const tracks = stream.getTracks().map(t => ({ kind: t.kind, label: t.label, enabled: t.enabled }));
      sendTelemetry("camera", "Local stream acquired", { tracks });
    } catch(e){}
    
    attachLocalVideo();

    // Dynamically sync the tracks to an existing peer connection and trigger renegotiation
    if (state.peerConnection) {
      await syncTracksToPeerConnection();
      if (state.socket && state.socket.readyState === WebSocket.OPEN && state.roomId) {
        console.log("Notifying peer that camera stream is active and ready");
        sendSignal("ready", { roomId: state.roomId });
      }
    }
  }

  async function switchCamera() {
    state.useFrontCamera = !state.useFrontCamera;
    console.log("Switching camera, useFrontCamera:", state.useFrontCamera);

    // Stop current video tracks to release camera hardware
    if (state.localStream) {
      const videoTracks = state.localStream.getVideoTracks();
      videoTracks.forEach(track => {
        try {
          track.stop();
          if (state.localStream) {
            state.localStream.removeTrack(track);
          }
        } catch (e) {
          console.warn("Error stopping video track:", e);
        }
      });
    }

    // Force reloading the stream with new constraints
    const oldStream = state.localStream;
    state.localStream = null;
    
    try {
      await ensureLocalStream();
      
      // If ensureLocalStream succeeded and peer connection is active, sync
      if (state.localStream && state.peerConnection) {
        await syncTracksToPeerConnection();
      }
    } catch (error) {
      console.error("Failed to switch camera:", error);
      // Restore old stream if fallback failed completely
      if (oldStream) {
        state.localStream = oldStream;
        window.torusLocalStream = oldStream;
        attachLocalVideo();
        if (state.peerConnection) {
          await syncTracksToPeerConnection();
        }
      }
    }
  }

  async function startMedia() {
    await ensureLocalStream(false);
  }

  async function startInitialCameraPreview() {
    try {
      await ensureLocalStream();
    } catch (error) {
      console.warn("Initial camera preview failed, continuing with signaling only:", error?.message || error);
    }
  }

  function resetPeerConnection() {
    console.log("🔄 Resetting peer connection and negotiation state");
    state.hasCreatedOffer = false;
    state.pendingIceCandidates = [];
    if (state.peerConnection) {
      try {
        state.peerConnection.ontrack = null;
        state.peerConnection.onicecandidate = null;
        state.peerConnection.oniceconnectionstatechange = null;
        state.peerConnection.onsignalingstatechange = null;
        state.peerConnection.close();
      } catch (e) {
        console.warn("Error closing peer connection:", e);
      }
      state.peerConnection = null;
    }
  }

  async function syncTracksToPeerConnection() {
    if (!state.peerConnection || !state.localStream) return;
    console.log("🔄 Syncing local tracks to active WebRTC PeerConnection");
    const senders = state.peerConnection.getSenders();
    const localTracks = state.localStream.getTracks();
    
    for (const track of localTracks) {
      const sender = senders.find(s => s.track && s.track.kind === track.kind);
      if (sender) {
        try {
          if (sender.track !== track) {
            await sender.replaceTrack(track);
            console.log(`✅ Replaced ${track.kind} track on PeerConnection`);
          }
        } catch (e) {
          console.error(`❌ Error replacing ${track.kind} track:`, e);
        }
      } else {
        try {
          state.peerConnection.addTrack(track, state.localStream);
          console.log(`✅ Added new ${track.kind} track to PeerConnection`);
        } catch (e) {
          console.error(`❌ Error adding ${track.kind} track:`, e);
        }
      }
    }
  }

  function ensurePeerConnection() {
    if (state.peerConnection) {
      return state.peerConnection;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    sendTelemetry("webrtc", "RTCPeerConnection instance created");

    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, state.localStream);
        sendTelemetry("webrtc", `Added local track to PeerConnection: ${track.kind}`);
      });
    }

    pc.onnegotiationneeded = async () => {
      console.log("WebRTC negotiation needed");
      sendTelemetry("webrtc", "onnegotiationneeded fired");
      if (state.role === "doctor" && state.socket && state.socket.readyState === WebSocket.OPEN) {
        try {
          state.hasCreatedOffer = false; // Reset to allow a new offer
          await createOffer();
        } catch (err) {
          console.error("Error creating offer on negotiationneeded:", err);
          sendTelemetry("error", `negotiationneeded createOffer failed: ${err.message}`);
        }
      } else if (state.role === "patient") {
        console.log("Patient ignored onnegotiationneeded (negotiation is managed by doctor's offer)");
        sendTelemetry("webrtc", "Patient ignored onnegotiationneeded (no-op)");
      }
    };

    pc.ontrack = (event) => {
      let remoteStream = event.streams[0];
      if (!remoteStream) {
        if (!state.remoteStream) {
          state.remoteStream = new MediaStream();
        }
        state.remoteStream.addTrack(event.track);
        remoteStream = state.remoteStream;
      } else {
        state.remoteStream = remoteStream;
      }
      window.torusRemoteStream = remoteStream;
      sendTelemetry("webrtc", `ontrack: received remote track kind=${event.track.kind}`);

      const remoteVideo = document.getElementById("remoteVideo");
      if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        remoteVideo.muted = false;
        void tryPlayVideo(remoteVideo);
      }

      // Sync streams to the scanning view video elements
      const patientVideo = document.getElementById("patientVideo");
      if (patientVideo && state.role === "doctor") {
        patientVideo.srcObject = remoteStream;
        patientVideo.muted = false;
        void tryPlayVideo(patientVideo);
        togglePatientPlaceholder(true);
      }

      const consultationPatientVideo = document.getElementById("consultationPatientVideo");
      if (consultationPatientVideo && state.role === "doctor") {
        consultationPatientVideo.srcObject = remoteStream;
        consultationPatientVideo.muted = false;
        void tryPlayVideo(consultationPatientVideo);
        const placeholder = document.getElementById("consultationPlaceholder");
        if (placeholder) placeholder.classList.add("hidden");
      }

      const doctorTileVideo = document.getElementById("doctorTileVideo");
      if (doctorTileVideo && state.role === "patient") {
        doctorTileVideo.srcObject = remoteStream;
        doctorTileVideo.muted = false;
        void tryPlayVideo(doctorTileVideo);
      }

      renderRoleVideoLayout();
      setCallState(CALL_STATE.CONNECTED);
      showLiveCallUI();
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !state.socket || state.socket.readyState !== WebSocket.OPEN) return;
      console.log("ICE candidate sent");
      sendTelemetry("webrtc", "Local ICE candidate sent", { candidate: event.candidate.candidate });
      sendSignal("candidate", {
        roomId: state.roomId,
        candidate: event.candidate
      });
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      sendTelemetry("webrtc", `connectionState change: ${pc.connectionState}`);
      if (pc.connectionState === "connected" || pc.connectionState === "completed") {
        console.log("✅ CONNECTED");
        setCallState(CALL_STATE.CONNECTED);
        return;
      }

      if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
        setCallState(CALL_STATE.WAITING);
        clearRemoteVideo();
      }
    };

    pc.oniceconnectionstatechange = () => {
      sendTelemetry("webrtc", `iceConnectionState change: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setCallState(CALL_STATE.CONNECTED);
        return;
      }

      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        setCallState(CALL_STATE.WAITING);
        clearRemoteVideo();
      }
    };

    state.peerConnection = pc;
    window.torusPeerConnection = pc;
    return pc;
  }

  function sendSignal(eventName, payload) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;

    state.socket.send(JSON.stringify({
      type: eventName,
      roomId: state.roomId,
      room: state.roomId,
      ...payload
    }));
  }

  function createSignalSocketAdapter(socket, signalServerUrl) {
    const adapter = {
      rawSocket: socket,
      readyState: WebSocket.CONNECTING,
      onopen: null,
      onerror: null,
      onclose: null,
      onmessage: null,
      send(message) {
        if (adapter.readyState !== WebSocket.OPEN) {
          return;
        }

        let data = message;
        if (typeof data === "string") {
          try {
            data = JSON.parse(data);
          } catch (_error) {
            return;
          }
        }

        const type = String(data.type || "").trim();
        const roomId = String(data.roomId || data.room || "").trim();

        if (type === "join" || type === "join-room") {
          socket.emit("join-room", { roomId, room: roomId, role: data.role });
          console.log("join-room sent:", roomId, data.role);
          return;
        }

        if (type === "patient-proceed") {
          socket.emit("patient-proceed", { roomId, room: roomId });
          return;
        }

        if (type === "doctor-begin") {
          socket.emit("doctor-begin", { roomId, room: roomId });
          return;
        }

        if (type === "patient-report-redirect") {
          socket.emit("patient-report-redirect", { roomId, room: roomId });
          return;
        }

        if (type === "ready") {
          socket.emit("ready", {
            roomId,
            room: roomId
          });
          return;
        }

        if (type === "offer") {
          socket.emit("offer", {
            roomId,
            room: roomId,
            offer: data.offer
          });
          return;
        }

        if (type === "answer") {
          socket.emit("answer", {
            roomId,
            room: roomId,
            answer: data.answer
          });
          return;
        }

        if (type === "candidate" || type === "ice-candidate") {
          socket.emit("ice-candidate", {
            roomId,
            room: roomId,
            candidate: data.candidate
          });
        }
      },
      close() {
        socket.disconnect();
        adapter.readyState = WebSocket.CLOSED;
      },
      url: signalServerUrl
    };

    socket.on("connect", () => {
      adapter.readyState = WebSocket.OPEN;
      if (typeof adapter.onopen === "function") {
        adapter.onopen();
      }
    });

    socket.on("disconnect", () => {
      adapter.readyState = WebSocket.CLOSED;
      if (typeof adapter.onclose === "function") {
        adapter.onclose();
      }
    });

    socket.on("connect_error", (err) => {
      if (typeof adapter.onerror === "function") {
        adapter.onerror(err);
      }
    });

    const forward = (type, payload = {}) => {
      console.log('DEBUG [frontend.js forward]: type:', type, 'payload:', payload);
      if (typeof adapter.onmessage === "function") {
        adapter.onmessage({
          data: JSON.stringify({ type, ...payload })
        });
      }
    };

    socket.on("share-report", (payload) => forward("share-report", payload));
    socket.on("share-captured-images", (payload) => forward("share-captured-images", Array.isArray(payload) ? { images: payload } : (payload && payload.images ? payload : { images: payload })));
    socket.on("joined-room", (payload) => forward("joined-room", payload));
    socket.on("doctor-joined", (payload) => forward("doctor-joined", payload));
    socket.on("patient-proceed", (payload) => forward("patient-proceed", payload));
    socket.on("doctor-begin", (payload) => forward("doctor-begin", payload));
    socket.on("patient-report-redirect", (payload) => forward("patient-report-redirect", payload));
    socket.on("user-joined", (payload) => forward("user-joined", payload));
    socket.on("ready", (payload) => forward("ready", payload));
    socket.on("both-users-connected", (payload) => forward("both-users-connected", payload));
    socket.on("connect-success", (payload) => forward("connect-success", payload));
    socket.on("waiting-state", (payload) => forward("waiting-state", payload));
    socket.on("user-left", (payload) => forward("user-left", payload));
    socket.on("offer", (payload) => forward("offer", { offer: payload }));
    socket.on("answer", (payload) => forward("answer", { answer: payload }));
    socket.on("ice-candidate", (payload) => {
      let cand = payload;
      if (payload && payload.candidate && typeof payload.candidate === "object") {
        cand = payload.candidate;
      }
      forward("ice-candidate", { candidate: cand });
    });
    socket.on("error-message", (payload) => forward("error-message", payload || {}));

    return adapter;
  }

  async function createOffer() {
    sendTelemetry("webrtc", "createOffer started");
    const pc = ensurePeerConnection();

    if (state.hasCreatedOffer) {
      sendTelemetry("webrtc", "createOffer aborted: hasCreatedOffer is true");
      return;
    }

    if (pc.signalingState !== "stable") {
      sendTelemetry("webrtc", `createOffer aborted: signalingState is ${pc.signalingState}`);
      return;
    }

    state.hasCreatedOffer = true;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendTelemetry("webrtc", "setLocalDescription (offer) success");

      sendSignal("offer", {
        roomId: state.roomId,
        offer
      });
      console.log("Offer sent");
      sendTelemetry("webrtc", "Offer sent over signaling");
    } catch (e) {
      console.error("createOffer error:", e);
      sendTelemetry("error", `createOffer failed: ${e.message}`);
    }
  }

  async function flushPendingIceCandidates() {
    if (!state.peerConnection || !state.pendingIceCandidates.length) {
      return;
    }

    const pending = [...state.pendingIceCandidates];
    state.pendingIceCandidates = [];
    sendTelemetry("webrtc", `Flushing ${pending.length} pending ICE candidates`);

    for (const candidate of pending) {
      try {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        sendTelemetry("webrtc", "addIceCandidate success (flushed)");
      } catch (error) {
        console.error("ICE error", error);
        sendTelemetry("error", `addIceCandidate failed (flushed): ${error.message}`);
      }
    }
  }

  async function handleOffer(message) {
    console.log("Offer received");
    sendTelemetry("webrtc", "Offer received over signaling");
    const isPcConnected = state.peerConnection && 
      (state.peerConnection.connectionState === "connected" || state.peerConnection.connectionState === "completed");
    if (!isPcConnected) {
      console.log("Peer connection is not active, resetting to prepare for handling new offer");
      resetPeerConnection();
    } else {
      console.log("Peer connection is already active, handling new offer on existing connection");
    }
    const pc = ensurePeerConnection();

    state.hasCreatedOffer = false;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
      sendTelemetry("webrtc", "setRemoteDescription (offer) success");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendTelemetry("webrtc", "setLocalDescription (answer) success");
      await flushPendingIceCandidates();

      sendSignal("answer", {
        roomId: state.roomId,
        answer
      });
      console.log("Answer sent");
      sendTelemetry("webrtc", "Answer sent over signaling");
    } catch (e) {
      console.error("handleOffer error:", e);
      sendTelemetry("error", `handleOffer failed: ${e.message}`);
    }
  }

  async function handleAnswer(message) {
    if (!state.peerConnection) {
      sendTelemetry("webrtc", "handleAnswer aborted: peerConnection is null");
      return;
    }
    console.log("Answer received");
    sendTelemetry("webrtc", "Answer received over signaling");
    try {
      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
      sendTelemetry("webrtc", "setRemoteDescription (answer) success");
      await flushPendingIceCandidates();
      state.hasCreatedOffer = false;
    } catch (e) {
      console.error("handleAnswer error:", e);
      sendTelemetry("error", `handleAnswer failed: ${e.message}`);
    }
  }

  async function handleIceCandidate(message) {
    if (!message.candidate) return;

    console.log("ICE candidate received");
    sendTelemetry("webrtc", "ICE candidate received over signaling");

    if (!state.peerConnection) {
      sendTelemetry("webrtc", "PeerConnection null, queueing ICE candidate");
      state.pendingIceCandidates.push(message.candidate);
      return;
    }

    const hasRemoteDescription = Boolean(state.peerConnection.remoteDescription);
    if (!hasRemoteDescription) {
      sendTelemetry("webrtc", "RemoteDescription null, queueing ICE candidate");
      state.pendingIceCandidates.push(message.candidate);
      return;
    }

    try {
      await state.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      sendTelemetry("webrtc", "addIceCandidate success");
    } catch (error) {
      console.error("ICE error", error);
      sendTelemetry("error", `addIceCandidate failed: ${error.message}`);
    }
  }

  async function connectSocket() {
    await connectSignaling();
  }

  async function initSocket() {
    await connectSocket();
  }

  async function startWebRTC() {
    ensurePeerConnection();
  }

  function syncRoomInUrl(roomId) {
    const room = normalizeRoomId(roomId);
    if (!room) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("room", room);
    url.searchParams.set("role", state.role);
    window.history.replaceState(null, "", url.toString());
  }

  function storeDoctorUrl(roomId) {
    const normalizedRoom = normalizeRoomId(roomId);
    if (!normalizedRoom) {
      return;
    }

    state.doctorUrl = buildAbsoluteDoctorUrl(normalizedRoom);
    localStorage.setItem("doctorRoomId", normalizedRoom);
    localStorage.setItem("doctorUrl", state.doctorUrl);
  }

  function ensureDoctorRoomGenerated() {
    if (state.role !== "doctor") {
      return;
    }

    if (!state.roomId) {
      state.roomId = normalizeRoomId(generateRoomId());
    }

    if (!state.roomId) {
      return;
    }

    syncRoomInUrl(state.roomId);
    storeDoctorUrl(state.roomId);
  }

  async function startConsultationSession() {
    if (isStarted || window.callStarted || window.started) {
      return;
    }

    isStarted = true;
    window.callStarted = true;
    window.started = true;
    state.hasManualSessionStart = false;

    try {
      showWaitingState(state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient");

      if (!state.roomId) {
        throw new Error("Missing room ID. Open connected-device.html with ?room=ABC123&role=doctor or ?room=ABC123&role=patient");
      }

      localStorage.setItem("roomId", state.roomId);
      if (state.role === "doctor") {
        storeDoctorUrl(state.roomId);
      }

      try {
        await startMedia();
      } catch (cameraError) {
        const cameraMessage = String(cameraError?.message || cameraError || "");
        if (/camera|permission|notallowed|notfound|notreadable/i.test(cameraMessage)) {
          console.warn("Camera unavailable, continuing with signaling only:", cameraMessage);
          state.localStream = null;
        } else {
          throw cameraError;
        }
      }
      await initSocket();
      await startWebRTC();

      if (state.role === "patient") {
        // removed auto-send patient-proceed to require manual click
      }

      showWaitingState(state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient");
    } catch (error) {
      const errorMessage = error?.message || "Failed to start call";
      isStarted = false;
      window.callStarted = false;
      window.started = false;
      state.hasManualSessionStart = false;

      const readableMessage = /socket|signaling|connect/i.test(errorMessage)
        ? `Unable to connect signaling server${state.signalServerUrl ? ` (${state.signalServerUrl})` : ""}. ${errorMessage}`
        : errorMessage;
      showInitialState();
      setCallState(CALL_STATE.WAITING, readableMessage);
      console.error(error);

      const isCameraPermissionError = /camera|permission/i.test(errorMessage);
      if (!/socket\.io|signaling|connect|websocket|socket/i.test(errorMessage) && !isCameraPermissionError) {
        window.alert(errorMessage);
      }

      console.warn("Failed to start consultation:", readableMessage);
    } finally {
      if (dom.testingBtn && state.callState !== CALL_STATE.CONNECTED) {
        dom.testingBtn.disabled = true;
        dom.testingBtn.textContent = state.role === "patient" ? "Waiting for Doctor" : "Waiting for Patient";
        dom.testingBtn.classList.remove("ultrasound-ready");
        dom.testingBtn.classList.add("is-waiting");
      }
    }
  }

  async function handleTestingClick(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (state.role === "patient") {
      if (state.doctorBeginReceived) {
        console.log("Patient clicked Ultra Sound in Progress -> Redirecting to ultrasound-scanning.html");
        if (window.navigateSPA) {
          window.navigateSPA('ultrasound-scanning');
        } else {
          window.location.href = `ultrasound-scanning.html?room=${state.roomId}&role=patient`;
        }
      } else {
        console.log("Patient clicked Doctor Joined -> Sending patient-proceed");
        state.hasClickedProceed = true;
        sendSignal("patient-proceed");
        if (dom.testingBtn) {
          dom.testingBtn.textContent = "Waiting for Doctor to start...";
          dom.testingBtn.disabled = true;
          dom.testingBtn.classList.remove("ultrasound-ready");
          dom.testingBtn.classList.add("is-waiting");
        }
      }
    } else if (state.role === "doctor") {
      if (!state.doctorClickedBegin) {
        state.doctorClickedBegin = true;

        // Clear stale session/image data for this room to start fresh
        const rParam = String(state.roomId || 'default').trim().toUpperCase();
        localStorage.removeItem('torus-capture-session-id-' + rParam);
        sessionStorage.removeItem('torus-capture-session-id-' + rParam);
        localStorage.removeItem('capturedImages-' + rParam);
        sessionStorage.removeItem('capturedImages-' + rParam);
        localStorage.removeItem('patientCapturedImages-' + rParam);
        sessionStorage.removeItem('patientCapturedImages-' + rParam);

        // Clear report cache for a fresh session
        localStorage.removeItem('torus-report-collage-' + rParam);
        localStorage.removeItem('torus-report-selected-ids-' + rParam);
        localStorage.removeItem('torus-report-findings-' + rParam);
        localStorage.removeItem('torus-report-recommendations-' + rParam);
        localStorage.removeItem('torus-report-context-' + rParam);
        localStorage.removeItem('torus-report-id-' + rParam);
        localStorage.removeItem('torus-report-details-' + rParam);
        localStorage.removeItem('torus-report-preview-' + rParam);
        localStorage.removeItem('torus-report-generated-' + rParam);
        localStorage.removeItem('torus-report-delivery-status-' + rParam);

        sendSignal("doctor-begin");
        console.log("Doctor clicked to begin consultation");

        if (state.socket && state.socket.readyState === WebSocket.OPEN && state.roomId && state.isJoined) {
          sendSignal("ready", { roomId: state.roomId });
        }

        if (window.navigateSPA) {
          window.navigateSPA('ultrasound-scanning');
        } else {
          window.location.href = `ultrasound-scanning.html?room=${state.roomId}&role=doctor`;
        }
      } else {
        console.log("Doctor clicked Ultrasound Scanning button -> Redirecting to ultrasound scanning page");
        if (window.navigateSPA) {
          window.navigateSPA('ultrasound-scanning');
        } else {
          window.location.href = `ultrasound-scanning.html?room=${state.roomId}&role=doctor`;
        }
      }
    }
  }

  function stopMediaStreams() {
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => track.stop());
      state.localStream = null;
    }

    if (state.remoteStream) {
      state.remoteStream.getTracks().forEach((track) => track.stop());
      state.remoteStream = null;
    }
  }

  function cleanupConnection() {
    if (state.peerConnection) {
      state.peerConnection.ontrack = null;
      state.peerConnection.onicecandidate = null;
      state.peerConnection.close();
      state.peerConnection = null;
    }

    if (state.socket) {
      state.socket.onopen = null;
      state.socket.onmessage = null;
      state.socket.onerror = null;
      state.socket.onclose = null;
      if (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING) {
        state.socket.close();
      }
      state.socket = null;
    }

    state.pendingIceCandidates = [];
    state.callState = CALL_STATE.WAITING;
    state.isJoined = false;
    state.hasCreatedOffer = false;
    state.isPatientConnected = false;
    state.hasManualSessionStart = false;
    state.hasShownDoctorJoinedPopup = false;
    state.hasClickedProceed = false;
    state.doctorBeginReceived = false;
    state.doctorClickedBegin = false;
    sessionStorage.removeItem(getJoinSessionKey("doctor"));
    sessionStorage.removeItem(getJoinSessionKey("patient"));
    isStarted = false;
    window.callStarted = false;
    window.started = false;
    clearRemoteVideo();
    resetVideoPlaceholders();
    hideDoctorJoinedPopup();
    showInitialUI();
  }

  function bindStaticButtons() {
    const patientReportOkBtn = document.getElementById("patientReportOkBtn");
    if (patientReportOkBtn) {
      patientReportOkBtn.addEventListener("click", () => {
        const modal = document.getElementById("patientReportGeneratedModal");
        if (modal) {
          modal.classList.add("hidden");
          modal.setAttribute("aria-hidden", "true");
        }
      });
    }

    if (dom.testingBtn) {
      dom.testingBtn.onclick = (event) => {
        if (dom.testingBtn.disabled) {
          event.preventDefault();
          return;
        }

        handleTestingClick(event);
      };
    }

    if (dom.backBtn) {
      dom.backBtn.addEventListener("click", () => {
        cleanupConnection();
        stopMediaStreams();

        const params = new URLSearchParams(window.location.search);
        const role = params.get('role');
        const room = params.get('room') || '';

        if (role === 'doctor') {
          window.location.href = `doctor-dashboard.html${window.location.search}`;
        } else if (role === 'patient' || role === 'pat') {
          window.location.href = `diagnostic-dashboard.html${window.location.search}`;
        } else {
          showInitialState();
        }
      });
    }

    if (dom.doctorJoinedModalAction) {
      dom.doctorJoinedModalAction.addEventListener("click", hideDoctorJoinedPopup);
    }

    if (dom.doctorJoinedModal) {
      dom.doctorJoinedModal.addEventListener("click", (event) => {
        if (event.target === dom.doctorJoinedModal) {
          hideDoctorJoinedPopup();
        }
      });
    }

    if (dom.endBtn) {
      dom.endBtn.addEventListener("click", () => {
        cleanupConnection();
        stopMediaStreams();
      });
    }

    if (dom.flipBtn) {
      dom.flipBtn.addEventListener("click", () => {
        isFlipped = !isFlipped;
        const video = document.getElementById("localVideo");
        if (video) {
          video.style.transform = isFlipped ? "scaleX(-1)" : "scaleX(1)";
        }
      });
    }

    dom.panelFullscreenButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const panel = button.closest(".feed-card");
        if (!panel) return;

        try {
          if (!document.fullscreenElement) {
            await panel.requestFullscreen();
          } else {
            await document.exitFullscreen();
          }
        } catch (error) {
          console.error("Fullscreen error", error);
        }
      });
    });

    dom.panelMenuButtons.forEach((button) => {
      button.addEventListener("click", () => {
        console.log("Panel menu clicked", button.closest(".feed-card")?.id || "unknown-panel");
      });
    });
  }

  function bindPremiumButtonEffects() {
    const buttons = document.querySelectorAll(".btn-primary, .btn-danger, .primary-btn, .danger-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement("span");
        ripple.classList.add("ripple");
        ripple.style.left = `${e.clientX - rect.left}px`;
        ripple.style.top = `${e.clientY - rect.top}px`;
        btn.appendChild(ripple);
        window.setTimeout(() => ripple.remove(), 600);
      });
    });
  }

  function getJoinSessionKey(role) {
    return `${role || "unknown"}-joined:${state.roomId || "default"}`;
  }

  async function init() {
    isStarted = false;
    window.callStarted = false;
    window.started = false;
    readConfig();
    cacheDom();
    bindStaticButtons();
    bindPremiumButtonEffects();
    setInitialState();

    // Warn about HTTPS requirement on mobile
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      const isHttps = window.location.protocol === "https:";
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      if (!isHttps && !isLocalhost) {
        console.warn("Mobile requires HTTPS for camera access, but using HTTP. Some devices may need tunneling.");
      }
    }

    if (state.roomId) {
      setSubtitle(`Patient Video Consultation - Room ${state.roomId}`);
    }

    if (state.role === "doctor" && !state.roomId) {
      setSubtitle("Patient Video Consultation - Ready to create room");
    }

    ensureDoctorRoomGenerated();

    const unmuteAll = () => {
      console.log("🔊 User interaction detected: Unmuting remote feeds");
      const remoteVideo = document.getElementById("remoteVideo");
      if (remoteVideo && remoteVideo.srcObject) {
        remoteVideo.muted = false;
      }
      const patientVideo = document.getElementById("patientVideo");
      if (patientVideo && patientVideo.srcObject && state.role === "doctor") {
        patientVideo.muted = false;
      }
      const consultationPatientVideo = document.getElementById("consultationPatientVideo");
      if (consultationPatientVideo && consultationPatientVideo.srcObject && state.role === "doctor") {
        consultationPatientVideo.muted = false;
      }
      const doctorTileVideo = document.getElementById("doctorTileVideo");
      if (doctorTileVideo && doctorTileVideo.srcObject && state.role === "patient") {
        doctorTileVideo.muted = false;
      }
      document.removeEventListener("click", unmuteAll);
      document.removeEventListener("touchstart", unmuteAll);
    };
    document.addEventListener("click", unmuteAll);
    document.addEventListener("touchstart", unmuteAll);

    try {
      // Start the local camera on page load for the active role.
      // Doctor and patient previews are initialized automatically; remote peer media stays untouched.
      if (state.role === "doctor" || state.role === "patient") {
        await startInitialCameraPreview();
      }

      if (state.role === "doctor" || state.role === "patient") {
        await startConsultationSession();
      }

    } catch (error) {
      setCallState(CALL_STATE.WAITING, "Waiting...");
      setConnectionLabel("Waiting");
      console.error("Init error:", error);
    }
  }

  window.switchCamera = async function () {
    await switchCamera();
  };

  window.syncTracksToPeerConnection = async function () {
    await syncTracksToPeerConnection();
  };

  window.toggleMute = function () {
    const micToggleBtn = document.getElementById("micToggleBtn");
    if (micToggleBtn) {
      micToggleBtn.click();
    } else {
      state.micEnabled = !state.micEnabled;
      if (state.localStream) {
        state.localStream.getAudioTracks().forEach((track) => {
          track.enabled = state.micEnabled;
        });
      }
    }
  };

  window.endCall = function () {
    const endBtn = document.getElementById("endConsultationBtn");
    if (endBtn) {
      endBtn.click();
    } else {
      cleanupConnection();
      stopMediaStreams();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
