/* PDF-aligned Limitless Voice Agents shell (V2 slice) */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function voiceTabs(active) {
    const tabs = [
      ["overview", "Overview"],
      ["calls", "Calls"],
      ["analytics", "Analytics"],
      ["agent", "Agent setup"],
    ];
    return `<div class="wf-tabs">${tabs
      .map(
        ([id, label]) =>
          `<button type="button" class="wf-tab ${active === id ? "active" : ""}" data-tab="${id}">${label}</button>`
      )
      .join("")}</div>`;
  }

  function reportingWindow(activeRange) {
    const ranges = [
      ["7d", "7d"],
      ["30d", "30d"],
      ["90d", "90d"],
      ["all", "All time"],
    ];
    return `<div class="wf-reporting">
      <span class="wf-reporting-label">Reporting window</span>
      ${ranges
        .map(
          ([id, label]) =>
            `<button type="button" class="wf-range ${activeRange === id ? "active" : ""}" data-range="${id}">${label}</button>`
        )
        .join("")}
    </div>`;
  }

  function internalSubnav(active) {
    const items = [
      ["internal-1", "Customer registry"],
      ["internal-2", "Routing editor"],
      ["internal-3", "Tool-call diagnostics"],
    ];
    return `<div class="wf-internal-nav">${items
      .map(
        ([id, label]) =>
          `<button type="button" class="wf-internal-tab ${active === id ? "active" : ""}" data-go="${id}">${label}</button>`
      )
      .join("")}</div>`;
  }

  function topChrome() {
    return `<header class="wf-top">
      <div class="wf-logo">LIMITLESS</div>
      <div class="wf-search">Search</div>
      <span class="wf-badge">workspace</span>
      <a class="wf-link" href="#">Manage Workspace →</a>
      <span class="wf-site">Testing Site</span>
    </header>`;
  }

  /**
   * @param {object} o
   * @param {string} o.eyebrow
   * @param {string} o.title
   * @param {string} [o.subtitle]
   * @param {string} [o.activeTab] overview|calls|analytics|agent
   * @param {string} [o.activeRange]
   * @param {string} [o.sourceLine]
   * @param {boolean} [o.showVoiceTabs]
   * @param {boolean} [o.showReporting]
   * @param {string} [o.internalScreen] internal-1|internal-2|internal-3
   * @param {string} o.body
   */
  function renderVoicePage(o) {
    const showVoiceTabs = o.showVoiceTabs !== false && !o.internalScreen;
    const showReporting = o.showReporting !== false && showVoiceTabs && !o.internalScreen;
    return `${topChrome()}
      <div class="wf-page-head">
        <div class="wf-eyebrow">${escapeHtml(o.eyebrow)}</div>
        <h1 class="wf-title">${escapeHtml(o.title)}</h1>
        ${o.subtitle ? `<p class="wf-subtitle">${escapeHtml(o.subtitle)}</p>` : ""}
        ${o.internalScreen ? internalSubnav(o.internalScreen) : ""}
        ${showVoiceTabs ? voiceTabs(o.activeTab || "overview") : ""}
        ${showReporting ? reportingWindow(o.activeRange || "30d") : ""}
        ${o.sourceLine ? `<p class="wf-source">${escapeHtml(o.sourceLine)}</p>` : ""}
      </div>
      <div class="wf-page-body">${o.body}</div>`;
  }

  function metricCard(label, value, hint) {
    return `<div class="wf-metric">
      <div class="wf-metric-label">${escapeHtml(label)}</div>
      <div class="wf-metric-value">${escapeHtml(String(value))}</div>
      <div class="wf-metric-hint">${escapeHtml(hint)}</div>
    </div>`;
  }

  function metricRow(cards) {
    return `<div class="wf-metrics">${cards.join("")}</div>`;
  }

  global.PdfShell = {
    renderVoicePage,
    metricCard,
    metricRow,
    escapeHtml,
  };
})(window);
