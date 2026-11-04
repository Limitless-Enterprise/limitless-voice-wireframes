(function () {
  "use strict";

  const app = document.getElementById("app");
  const legacy = document.getElementById("legacy-root");

  function routePath() {
    return (location.hash.replace(/^#/, "") || "/overview").replace(/^\//, "").split("?")[0];
  }

  function isLedgerRoute(path) {
    if (!path || path === "overview") return true;
    if (path === "calls" || path.startsWith("calls/")) return true;
    if (path.startsWith("call/")) return true;
    if (path === "conversations" || path.startsWith("conversations/")) return true;
    return false;
  }

  function dispatch() {
    const path = routePath();
    if (isLedgerRoute(path)) {
      document.body.classList.add("ledger-mode");
      legacy.classList.add("hidden");
      app.classList.remove("hidden");
      if (window.LedgerCustomer) window.LedgerCustomer.render();
      return;
    }
    document.body.classList.remove("ledger-mode");
    app.innerHTML = "";
    app.classList.add("hidden");
    legacy.classList.remove("hidden");
    if (window.WireframeLegacy) window.WireframeLegacy.render();
  }

  window.addEventListener("hashchange", dispatch);
  dispatch();
})();
