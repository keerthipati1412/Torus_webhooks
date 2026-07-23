const fs = require('fs');
let code = fs.readFileSync('script.js', 'utf8');

const regex = /function openSessionDetailsModal\(sessionId\) \{[\s\S]*?\}\n\nfunction closeSessionDetailsModal\(\) \{[\s\S]*?\}[\s\S]*?overlay\.hidden = false;\s*document\.body\.classList\.add\('no-scroll'\);\s*\}/m;

// If it's messed up, we just find the whole block from "function openSessionDetailsModal" to the next function declaration (like "function openConnectedDevicePage")
const openIdx = code.indexOf('function openSessionDetailsModal');
const nextIdx = code.indexOf('function openConnectedDevicePage');

if (openIdx !== -1 && nextIdx !== -1) {
  const correctBlock = `function openSessionDetailsModal(sessionId) {
  console.log("openSessionDetailsModal called with sessionId:", sessionId);
  const allSessions = [...ADMIN_UPCOMING_SESSIONS];
  const session = allSessions.find(s => String(s.id) === String(sessionId));
  if (!session) {
    console.error("Session not found:", sessionId);
    return;
  }

  const overlay = document.getElementById('sessionDetailsOverlay');
  if (!overlay) {
    console.error("sessionDetailsOverlay not found in DOM");
    return;
  }

  // Populate data
  document.getElementById('sdPatientName').textContent = session.patient || '--';
  document.getElementById('sdPatientId').textContent = session.patientId || '--';
  document.getElementById('sdPatientAgeGender').textContent = session.ageGender || '--';
  document.getElementById('sdPatientContact').textContent = session.contact || '--';
  document.getElementById('sdScanType').textContent = session.scanType || '--';

  // Set badge color dynamically
  const scanTypeEl = document.getElementById('sdScanType');
  if (scanTypeEl) {
    scanTypeEl.className = 'detail-value scan-tag';
    if (session.scanType === 'Abdominal') scanTypeEl.classList.add('purple');
    else if (session.scanType === 'Pelvic') scanTypeEl.classList.add('emerald');
    else scanTypeEl.classList.add('cyan');
  }

  const timeEl = document.getElementById('sdTime');
  if (timeEl) timeEl.textContent = session.time || '--';
  
  const centerEl = document.getElementById('sdCenter');
  if (centerEl) centerEl.textContent = session.center || '--';
  
  const devIdEl = document.getElementById('sdDeviceId');
  if (devIdEl) devIdEl.textContent = session.device || '--';
  
  const notesEl = document.getElementById('sdClinicalNotes');
  if (notesEl) notesEl.textContent = session.clinicalNotes || '--';
  
  const prevEl = document.getElementById('sdPreviousReports');
  if (prevEl) prevEl.textContent = session.previousReports || '--';

  const startBtn = document.getElementById('sessionDetailsStartBtn');
  if (startBtn) {
    startBtn.setAttribute('data-device-id', session.device || '');
  }

  overlay.hidden = false;
  document.body.classList.add('no-scroll');
}

function closeSessionDetailsModal() {
  const overlay = document.getElementById('sessionDetailsOverlay');
  if (overlay) {
    overlay.hidden = true;
    document.body.classList.remove('no-scroll');
  }
}

`;
  
  code = code.substring(0, openIdx) + correctBlock + code.substring(nextIdx);
  fs.writeFileSync('script.js', code, 'utf8');
  console.log("Fixed openSessionDetailsModal and closeSessionDetailsModal");
}

const delegationRegex = /document\.querySelectorAll\('\.upcoming-view-btn'\)\.forEach\(\(button\) => \{[\s\S]*?\}\);\s*\n/;
const delegationFix = `document.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.upcoming-view-btn');
    if (viewBtn) {
      console.log("Delegated View button clicked!", viewBtn.getAttribute('data-session-id'));
      openSessionDetailsModal(viewBtn.getAttribute('data-session-id'));
    }
  });
  
`;

if (code.includes("document.querySelectorAll('.upcoming-view-btn')")) {
  code = code.replace(delegationRegex, delegationFix);
  fs.writeFileSync('script.js', code, 'utf8');
  console.log("Fixed delegation");
}
