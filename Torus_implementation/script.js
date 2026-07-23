const APP_PAGES = {
  login: 'doctor-portal.html',
  biometric: 'biometric-auth.html',
  dashboard: 'doctor-dashboard.html',
  connectedDevice: 'connected-device.html'
};

const DOCTOR_ACTIVE_SESSIONS = [
  {
    id: 'S-001',
    patient: 'Patient A',
    device: 'TORUS-A12',
    scanType: 'Abdominal',
    duration: '12:34',
    status: 'In Progress',
    actionLabel: 'Join',
    patientId: 'P-12345'
  }
];

const DOCTOR_UPCOMING_SESSIONS = [
  {
    id: 1,
    patient: 'John Doe',
    device: 'TORUS-A12',
    scanType: 'Abdominal',
    center: 'NYC Medical',
    time: '10:30 AM',
    patientId: 'P-8821',
    ageGender: '42 | Male',
    contact: '+1 (555) 019-2834',
    clinicalNotes: 'Patient complaining of abdominal discomfort. Fasting for 8 hours prior to scan.',
    previousReports: '2025-05-12 - Normal Abdominal Scan'
  },
  {
    id: 2,
    patient: 'Jane Smith',
    device: 'TORUS-B08',
    scanType: 'Cardiac',
    center: 'Boston General',
    time: '12:00 PM',
    patientId: 'P-9104',
    ageGender: '36 | Female',
    contact: '+1 (555) 014-9876',
    clinicalNotes: 'Routine cardiac monitoring. History of mild arrhythmia.',
    previousReports: '2026-02-14 - Electrocardiogram (ECG) stable'
  },
  {
    id: 3,
    patient: 'Robert Brown',
    device: 'TORUS-C15',
    scanType: 'Pelvic',
    center: 'Apollo Hyderabad',
    time: '02:15 PM',
    patientId: 'P-7543',
    ageGender: '55 | Male',
    contact: '+1 (555) 012-3456',
    clinicalNotes: 'Pelvic pain investigation. Dynamic tracking requested.',
    previousReports: 'None'
  }
];

const ADMIN_ACTIVE_SESSIONS = [
  ...DOCTOR_ACTIVE_SESSIONS,
  {
    id: 'S-002',
    patient: 'Patient B',
    device: 'TORUS-B08',
    scanType: 'Cardiac',
    duration: '08:41',
    status: 'In Progress',
    actionLabel: 'Join',
    patientId: 'P-54321'
  }
];

const ADMIN_UPCOMING_SESSIONS = [
  ...DOCTOR_UPCOMING_SESSIONS,
  {
    id: 4,
    patient: 'Emily Davis',
    device: 'TORUS-D22',
    scanType: 'Thyroid',
    center: 'Fortis Bangalore',
    time: '04:00 PM',
    patientId: 'P-1122',
    ageGender: '29 | Female',
    contact: '+91 (987) 654-3210',
    clinicalNotes: 'Check for thyroid nodule progression.',
    previousReports: '2025-11-20 - Sub-centimeter benign nodule'
  }
];

const TORUS_DEVICES = [
  { id: 'TORUS-A12', hospital: 'NYC Medical Center', location: 'New York, USA', city: 'New York', state: 'New York', country: 'USA', status: 'online', latency: '35ms', signal: '98%' },
  { id: 'TORUS-B08', hospital: 'Boston General Hospital', location: 'Boston, USA', city: 'Boston', state: 'Massachusetts', country: 'USA', status: 'standby', latency: '42ms', signal: '95%' },
  { id: 'TORUS-C15', hospital: 'Apollo Hospital', location: 'Hyderabad, India', city: 'Hyderabad', state: 'Telangana', country: 'India', status: 'online', latency: '38ms', signal: '97%' },
  { id: 'TORUS-D22', hospital: 'Fortis Healthcare', location: 'Bangalore, India', city: 'Bangalore', state: 'Karnataka', country: 'India', status: 'standby', latency: '55ms', signal: '89%' },
  { id: 'TORUS-E18', hospital: 'CMC Hospital', location: 'Chennai, India', city: 'Chennai', state: 'Tamil Nadu', country: 'India', status: 'online', latency: '45ms', signal: '92%' },
  { id: 'TORUS-F09', hospital: 'LA Medical Plaza', location: 'Los Angeles, USA', city: 'Los Angeles', state: 'California', country: 'USA', status: 'online', latency: '48ms', signal: '94%' }
];

let selectedDeviceId = '';

const HAPTIC_STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected'
};

const HAPTIC_BACKEND_CONFIG = {
  enableWebSocket: false,
  enableApiPolling: true,
  webSocketUrl: (window.location.port === '3000' || window.location.port === '') ? (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host : (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.hostname + ':5003',
  apiEndpoint: (window.location.port === '3000' || window.location.port === '') ? '/haptic-status' : window.location.protocol + '//' + window.location.hostname + ':5003/haptic-status',
  apiPollIntervalMs: 5000
};

// Grace period (ms) on initial load before showing Not Connected (4 seconds)
const HAPTIC_CONNECT_GRACE_MS = 4000;

const HAPTIC_STATE_LABELS = {
  [HAPTIC_STATUS.CONNECTING]: 'Connecting...',
  [HAPTIC_STATUS.CONNECTED]: 'Haptic Pad Connected',
  [HAPTIC_STATUS.DISCONNECTED]: 'Not Connected'
};

const hapticState = {
  currentStatus: HAPTIC_STATUS.CONNECTING,
  noSignalTimerId: null,
  autoTransitionTimer: null,
  apiPollTimerId: null,
  websocket: null,
  activeModalType: null,
  backendErrorLogged: false,
  diagnosticsErrorLogged: false,
  axisDiagnostics: null,
  hasInitialized: false
};

// timestamp (ms) when haptic init started
hapticState.startTime = null;

function normalizeHapticStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === HAPTIC_STATUS.CONNECTED) {
    return HAPTIC_STATUS.CONNECTED;
  }
  if (normalized === 'disconnected' || normalized === 'not-connected' || normalized === 'not_connected') {
    return HAPTIC_STATUS.DISCONNECTED;
  }
  if (normalized === HAPTIC_STATUS.CONNECTING) {
    return HAPTIC_STATUS.CONNECTING;
  }
  return null;
}

function getHapticElements() {
  return {
    chip: document.getElementById('hapticStatusChip'),
    chipStateText: document.getElementById('hapticChipStateText'),
    axisRow: document.getElementById('hapticAxisStatusRow')
  };
}

function updateHapticChip(status) {
  const { chip, chipStateText } = getHapticElements();
  if (!chip || !chipStateText) {
    return;
  }

  const statusClassMap = {
    [HAPTIC_STATUS.CONNECTING]: 'haptic-chip--connecting',
    [HAPTIC_STATUS.CONNECTED]: 'haptic-chip--connected',
    [HAPTIC_STATUS.DISCONNECTED]: 'haptic-chip--disconnected'
  };

  chip.classList.remove('haptic-chip--connecting', 'haptic-chip--connected', 'haptic-chip--disconnected');
  chip.classList.add(statusClassMap[status]);
  chip.dataset.hapticStatus = status;
  chipStateText.textContent = HAPTIC_STATE_LABELS[status] || HAPTIC_STATE_LABELS[HAPTIC_STATUS.CONNECTING];
}

// Per-axis diagnostics UI removed from frontend; axis normalization and pill updates disabled.

function getHapticModalElements() {
  return {
    overlay: document.getElementById('hapticModalOverlay'),
    modal: document.getElementById('hapticModal'),
    icon: document.getElementById('hapticModalIcon'),
    title: document.getElementById('hapticModalTitle'),
    subtitle: document.getElementById('hapticModalSubtitle'),
    action: document.getElementById('hapticModalAction')
  };
}

function closeHapticModal() {
  const { overlay, modal } = getHapticModalElements();
  if (!overlay || !modal) {
    return;
  }

  modal.classList.add('is-closing');
  window.setTimeout(() => {
    overlay.hidden = true;
    modal.classList.remove('is-closing', 'is-error');
    hapticState.activeModalType = null;
  }, 220);
}

function showConnectingModal() {
  const { overlay, modal, icon, title, subtitle, action } = getHapticModalElements();
  if (!overlay || !modal || !icon || !title || !subtitle || !action) {
    return;
  }

  modal.classList.remove('is-error');
  icon.className = 'haptic-modal-icon spinner';
  icon.textContent = '';
  title.textContent = 'Connecting...';
  subtitle.textContent = 'Attempting to connect the haptic pad device.';
  action.textContent = 'OK';
  action.disabled = true;

  overlay.hidden = false;
  hapticState.activeModalType = 'connecting';
}

function showErrorModal() {
  const { overlay, modal, icon, title, subtitle, action } = getHapticModalElements();
  if (!overlay || !modal || !icon || !title || !subtitle || !action) {
    return;
  }

  modal.classList.add('is-error');
  icon.className = 'haptic-modal-icon';
  icon.textContent = '⚠';
  title.textContent = 'Haptic Pad Not Connected';
  subtitle.textContent = 'Please try again later.';
  action.textContent = 'OK';
  action.disabled = false;

  overlay.hidden = false;
  hapticState.activeModalType = 'error';
}

function applyHapticStatus(nextStatus, options = {}) {
  const normalizedStatus = normalizeHapticStatus(nextStatus);
  if (!normalizedStatus) {
    return;
  }

  const previousStatus = hapticState.currentStatus;
  const force = Boolean(options.force);
  if (!force && previousStatus === normalizedStatus) {
    return;
  }

  // NEVER return back to Connecting state after the initial startup period
  if (normalizedStatus === HAPTIC_STATUS.CONNECTING && !force && hapticState.startTime === null) {
    return;
  }

  hapticState.currentStatus = normalizedStatus;
  updateHapticChip(normalizedStatus);

  if (normalizedStatus === HAPTIC_STATUS.CONNECTING) {
    showConnectingModal();
    return;
  }

  if (normalizedStatus === HAPTIC_STATUS.DISCONNECTED && options.showPopup !== false) {
    showErrorModal();
    return;
  }

  closeHapticModal();
}

function handleHapticBackendStatus(status) {
  const normalizedStatus = normalizeHapticStatus(status);
  if (!normalizedStatus) {
    return;
  }

  // If we successfully connect, clear the initial grace period so future drops instantly show Not Connected
  if (normalizedStatus === HAPTIC_STATUS.CONNECTED) {
    hapticState.startTime = null;
  }

  // If backend reports DISCONNECTED very early after init, allow grace period
  if (normalizedStatus === HAPTIC_STATUS.DISCONNECTED && hapticState.startTime && (Date.now() - hapticState.startTime) < HAPTIC_CONNECT_GRACE_MS) {
    // keep showing CONNECTING during grace period
    return;
  }

  applyHapticStatus(normalizedStatus, { showPopup: normalizedStatus === HAPTIC_STATUS.DISCONNECTED });
}

async function fetchHapticStatusFromApi() {
  if (!HAPTIC_BACKEND_CONFIG.enableApiPolling) {
    return;
  }

  try {
    const response = await fetch(HAPTIC_BACKEND_CONFIG.apiEndpoint, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Status API failed with ${response.status}`);
    }

    const payload = await response.json();
    const payloadStatus = normalizeHapticStatus(payload.status);
    const mappedStatus = payloadStatus || (payload.connected === true
      ? HAPTIC_STATUS.CONNECTED
      : HAPTIC_STATUS.DISCONNECTED);

    // If mappedStatus is DISCONNECTED but we are within grace period after init, defer switching
    if (mappedStatus === HAPTIC_STATUS.DISCONNECTED && hapticState.startTime && (Date.now() - hapticState.startTime) < HAPTIC_CONNECT_GRACE_MS) {
      // keep showing CONNECTING
    } else {
      handleHapticBackendStatus(mappedStatus);
    }

    hapticState.backendErrorLogged = false;
  } catch (error) {
    if (!hapticState.backendErrorLogged) {
      console.warn('Haptic status API unavailable.');
      hapticState.backendErrorLogged = true;
    }
    // If still within initial grace period, don't immediately flip to Not Connected
    if (hapticState.startTime && (Date.now() - hapticState.startTime) < HAPTIC_CONNECT_GRACE_MS) {
      // keep connecting
    } else {
      applyHapticStatus(HAPTIC_STATUS.DISCONNECTED, { showPopup: true });
    }
  }
}

async function refreshHapticBackendState() {
  await fetchHapticStatusFromApi();
}

function initHapticBackendChannels() {
  if (HAPTIC_BACKEND_CONFIG.enableWebSocket && 'WebSocket' in window) {
    try {
      hapticState.websocket = new WebSocket(HAPTIC_BACKEND_CONFIG.webSocketUrl);
      hapticState.websocket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          handleHapticBackendStatus(payload.status);
        } catch (error) {
          console.warn('Invalid WebSocket haptic payload');
        }
      });
    } catch (error) {
      console.warn('Unable to connect to haptic WebSocket endpoint.');
    }
  }

  if (HAPTIC_BACKEND_CONFIG.enableApiPolling) {
    refreshHapticBackendState();
    hapticState.apiPollTimerId = window.setInterval(refreshHapticBackendState, HAPTIC_BACKEND_CONFIG.apiPollIntervalMs);
  }
}


function initHapticStatusSystem() {
  if (hapticState.hasInitialized) {
    return;
  }

  const { overlay, action } = getHapticModalElements();
  if (!overlay || !action) {
    return;
  }

  hapticState.hasInitialized = true;

  // record start time so we allow a short grace period before declaring Not Connected
  hapticState.startTime = Date.now();
  applyHapticStatus(HAPTIC_STATUS.CONNECTING, { force: true });

  // Hard fallback: if 5 minutes pass and it hasn't connected, force it to Not Connected
  setTimeout(() => {
    if (hapticState.startTime !== null) {
      hapticState.startTime = null; // expire grace period permanently
      applyHapticStatus(HAPTIC_STATUS.DISCONNECTED, { showPopup: true });
    }
  }, HAPTIC_CONNECT_GRACE_MS);

  // per-axis UI removed; initial axis indicators no longer updated from frontend

  action.addEventListener('click', () => {
    if (hapticState.autoTransitionTimer) {
      window.clearTimeout(hapticState.autoTransitionTimer);
    }
    closeHapticModal();
  });

  window.updateHapticPadStatus = (status) => {
    handleHapticBackendStatus(status);
  };

  initHapticBackendChannels();
}

function getStorageKeys() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('diagnostic-') || path.includes('diagnostic_') || path.includes('diagnostic')) {
    return {
      session: 'diagnosticSession',
      email: 'diagnosticEmail',
      name: 'diagnosticName',
      initials: 'diagnosticInitials',
      role: 'diagnosticRole',
      token: 'diagnosticToken'
    };
  }
  return {
    session: 'doctorSession',
    email: 'doctorEmail',
    name: 'doctorName',
    initials: 'doctorInitials',
    role: 'doctorRole',
    token: 'doctorToken'
  };
}

function getStoredUser() {
  const keys = getStorageKeys();
  const raw = localStorage.getItem(keys.session);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.warn('Invalid userSession payload');
    }
  }

  const email = localStorage.getItem(keys.email) || '';
  const name = localStorage.getItem(keys.name) || '';
  const initials = localStorage.getItem(keys.initials) || '';
  const role = localStorage.getItem(keys.role) || (keys.session.startsWith('diagnostic') ? 'diagnostic' : 'doctor');

  if (!email && !name) {
    return null;
  }

  return {
    email,
    name,
    initials,
    role
  };
}

function saveUserSession(session) {
  const keys = getStorageKeys();
  const payload = {
    email: session.email || '',
    name: session.name || '',
    initials: session.initials || getInitialsFromName(session.name || session.email || ''),
    role: session.role || (keys.session.startsWith('diagnostic') ? 'diagnostic' : 'doctor')
  };

  localStorage.setItem(keys.session, JSON.stringify(payload));
  localStorage.setItem(keys.email, payload.email);
  localStorage.setItem(keys.name, payload.name);
  localStorage.setItem(keys.initials, payload.initials);
  localStorage.setItem(keys.role, payload.role);
}

function clearUserSession() {
  const keys = getStorageKeys();
  localStorage.removeItem(keys.session);
  localStorage.removeItem(keys.email);
  localStorage.removeItem(keys.name);
  localStorage.removeItem(keys.initials);
  localStorage.removeItem(keys.role);
  localStorage.removeItem(keys.token);
}

function formatDisplayNameFromEmail(email) {
  const prefix = String(email || '').split('@')[0] || '';
  const cleaned = prefix
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const formatted = cleaned
    ? cleaned.replace(/\b\w/g, (character) => character.toUpperCase())
    : 'User';

  return `Dr. ${formatted}`;
}

function getInitialsFromName(name) {
  const raw = String(name || '').replace(/^Dr\.\s*/i, '').trim();
  if (!raw) {
    return 'DA';
  }

  const initials = raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return initials || 'DA';
}

function ensureSessionOrRedirect() {
  const session = getStoredUser();
  if (!session || !session.email) {
    const keys = getStorageKeys();
    const isDiag = keys.session.startsWith('diagnostic');
    const fallbackSession = isDiag ? {
      email: 'diagnostic@torus.com',
      name: 'Diagnostic Admin',
      initials: 'DA',
      role: 'diagnostic'
    } : {
      email: 'doctor@hospital.com',
      name: 'Dr. User',
      initials: 'DU',
      role: 'doctor'
    };
    saveUserSession(fallbackSession);
    return fallbackSession;
  }
  return session;
}

function renderUserIdentity(session) {
  const displayName = session.name || formatDisplayNameFromEmail(session.email);
  const initials = session.initials || getInitialsFromName(displayName);

  document.querySelectorAll('[data-user-initials]').forEach((node) => {
    node.textContent = initials;
  });

  document.querySelectorAll('[data-user-name]').forEach((node) => {
    node.textContent = displayName;
  });

  document.querySelectorAll('[data-user-email]').forEach((node) => {
    node.textContent = session.email;
    if (node.tagName === 'A') {
      node.href = `mailto:${session.email}`;
    }
  });

  document.querySelectorAll('[data-user-role]').forEach((node) => {
    node.textContent = session.role || 'doctor';
  });
}

function renderBiometricPage() {
  const session = ensureSessionOrRedirect();
  if (!session) {
    return;
  }

  if (!session.name) {
    session.name = formatDisplayNameFromEmail(session.email);
    session.initials = getInitialsFromName(session.name);
    saveUserSession(session);
  }

  renderUserIdentity(session);

  const scanButton = document.getElementById('startScanBtn');
  const ring = document.getElementById('fingerprintRing');
  const title = document.getElementById('fingerprintTitle');
  const subtitle = document.getElementById('fingerprintSubtitle');
  const feedback = document.getElementById('fingerprintFeedback');
  const loader = document.getElementById('scanLoader');

  if (!scanButton || !ring || !title || !subtitle || !feedback || !loader) {
    return;
  }

  scanButton.addEventListener('click', () => {
    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';
    ring.classList.add('scanning');
    loader.classList.add('active');
    title.textContent = 'Scanning fingerprint...';
    subtitle.textContent = 'Please keep your finger steady while the system verifies your identity.';
    feedback.textContent = 'Authentication in progress';

    window.setTimeout(() => {
      ring.classList.remove('scanning');
      ring.classList.add('success');
      loader.classList.remove('active');
      title.textContent = 'Authentication Successful';
      subtitle.textContent = 'Redirecting to your dashboard...';
      feedback.textContent = 'Access granted';
      scanButton.textContent = 'Verified';

      window.setTimeout(() => {
        window.location.href = APP_PAGES.dashboard;
      }, 900);
    }, 2000);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function getDashboardData(role) {
  if (role === 'admin') {
    return {
      activeSessions: ADMIN_ACTIVE_SESSIONS,
      upcomingSessions: ADMIN_UPCOMING_SESSIONS,
      extraPanels: [
        {
          title: 'All Doctors',
          body: 'Dr. Manjula, Dr. Anderson, Dr. Rao, and Dr. Smith are currently connected.',
          accent: 'purple'
        },
        {
          title: 'System Health',
          body: 'All TORUS devices are online with stable latency and strong signal.',
          accent: 'cyan'
        }
      ]
    };
  }

  return {
    activeSessions: DOCTOR_ACTIVE_SESSIONS,
    upcomingSessions: DOCTOR_UPCOMING_SESSIONS,
    extraPanels: []
  };
}

function renderActiveSessions(list) {
  const container = document.getElementById('activeSessionsList');
  if (!container) {
    return;
  }

  container.innerHTML = list.map((session) => {
    let scanIcon = 'activity';
    if (session.scanType === 'Abdominal') scanIcon = 'accessibility';
    else if (session.scanType === 'Cardiac') scanIcon = 'heart';
    else if (session.scanType === 'Pelvic') scanIcon = 'bone';

    return `
    <div class="session-row active-purple">
      <div class="patient-block">
        <div class="patient-icon">
          <i data-lucide="video" aria-hidden="true"></i>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 3px;">
          <p class="patient-name" style="margin: 0; line-height: 1.2;">${session.patient}</p>
          <p class="patient-meta" style="margin: 0; line-height: 1.2;">${session.device}</p>
          <span class="id-badge" style="margin: 0; padding: 2px 6px; font-size: 0.8em;">ID: ${session.patientId}</span>
        </div>
      </div>
      <div>
        <span class="scan-tag purple">
          <i data-lucide="${scanIcon}" style="width: 1.1em; height: 1.1em; margin-right: 0.4em; vertical-align: middle; display: inline-block;"></i>
          <span>${session.scanType}</span>
        </span>
      </div>
      <div><span class="clock-inline"><i data-lucide="clock-3" aria-hidden="true"></i><span>${session.duration}</span></span></div>
      <div><span class="status-tag in-progress">● In Progress</span></div>
      <button class="join-btn" type="button" data-device-id="${session.device}">
        <i data-lucide="video"></i>
        <span>${session.actionLabel}</span>
      </button>
    </div>
  `}).join('');
}

function renderUpcomingSessions(list) {
  const container = document.getElementById('upcomingSessionsList');
  if (!container) {
    return;
  }

  container.innerHTML = list.map((session) => {
    let badgeColor = 'cyan';
    let scanIcon = 'activity';
    if (session.scanType === 'Abdominal') {
      badgeColor = 'purple';
      scanIcon = 'accessibility';
    } else if (session.scanType === 'Pelvic') {
      badgeColor = 'emerald';
      scanIcon = 'bone';
    } else if (session.scanType === 'Cardiac') {
      badgeColor = 'cyan';
      scanIcon = 'heart';
    }

    return `
    <div class="session-row upcoming-row">
      <div class="patient-block">
        <div class="patient-icon cyan">
          <i data-lucide="calendar-days" aria-hidden="true"></i>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 3px;">
          <p class="patient-name" style="margin: 0; line-height: 1.2;">${session.patient}</p>
          <p class="patient-meta" style="margin: 0; line-height: 1.2;">${session.device}</p>
          <span class="id-badge" style="margin: 0; padding: 2px 6px; font-size: 0.8em;">ID: ${session.patientId}</span>
        </div>
      </div>
      <div>
        <span class="scan-tag ${badgeColor}">
          <i data-lucide="${scanIcon}" style="width: 1.1em; height: 1.1em; margin-right: 0.4em; vertical-align: middle; display: inline-block;"></i>
          <span>${session.scanType}</span>
        </span>
      </div>
      <div>
        <p class="patient-meta center-highlight" style="display: flex; align-items: center; gap: 0.4em; margin: 0;">
          <i data-lucide="map-pin" style="width: 1.15em; height: 1.15em; color: var(--text-2); flex-shrink: 0;"></i>
          <span>${session.center}</span>
        </p>
      </div>
      <div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="display: flex; align-items: center; gap: 0.4em;">
            <i data-lucide="clock" style="width: 1.15em; height: 1.15em; color: var(--text-2); flex-shrink: 0;"></i>
            <span class="time-highlight">${session.time}</span>
          </div>
          <span style="font-size: 0.85em; color: var(--text-3); margin-left: 20px;">Today</span>
        </div>
      </div>
      <button class="view-btn upcoming-view-btn" type="button" data-device-id="${session.device}" data-session-id="${session.id}" style="display: inline-flex; align-items: center; gap: 0.5em; justify-content: center;">
        <i data-lucide="eye" style="width: 1.25em; height: 1.25em;"></i>
        <span>View Details</span>
      </button>
    </div>
  `}).join('');
}

function openSessionDetailsModal(sessionId) {
  console.log("openSessionDetailsModal called with sessionId:", sessionId);
  const allSessions = [...ADMIN_UPCOMING_SESSIONS];
  const session = allSessions.find(s => String(s.id) === String(sessionId));
  if (!session) {
    console.error("Session not found for ID:", sessionId);
    return;
  }

  const overlay = document.getElementById('sessionDetailsOverlay');
  if (!overlay) {
    console.error("sessionDetailsOverlay element not found in DOM");
    return;
  }

  // Populate patient details
  const nameEl = document.getElementById('sdPatientName');
  const idEl = document.getElementById('sdPatientId');
  const ageGenderEl = document.getElementById('sdPatientAgeGender');
  const contactEl = document.getElementById('sdPatientContact');

  if (nameEl) nameEl.textContent = session.patient || '--';
  if (idEl) idEl.textContent = session.patientId || '--';
  if (ageGenderEl) ageGenderEl.textContent = session.ageGender || '--';
  if (contactEl) contactEl.textContent = session.contact || '--';

  // Populate session info
  const scanTypeEl = document.getElementById('sdScanType');
  if (scanTypeEl) {
    scanTypeEl.textContent = session.scanType || '--';
    scanTypeEl.className = 'detail-value scan-tag';
    if (session.scanType === 'Abdominal') scanTypeEl.classList.add('purple');
    else if (session.scanType === 'Pelvic') scanTypeEl.classList.add('emerald');
    else scanTypeEl.classList.add('cyan');
  }

  const timeEl = document.getElementById('sdTime');
  const centerEl = document.getElementById('sdCenter');
  const devIdEl = document.getElementById('sdDeviceId');
  const statusEl = document.getElementById('sdStatus');

  if (timeEl) timeEl.textContent = session.time || '--';
  if (centerEl) centerEl.textContent = session.center || '--';
  if (devIdEl) devIdEl.textContent = session.device || '--';
  if (statusEl) statusEl.textContent = 'Scheduled';

  // Populate medical information
  const clinicalNotesEl = document.getElementById('sdClinicalNotes');
  const prevReportsEl = document.getElementById('sdPreviousReports');

  if (clinicalNotesEl) clinicalNotesEl.textContent = session.clinicalNotes || '--';
  if (prevReportsEl) prevReportsEl.textContent = session.previousReports || '--';

  const startBtn = document.getElementById('sessionDetailsStartBtn');
  if (startBtn) {
    startBtn.setAttribute('data-device-id', session.device || '');
  }

  overlay.hidden = false;
  document.body.classList.add('no-scroll');
}

function closeSessionDetailsModal() {
  console.log("closeSessionDetailsModal called");
  const overlay = document.getElementById('sessionDetailsOverlay');
  if (overlay) {
    overlay.hidden = true;
    document.body.classList.remove('no-scroll');
  }
}

function openConnectedDevicePage(deviceId = '') {
  const targetId = String(deviceId || selectedDeviceId || '').trim();
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  if (targetId) {
    const selectedDevice = TORUS_DEVICES.find((device) => device.id === targetId);
    if (selectedDevice) {
      localStorage.setItem('connectedDevice', JSON.stringify(selectedDevice));
      localStorage.setItem('connectedDeviceId', selectedDevice.id);
    } else {
      localStorage.setItem('connectedDeviceId', targetId);
    }
  }

  localStorage.setItem('roomId', roomId);

  const doctorUrl = `${APP_PAGES.connectedDevice}?room=${roomId}&role=doctor`;
  window.location.href = doctorUrl;
}

function setSidebarActive(target) {
  document.querySelectorAll('[data-nav-target]').forEach((item) => {
    item.classList.toggle('active', item.dataset.navTarget === target);
  });

  document.querySelectorAll('[data-section-view]').forEach((section) => {
    section.classList.toggle('active', section.dataset.sectionView === target);
  });
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

function getFilteredDevices(searchText, locationText) {
  const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const search = normalize(searchText);
  const location = normalize(locationText);

  return TORUS_DEVICES.filter((device) => {
    const searchable = normalize(`${device.id} ${device.hospital} ${device.location} ${device.city} ${device.state} ${device.country}`);
    const locationField = normalize(`${device.location} ${device.city} ${device.state} ${device.country}`);
    const matchesSearch = !search || searchable.includes(search);
    const matchesLocation = !location || locationField.includes(location);
    return matchesSearch && matchesLocation;
  });
}

function updateDeviceActionButtons() {
  const connectBtn = document.getElementById('connectDeviceBtn');
  const infoBtn = document.getElementById('deviceInfoBtn');
  const hasSelection = Boolean(selectedDeviceId);

  if (connectBtn) {
    connectBtn.disabled = !hasSelection;
    connectBtn.textContent = hasSelection ? `Connect ${selectedDeviceId}` : 'Connect Device';
  }

  if (infoBtn) {
    infoBtn.disabled = !hasSelection;
  }
}

function renderDeviceResults(list) {
  const container = document.getElementById('deviceResultsGrid');
  if (!container) {
    return;
  }

  if (!list.length) {
    container.innerHTML = '<div class="device-empty-state">No TORUS devices found for your search.</div>';
    updateDeviceActionButtons();
    return;
  }

  container.innerHTML = list.map((device) => `
    <button class="device-card ${selectedDeviceId === device.id ? 'selected' : ''}" type="button" data-device-id="${device.id}">
      <div class="device-card-top">
        <h3 class="device-id">${device.id}</h3>
        <span class="device-status ${device.status}">${device.status}</span>
      </div>
      <p class="device-hospital">${device.hospital}</p>
      <p class="device-location">${device.location}</p>
      <div class="device-metrics">
        <div class="device-metric">
          <p class="device-metric-label">Latency</p>
          <p class="device-metric-value"><i data-lucide="wifi"></i><span>${device.latency}</span></p>
        </div>
        <div class="device-metric">
          <p class="device-metric-label">Signal</p>
          <p class="device-metric-value"><i data-lucide="signal"></i><span>${device.signal}</span></p>
        </div>
      </div>
    </button>
  `).join('');

  container.querySelectorAll('.device-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedDeviceId = card.dataset.deviceId || '';
      renderDeviceResults(list);
    });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }

  updateDeviceActionButtons();
}

function openDeviceModal() {
  const modalOverlay = document.getElementById('deviceModalOverlay');
  const searchInput = document.getElementById('deviceSearchInput');
  const locationInput = document.getElementById('deviceLocationInput');
  if (!modalOverlay || !searchInput || !locationInput) {
    return;
  }

  modalOverlay.hidden = false;
  document.body.classList.add('no-scroll');
  selectedDeviceId = TORUS_DEVICES[0]?.id || '';
  searchInput.value = '';
  locationInput.value = '';
  renderDeviceResults(TORUS_DEVICES);
  searchInput.focus();
}

function closeDeviceModal() {
  const modalOverlay = document.getElementById('deviceModalOverlay');
  if (!modalOverlay) {
    return;
  }

  modalOverlay.hidden = true;
  document.body.classList.remove('no-scroll');
}

function initActivityFilters() {
  const filterButtons = Array.from(document.querySelectorAll('[data-activity-filter]'));
  const activityCards = Array.from(document.querySelectorAll('[data-activity-type]'));

  if (!filterButtons.length || !activityCards.length) {
    return;
  }

  const applyFilter = (filterValue) => {
    const normalized = String(filterValue || 'all').toLowerCase();

    filterButtons.forEach((button) => {
      button.classList.toggle('active', (button.dataset.activityFilter || 'all') === normalized);
    });

    activityCards.forEach((card) => {
      const type = (card.dataset.activityType || '').toLowerCase();
      const show = normalized === 'all' || type === normalized;
      card.style.display = show ? '' : 'none';
    });
  };

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyFilter(button.dataset.activityFilter || 'all');
    });
  });

  applyFilter('all');
}

function initHistorySearch() {
  const input = document.getElementById('historySearchInput');
  const groups = Array.from(document.querySelectorAll('[data-history-group]'));

  if (!input || !groups.length) {
    return;
  }

  const applySearch = () => {
    const query = String(input.value || '').trim().toLowerCase();

    groups.forEach((group) => {
      const cards = Array.from(group.querySelectorAll('[data-history-item]'));
      let visibleCount = 0;

      cards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        const show = !query || text.includes(query);
        card.style.display = show ? '' : 'none';
        if (show) {
          visibleCount += 1;
        }
      });

      group.style.display = visibleCount > 0 ? '' : 'none';
    });
  };

  input.addEventListener('input', applySearch);
  applySearch();
}

function renderDashboardPage() {
  const session = ensureSessionOrRedirect();
  if (!session) {
    return;
  }

  if (!session.name) {
    session.name = formatDisplayNameFromEmail(session.email);
  }
  if (!session.initials) {
    session.initials = getInitialsFromName(session.name);
  }
  if (!session.role) {
    session.role = 'doctor';
  }
  saveUserSession(session);
  renderUserIdentity(session);

  const dashboardData = getDashboardData(session.role);
  renderActiveSessions(dashboardData.activeSessions);
  renderUpcomingSessions(dashboardData.upcomingSessions);
  initHapticStatusSystem();

  const dashboardEmpty = document.getElementById('dashboardEmptyState');
  const adminPanel = document.getElementById('adminPanel');
  if (dashboardEmpty) dashboardEmpty.classList.add('hidden');
  if (adminPanel) {
    if (session.role === 'admin' && dashboardData.extraPanels.length > 0) {
      adminPanel.classList.remove('hidden');
      adminPanel.innerHTML = dashboardData.extraPanels.map((panel) => `
        <div class="placeholder-card" style="border-color:${panel.accent === 'cyan' ? 'rgba(0, 229, 255, 0.18)' : 'rgba(106, 0, 255, 0.18)'};">
          <h3 style="margin-top:0;color:#fff;font-size:16px;">${panel.title}</h3>
          <p style="margin-bottom:0;color:#9ca3af;line-height:1.6;">${panel.body}</p>
        </div>
      `).join('');
    } else {
      adminPanel.classList.add('hidden');
    }
  }

  document.querySelectorAll('[data-nav-target]').forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.dataset.navTarget;
      if (!target) {
        return;
      }

      if (target === 'dashboard') {
        window.location.href = APP_PAGES.dashboard;
        return;
      }

      setSidebarActive(target);

      if (window.innerWidth < 1024) {
        closeSidebar();
      }
    });
  });

  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener('click', () => {
      clearUserSession();
      window.location.href = APP_PAGES.login;
    });
  });

  const menuToggle = document.getElementById('menuToggle');
  const closeSidebarBtn = document.getElementById('closeSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuToggle) menuToggle.addEventListener('click', openSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  const adhocButton = document.getElementById('adhocScanBtn');
  const modalOverlay = document.getElementById('deviceModalOverlay');
  const modalClose = document.getElementById('deviceModalClose');
  const searchInput = document.getElementById('deviceSearchInput');
  const locationInput = document.getElementById('deviceLocationInput');
  const connectBtn = document.getElementById('connectDeviceBtn');
  const infoBtn = document.getElementById('deviceInfoBtn');

  if (adhocButton) {
    adhocButton.onclick = (event) => {
      if (event) {
        event.preventDefault();
      }
      openDeviceModal();
    };
  }

  if (modalClose) {
    modalClose.addEventListener('click', closeDeviceModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (event) => {
      if (event.target === modalOverlay) {
        closeDeviceModal();
      }
    });
  }

  if (searchInput && locationInput) {
    const applyDeviceFilter = () => {
      const filtered = getFilteredDevices(searchInput.value, locationInput.value);
      if (selectedDeviceId && !filtered.some((device) => device.id === selectedDeviceId)) {
        selectedDeviceId = '';
      }
      renderDeviceResults(filtered);
    };

    searchInput.addEventListener('input', applyDeviceFilter);
    locationInput.addEventListener('input', applyDeviceFilter);
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      openConnectedDevicePage(selectedDeviceId);
    });
  }

  document.querySelectorAll('.join-btn').forEach((button) => {
    button.addEventListener('click', () => {
      openConnectedDevicePage(button.getAttribute('data-device-id') || '');
    });
  });

  document.querySelectorAll('.upcoming-view-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const sessionId = button.getAttribute('data-session-id');
      console.log("Direct upcoming-view-btn click, sessionId:", sessionId);
      openSessionDetailsModal(sessionId);
    });
  });

  // Event delegation for upcoming view buttons to handle dynamic updates robustly
  document.addEventListener('click', (event) => {
    const viewBtn = event.target.closest('.upcoming-view-btn');
    if (viewBtn) {
      event.preventDefault();
      const sessionId = viewBtn.getAttribute('data-session-id');
      console.log("Delegated upcoming-view-btn click, sessionId:", sessionId);
      openSessionDetailsModal(sessionId);
    }
  });

  const sessionDetailsClose = document.getElementById('sessionDetailsClose');
  const sessionDetailsCancelBtn = document.getElementById('sessionDetailsCancelBtn');
  const sessionDetailsStartBtn = document.getElementById('sessionDetailsStartBtn');
  const sessionDetailsOverlay = document.getElementById('sessionDetailsOverlay');

  if (sessionDetailsClose) {
    sessionDetailsClose.addEventListener('click', closeSessionDetailsModal);
  }
  if (sessionDetailsCancelBtn) {
    sessionDetailsCancelBtn.addEventListener('click', closeSessionDetailsModal);
  }
  if (sessionDetailsOverlay) {
    sessionDetailsOverlay.addEventListener('click', (event) => {
      if (event.target === sessionDetailsOverlay) {
        closeSessionDetailsModal();
      }
    });
  }
  if (sessionDetailsStartBtn) {
    sessionDetailsStartBtn.addEventListener('click', () => {
      const devId = sessionDetailsStartBtn.getAttribute('data-device-id') || '';
      console.log("Starting session from details modal for device:", devId);
      closeSessionDetailsModal();
      openConnectedDevicePage(devId);
    });
  }

  if (infoBtn) {
    infoBtn.addEventListener('click', () => {
      if (!selectedDeviceId) {
        return;
      }
      const selectedDevice = TORUS_DEVICES.find((device) => device.id === selectedDeviceId);
      if (!selectedDevice) {
        return;
      }
      const details = `${selectedDevice.id} | ${selectedDevice.hospital} | ${selectedDevice.location} | Signal ${selectedDevice.signal}`;
      infoBtn.textContent = details;
      window.setTimeout(() => {
        infoBtn.textContent = 'Device Info';
      }, 2200);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDeviceModal();
      if (hapticState.activeModalType !== 'connecting') {
        closeHapticModal();
      }
    }
  });

  initActivityFilters();
  initHistorySearch();

  const pendingNavTarget = localStorage.getItem('dashboardNavTarget');
  const defaultTarget = pendingNavTarget || 'dashboard';
  setSidebarActive(defaultTarget);
  if (pendingNavTarget) {
    localStorage.removeItem('dashboardNavTarget');
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function initApp() {
  const body = document.body;
  if (body.classList.contains('biometric-page')) {
    renderBiometricPage();
  }

  if (body.classList.contains('dashboard-page')) {
    renderDashboardPage();
  }
}

document.addEventListener('DOMContentLoaded', initApp);
