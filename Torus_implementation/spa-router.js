(function () {
  console.log("SPA Router Initializing...");

  function navigateSPA(view, updateHistory = true) {
    console.log("SPA Navigating to view:", view);

    // Update browser URL query parameter 'view' without page reload
    if (updateHistory) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('view') !== view) {
        url.searchParams.set('view', view);
        window.history.pushState({ view: view }, '', url.toString());
      }
    }

    const mainContainer = document.querySelector('.app-shell.wrapper.main-container') || document.querySelector('.main-container');
    const topbar = document.querySelector('.topbar');
    const connectedDeviceMain = document.querySelector('main.page-container') || document.querySelector('.page-container');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const scanningContainer = document.getElementById('scanning-view-container');
    const reportContainer = document.getElementById('report-view-container');

    if (view === 'connected-device') {
      if (mainContainer) mainContainer.classList.remove('hidden');
      if (topbar) topbar.classList.remove('hidden');
      if (connectedDeviceMain) connectedDeviceMain.classList.remove('hidden');
      if (sidebar) sidebar.classList.remove('hidden');
      if (sidebarOverlay) sidebarOverlay.classList.remove('hidden');
      if (scanningContainer) scanningContainer.classList.add('hidden');
      if (reportContainer) reportContainer.classList.add('hidden');

      // Reset call states so the begin consultation button can be clicked again
      if (window.__resetTorusCallState) {
        window.__resetTorusCallState();
      }
    } else if (view === 'ultrasound-scanning') {
      if (mainContainer) mainContainer.classList.remove('hidden');
      if (topbar) topbar.classList.add('hidden');
      if (connectedDeviceMain) connectedDeviceMain.classList.add('hidden');
      if (sidebar) sidebar.classList.add('hidden');
      if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
      if (scanningContainer) scanningContainer.classList.remove('hidden');
      if (reportContainer) reportContainer.classList.add('hidden');

      // Start camera if the startCamera function is globally available
      if (window.startCamera) {
        window.startCamera();
      }
    } else if (view === 'report-generation') {
      if (mainContainer) mainContainer.classList.remove('hidden');
      if (topbar) topbar.classList.add('hidden');
      if (connectedDeviceMain) connectedDeviceMain.classList.add('hidden');
      if (sidebar) sidebar.classList.add('hidden');
      if (sidebarOverlay) sidebarOverlay.classList.add('hidden');
      if (scanningContainer) scanningContainer.classList.add('hidden');
      if (reportContainer) reportContainer.classList.remove('hidden');

      // Load report context if loadReportContext is globally available
      if (window.loadReportContext) {
        window.loadReportContext();
      }
    }
  }

  window.navigateSPA = navigateSPA;

  // Handle browser back/forward buttons
  window.addEventListener('popstate', (event) => {
    const view = (event.state && event.state.view) || new URLSearchParams(window.location.search).get('view') || 'connected-device';
    navigateSPA(view, false);
  });

  // Handle initial page load
  const initialView = new URLSearchParams(window.location.search).get('view') || 'connected-device';
  if (initialView !== 'connected-device') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        navigateSPA(initialView, false);
      });
    } else {
      navigateSPA(initialView, false);
    }
  }
})();
