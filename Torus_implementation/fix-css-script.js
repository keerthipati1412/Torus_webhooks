const fs = require('fs');
let code = fs.readFileSync('styles.css', 'utf8');

const modalCss = `
/* Session Details Modal Premium UI */
.session-details-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(5, 8, 22, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5em;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.session-details-modal-overlay:not([hidden]) {
  opacity: 1;
  pointer-events: auto;
}

.session-details-modal {
  width: 100%;
  max-width: 850px;
  background: rgba(15, 17, 26, 0.95);
  border: 1px solid rgba(106, 0, 255, 0.3);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(106, 0, 255, 0.15) inset;
  display: flex;
  flex-direction: column;
  transform: translateY(20px) scale(0.98);
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}

.session-details-modal-overlay:not([hidden]) .session-details-modal {
  transform: translateY(0) scale(1);
}

.session-modal-header {
  padding: 1.5em 2em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, rgba(106, 0, 255, 0.1), transparent);
}

.session-modal-title {
  margin: 0;
  font-size: 1.5em;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}

.session-modal-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.5em;
  border-radius: 8px;
  transition: all 0.2s ease;
  display: grid;
  place-items: center;
}

.session-modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.session-modal-body {
  padding: 2em;
  overflow-y: auto;
  max-height: calc(100vh - 12em);
}

.session-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5em;
}

.session-detail-section {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 1.5em;
}

.session-detail-section.full-width {
  grid-column: 1 / -1;
}

.session-detail-section h3 {
  margin: 0 0 1.25em 0;
  font-size: 1.1em;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding-bottom: 0.75em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.session-detail-section h3 i {
  color: #00E5FF;
  width: 1.2em;
  height: 1.2em;
}

.session-detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  margin-bottom: 1em;
}

.session-detail-item:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-size: 0.85em;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.detail-value {
  font-size: 1.1em;
  color: #f8fafc;
  font-weight: 500;
  line-height: 1.4;
}

.session-modal-footer {
  padding: 1.5em 2em;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 1em;
  background: rgba(0, 0, 0, 0.2);
}
`;

if (!code.includes('.session-details-modal-overlay')) {
  code += '\\n' + modalCss;
  fs.writeFileSync('styles.css', code, 'utf8');
  console.log("Appended modal CSS");
} else {
  console.log("Modal CSS already exists");
}
