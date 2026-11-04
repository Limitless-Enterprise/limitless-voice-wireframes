/* 01 · Ledger — Voice Agents dashboard + control plane (static prototype). */
(function () {
  "use strict";
  const D = window.VOICE_DATA;
  const app = document.getElementById("app");
  if (!D) { app.innerHTML = "<p style='padding:40px'>Missing ../shared/data.js</p>"; return; }

  // Snapshot "now": the data was fetched 2026-11-02. Windows are measured back from end of that day (Chicago).
  const NOW = Date.parse("2026-11-02T23:59:00-06:00") / 1000;
  const TZ = "America/Chicago";
  const DAY = 86400;

  const PB = D.customers.find((c) => c.customer_id === "purple-basil-medspa");
  const agentById = Object.fromEntries(D.agents.map((a) => [a.agent_id, a]));
  const MIA = D.agents.find((a) => a.customer_id === PB.customer_id);
  const MIA_CONVS = (D.conversations[MIA.agent_id] || []).slice().sort((a, b) => b.start_time_unix_secs - a.start_time_unix_secs);

  const state = { range: "30d", env: "production", failuresOnly: false, convFilter: "all", q: "", view: "all", intents: [], channels: [], tasks: {}, costSort: "date", tenant: PB.customer_id, conv: null, evt: null };

  /* ───────── helpers ───────── */
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmt = (u, o) => new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: TZ }, o)).format(new Date(u * 1000));
  const fDate = (u) => fmt(u, { month: "short", day: "numeric" });
  const fTime = (u) => fmt(u, { hour: "numeric", minute: "2-digit" });
  const fDateTime = (u) => `${fDate(u)} · ${fTime(u)}`;
  const fFull = (u) => fmt(u, { month: "short", day: "numeric", year: "numeric" });
  const fIso = (u) => new Date(u * 1000).toISOString().replace(".000", "");
  const dur = (s) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  const ago = (u) => { const d = Math.floor((NOW - u) / DAY); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`; };
  const short = (id, n) => (id && id.length > (n || 18) ? id.slice(0, n || 18) + "…" : id);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  /* cost helpers — provider usage (ElevenLabs), never an invoice */
  const cost = (c) => (c.cost && c.cost.cost_fiat) || 0;
  const usd = (v) => (v == null ? "—" : v === 0 ? "$0" : v >= 0.995 ? "$" + v.toFixed(2) : v >= 0.1 ? "$" + v.toFixed(3) : "$" + v.toFixed(4));
  const usdT = (v) => (v >= 0.1 ? "$" + v.toFixed(2) : "$" + v.toFixed(4));
  const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
  const voiceMin = (c) => (c.cost && c.cost.platform_categories.voice ? c.cost.platform_categories.voice.quantity : 0);
  const textMsgs = (c) => (c.cost && c.cost.platform_categories.text_message ? c.cost.platform_categories.text_message.quantity : 0);
  const tokens = (c) => { const t = (c.cost && c.cost.llm_tokens) || {}; return Object.values(t).reduce((a, x) => ({ input: a.input + (x.input || 0), output: a.output + (x.output || 0) }), { input: 0, output: 0 }); };
  const billedLabel = (c) => (c.cost && c.cost.text_only ? `${textMsgs(c)} text message${textMsgs(c) === 1 ? "" : "s"}` : `${voiceMin(c).toFixed(2)} voice min`);
  const COST_NOTE = "Provider usage cost (ElevenLabs), not an invoice. Excludes Limitless markup, Twilio telephony, Convex and Twenty costs.";
  const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));
  const initials = (s) => (s || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const RANGES = { "7d": 7, "30d": 30, "90d": 90, all: null };
  const inRange = (c, r) => { const d = RANGES[r || state.range]; return d == null || NOW - c.start_time_unix_secs <= d * DAY; };
  const prevRange = (c) => { const d = RANGES[state.range]; if (d == null) return false; const age = NOW - c.start_time_unix_secs; return age > d * DAY && age <= 2 * d * DAY; };

  const callerTurns = (c) => (c.transcript || []).filter((t) => t.role === "user" && t.message).length;
  const hasTool = (c, t) => (c.tool_names || []).includes(t);
  const callerName = (c) => (c.data_collection && c.data_collection.contact_name) || null;

  function termination(c) {
    const r = c.termination_reason || "";
    if (/end_call/.test(r)) return { label: "Agent ended the call", code: "end_call" };
    if (/maximum duration/i.test(r)) return { label: "Reached maximum call duration", code: "max_duration" };
    const m = r.match(/Client disconnected: (\d+)/);
    if (m) return { label: "Caller disconnected", code: "ws " + m[1] };
    return { label: r || "Not recorded", code: "" };
  }

  function outcome(c) {
    if (c.lead_captured) return { cls: "ok", label: "Lead captured" };
    if (callerTurns(c) === 0) return { cls: "muted", label: "No caller response" };
    if (c.data_collection && c.data_collection.service_interest) return { cls: "plain", label: "Interest noted" };
    return { cls: "muted", label: "Info only" };
  }

  const ICON = {
    briefing: '<path d="M3 4h10M3 8h10M3 12h6"/>',
    chat: '<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11h.5"/>',
    goals: '<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="2"/>',
    crm: '<circle cx="6" cy="6" r="2.2"/><path d="M2.5 13c.5-2.2 2-3.4 3.5-3.4S9 10.8 9.5 13M10.5 4.5h3M10.5 7.5h3"/>',
    library: '<path d="M3 3h3v10H3zM7 3h3v10H7zM11 4l2.2-.6 2 9.4-2.2.6z"/>',
    relations: '<circle cx="4.5" cy="8" r="2"/><circle cx="11.5" cy="4.5" r="2"/><circle cx="11.5" cy="11.5" r="2"/><path d="M6.3 7.1l3.4-1.7M6.3 8.9l3.4 1.7"/>',
    agents: '<rect x="3" y="4" width="10" height="8" rx="2"/><path d="M6 8h.01M10 8h.01M8 2v2"/>',
    voice: '<path d="M3 7v2M5.5 5v6M8 3v10M10.5 5v6M13 7v2"/>',
    skills: '<path d="M8 2l1.6 3.6L13.5 6l-2.9 2.6.8 3.9L8 10.6l-3.4 1.9.8-3.9L2.5 6l3.9-.4z"/>',
    memories: '<path d="M4 3h8v10l-4-2.5L4 13z"/>',
    rubrics: '<path d="M3 4l1.2 1.2L6.5 3M3 9l1.2 1.2L6.5 8M8.5 4.5H13M8.5 9.5H13"/>',
    tools: '<path d="M10.5 2.5a3 3 0 0 0-3 4L3 11l2 2 4.5-4.5a3 3 0 0 0 4-3l-1.8 1.3-1.7-.5-.5-1.7z"/>',
    systems: '<rect x="2.5" y="3" width="11" height="4" rx="1"/><rect x="2.5" y="9" width="11" height="4" rx="1"/><path d="M5 5h.01M5 11h.01"/>',
    search: '<circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
    fleet: '<rect x="2.5" y="3" width="4.5" height="4.5" rx="1"/><rect x="9" y="3" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
    tenant: '<path d="M3 13V5l5-2.5L13 5v8M6 13v-3h4v3"/>',
    diag: '<path d="M2 8h3l1.5-4 3 8L11 8h3"/>',
    arrow: '<path d="M4 8h8M9 5l3 3-3 3"/>',
    chev: '<path d="M6 4l4 4-4 4"/>',
    check: '<path d="M4 8.5l2.5 2.5L12 5.5"/>',
  };
  const ic = (n, s, extra) => `<svg width="${s || 16}" height="${s || 16}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ${extra || ""}>${ICON[n]}</svg>`;
  const checkIc = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICON.check}</svg>`;

  /* ───────── charts (hand-drawn SVG) ───────── */
  function buckets(convs, days, n) {
    const size = (days * DAY) / n, out = new Array(n).fill(0);
    convs.forEach((c) => { const age = NOW - c.start_time_unix_secs; const i = n - 1 - Math.floor(age / size); if (i >= 0 && i < n) out[i]++; });
    return out;
  }
  function barSpark(vals, w, h, opts) {
    opts = opts || {};
    const max = Math.max(1, ...vals), gap = 2, bw = (w - gap * (vals.length - 1)) / vals.length;
    const bars = vals.map((v, i) => {
      const bh = v ? Math.max(3, (v / max) * (h - 2)) : 1.5;
      return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${v ? opts.color || "#17160f" : "#e3e0d8"}"/>`;
    }).join("");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}</svg>`;
  }
  function lineSpark(vals, w, h, color) {
    const max = Math.max(1, ...vals), step = w / (vals.length - 1 || 1);
    const pts = vals.map((v, i) => [i * step, h - 2 - (v / max) * (h - 5)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const last = pts[pts.length - 1];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h}Z" fill="${color}" opacity="0.08"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"/></svg>`;
  }

  /* ───────── shell ───────── */
  const NAV = {
    OPERATE: [["briefing", "Briefing"], ["chat", "Chat"], ["goals", "Goals"], ["crm", "CRM"], ["library", "Library"], ["relations", "Relations & Channels"]],
    CONFIGURE: [["agents", "Agents"], ["voice", "Voice Agents"], ["skills", "Skills"], ["memories", "Memories"], ["rubrics", "Rubrics"], ["tools", "Tools"], ["systems", "Systems"]],
  };
  function sidebar(screen, internal, rail) {
    const sub = internal
      ? `<div class="nav-sub">
          <a class="nav-item ${screen === "fleet" ? "active" : ""}" href="#/fleet">Fleet registry</a>
          <a class="nav-item ${screen === "tenant" ? "active" : ""}" href="#/tenant">Tenant &amp; agent</a>
          <a class="nav-item ${screen === "diagnostics" ? "active" : ""}" href="#/diagnostics">Tool-call diagnostics</a>
        </div>`
      : `<div class="nav-sub">
          <a class="nav-item ${screen === "overview" ? "active" : ""}" href="#/overview">Overview</a>
          <a class="nav-item ${screen === "conversations" ? "active" : ""}" href="#/conversations">Conversations</a>
          <a class="nav-item" href="javascript:void 0" title="Not part of this review">Analytics</a>
          <a class="nav-item" href="javascript:void 0" title="Not part of this review">Agent setup</a>
        </div>`;
    const sec = (name) => `<div class="nav-sec">${name}</div>` + NAV[name].map(([k, l]) =>
      `<a class="nav-item ${k === "voice" ? "active" : ""}" title="${l}" href="${k === "voice" ? (internal ? "#/fleet" : "#/overview") : "javascript:void 0"}">${ic(k)}<span>${l}</span>${k === "voice" && internal ? `<span class="tag">ADMIN</span>` : ""}</a>${k === "voice" ? sub : ""}`).join("");
    const profile = internal
      ? `<div class="avatar">DB</div><div><div class="who">Debraj</div><div class="role">${esc(D.operator)}</div></div>`
      : `<div class="avatar">PB</div><div><div class="who">Purple Basil Medspa</div><div class="role">Workspace owner</div></div>`;
    return `<aside class="sidebar ${rail ? "rail" : ""}">
      <div class="brand"><div class="brand-mark"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 1.5v9h8" stroke="#fff" stroke-width="2" fill="none"/></svg></div><span class="brand-word">LIMITLESS</span></div>
      <div class="ws-switch"><div><span class="lbl">Workspace</span><strong>${esc(D.workspace)}</strong></div>${ic("chev", 14, 'style="transform:rotate(90deg);color:#9b978d"')}</div>
      ${sec("OPERATE")}${sec("CONFIGURE")}
      <div class="spacer"></div>
      <div class="nav-sec" style="padding-top:0">PROFILE</div>
      <div class="profile">${profile}</div>
    </aside>`;
  }
  function topbar(crumbs) {
    return `<div class="topbar"><div class="crumbs">${crumbs.map((c, i) => (i === crumbs.length - 1 ? `<b>${esc(c)}</b>` : `<span>${esc(c)}</span><i>/</i>`)).join("")}</div>
      <div class="search">${ic("search", 14)}<span>Search</span><kbd>⌘K</kbd></div>
      <a class="toplink" href="javascript:void 0">Manage workspace →</a></div>`;
  }
  function frame(screen, internal, crumbs, page, fill, fluid) {
    document.documentElement.classList.toggle("internal", internal);
    const banner = internal
      ? `<div class="banner"><div class="l"><span class="stripe"></span>INTERNAL · CONTROL PLANE · ADMIN ACCESS ONLY</div><div class="r"><span>${state.env === "production" ? "Production" : "Test"} environment</span><span>Signed in as ${esc(D.operator)}</span></div></div>`
      : "";
    return `${banner}<div class="shell">${sidebar(screen, internal)}<main class="main">${topbar(crumbs)}<div class="page ${fill ? "fill" : ""} ${fluid ? "fluid" : ""}">${page}</div></main></div>`;
  }

  function head(o) {
    return `<div class="head"><div><div class="eyebrow">${o.eyebrow}</div><h1>${esc(o.title)}</h1>${o.subtitle ? `<p class="subtitle">${o.subtitle}</p>` : ""}</div>${o.actions ? `<div class="head-actions">${o.actions}</div>` : ""}</div>`;
  }
  function customerControls(active) {
    const tabs = [["overview", "Overview"], ["conversations", "Conversations", MIA_CONVS.filter((c) => inRange(c)).length], ["analytics", "Analytics"], ["setup", "Agent setup"]];
    const ranges = [["7d", "7d"], ["30d", "30d"], ["90d", "90d"], ["all", "All"]];
    return `<div class="controls">
      <div class="tabs">${tabs.map(([k, l, n]) => `<button class="tab ${k === active ? "active" : ""}" ${k === "overview" || k === "conversations" ? `data-href="#/${k}"` : 'title="Not part of this review"'}>${l}${n != null ? `<span class="count">${n}</span>` : ""}</button>`).join("")}</div>
      <div class="segment"><span class="label">Reporting window</span><div class="seg">${ranges.map(([k, l]) => `<button class="${state.range === k ? "active" : ""}" data-range="${k}">${l}</button>`).join("")}</div></div>
    </div>`;
  }
  function sourceLine(convs) {
    if (!convs.length) return `<p class="source">No calls in this window · Purple Basil Medspa</p>`;
    const t = convs.map((c) => c.start_time_unix_secs);
    return `<p class="source"><span class="dot"></span>${convs.length} call${convs.length === 1 ? "" : "s"} from ElevenAgents · Mia · ${fDate(Math.min(...t))} – ${fDate(Math.max(...t))} · Snapshot ${fFull(NOW)} · Times in ${TZ.replace("_", " ")}</p>`;
  }

  /* ───────── 1. Overview ───────── */
  function overview() {
    const convs = MIA_CONVS.filter((c) => inRange(c));
    const prev = MIA_CONVS.filter(prevRange);
    const n = convs.length;
    const leads = convs.filter((c) => c.lead_captured).length;
    const success = convs.filter((c) => c.call_successful === "success").length;
    const scored = convs.filter((c) => c.call_successful).length;
    const days = RANGES[state.range] || Math.ceil((NOW - Math.min(...MIA_CONVS.map((c) => c.start_time_unix_secs))) / DAY) + 1;
    const nb = days <= 7 ? 7 : days <= 30 ? 15 : 26;
    const series = buckets(convs, days, nb);
    const leadSeries = buckets(convs.filter((c) => c.lead_captured), days, nb);
    const rangeWord = state.range === "all" ? "all time" : `the last ${RANGES[state.range]} days`;
    const prevTxt = state.range === "all" ? "Since first loaded call" : `${prev.length} in prior ${RANGES[state.range]}d`;

    const dots = (arr, on) => `<div class="ledger-dots">${arr.map((c) => `<i class="${on(c) ? "on" : ""}" title="${esc(c.title)}"></i>`).join("")}</div>`;
    const kpis = `<div class="grid g-kpi">
      <div class="card kpi"><div class="kpi-label">Answered calls</div><div class="kpi-value">${n}</div><div class="kpi-hint">${prevTxt}</div><div class="kpi-viz">${barSpark(series, 232, 30)}</div></div>
      <div class="card kpi"><div class="kpi-label">Captured leads <span class="chip ok" style="height:20px">${pct(leads, n)}%</span></div><div class="kpi-value">${leads}<small>of ${n} calls</small></div><div class="kpi-hint">Name plus phone or email collected</div><div class="kpi-viz">${dots(convs.slice().reverse(), (c) => c.lead_captured)}</div></div>
      <div class="card kpi"><div class="kpi-label">Successful calls</div><div class="kpi-value">${success}<small>of ${scored} scored</small></div><div class="kpi-hint">Provider call-success evaluation</div><div class="kpi-viz">${dots(convs.slice().reverse(), (c) => c.call_successful === "success")}</div></div>
      <div class="card kpi"><div class="kpi-label">Confirmed bookings <span class="chip warn" style="height:20px">Not verified</span></div><div class="kpi-value empty">—</div><div class="kpi-hint">Mia captures booking requests only. No CRM or calendar confirmation is connected, so bookings are not counted.</div></div>
    </div>`;

    const recent = convs.slice(0, 6).map((c) => {
      const o = outcome(c);
      return `<tr class="click" data-href="#/conversations/${c.id}"><td class="num" style="width:118px;color:var(--muted)">${fDate(c.start_time_unix_secs)}<span class="sub">${fTime(c.start_time_unix_secs)}</span></td>
        <td><span class="t-title">${esc(c.title)}</span><span class="sub">${callerName(c) ? esc(callerName(c)) : "Anonymous caller"} · Web widget</span></td>
        <td class="num r" style="color:var(--muted)">${dur(c.duration_secs)}</td>
        <td class="r"><span class="chip ${o.cls}">${o.label}</span></td></tr>`;
    }).join("");

    const engaged = convs.filter((c) => callerTurns(c) > 0).length;
    const interest = convs.filter((c) => c.data_collection && c.data_collection.service_interest).length;
    const review = convs.filter((c) => hasTool(c, "request_human_review")).length;
    const frow = (lab, v, cls) => `<div class="f-row"><span class="lab">${lab}</span><div class="f-track"><div class="f-bar ${cls || ""}" style="width:${n ? Math.max(v ? 2 : 0, pct(v, n)) : 0}%"></div></div><span class="val">${v}<small>${pct(v, n)}%</small></span></div>`;
    const funnel = `<div class="funnel">
      ${frow("Answered", n)}
      ${frow("Caller engaged", engaged, "soft")}
      ${frow("Service interest named", interest, "soft")}
      ${frow("Contact captured", leads, "accent")}
      ${frow("Human review requested", review, "accent")}
      <div class="f-row"><span class="lab" style="color:var(--muted)">Confirmed booking</span><div class="f-track hatch"></div><span class="val" style="color:var(--faint);font-weight:500;font-size:11.5px">Not verified</span></div>
    </div>`;

    const fus = MIA_CONVS.filter((c) => c.lead_captured).sort((a, b) => (a.data_collection.urgency === "high" ? -1 : 0) - (b.data_collection.urgency === "high" ? -1 : 0) || b.start_time_unix_secs - a.start_time_unix_secs);
    const fuRows = fus.map((c) => {
      const dc = c.data_collection, u = dc.urgency;
      const uChip = u === "high" ? `<span class="chip warn">High urgency</span>` : u ? `<span class="chip muted">${u[0].toUpperCase() + u.slice(1)} urgency</span>` : `<span class="chip muted">Urgency not set</span>`;
      const hChip = hasTool(c, "request_human_review") ? `<span class="chip plain">Review requested</span>` : `<span class="chip warn">No handoff sent</span>`;
      const reach = [dc.phone ? "phone" : null, dc.email ? "email" : null].filter(Boolean).join(" + ");
      return `<div class="fu"><div class="avatar">${initials(dc.contact_name)}</div>
        <div style="min-width:0"><div class="name">${esc(dc.contact_name)} <span style="font-weight:400;color:var(--faint);font-size:12px">· ${fDate(c.start_time_unix_secs)}, ${ago(c.start_time_unix_secs)}</span></div><div class="ctx">${esc((dc.service_interest || c.title).replace(/^./, (m) => m.toUpperCase()))} · reach by ${reach}</div><div class="chips">${uChip}${hChip}</div></div>
        <a class="btn sm" href="#/conversations/${c.id}">Open call</a></div>`;
    }).join("");

    const main = MIA.branches.find((b) => b.traffic_pct === 100) || MIA.branches[0];
    const lastCall = MIA_CONVS[0];
    const agentCard = `<div class="card" style="grid-area:agent"><div class="card-head"><h3>Agent status</h3><span class="chip ok">Ready</span></div>
      <div class="card-body">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">
          <div class="avatar" style="width:40px;height:40px;background:var(--ink);color:#fff;border:0;font-size:14px">M</div>
          <div><div style="font-weight:650;font-size:14.5px">${esc(MIA.display_name)} · Voice receptionist</div><div style="font-size:12px;color:var(--muted)">Answering on your website widget</div></div>
        </div>
        <dl class="kv">
          <dt>Channels</dt><dd>Web widget <span style="color:var(--faint)">· no phone line</span></dd>
          <dt>Last call</dt><dd class="num">${fDateTime(lastCall.start_time_unix_secs)} <span style="color:var(--faint)">· ${ago(lastCall.start_time_unix_secs)}</span></dd>
          <dt>Live version</dt><dd class="num">Updated ${fDate(main.last_committed_at)}</dd>
          <dt>Knowledge</dt><dd>${MIA.knowledge_base.length} documents · services, policies, FAQs</dd>
          <dt>Human handoff</dt><dd>${esc(PB.notify_emails.join(", "))}</dd>
        </dl>
        <div class="act14"><div class="k"><span>Calls · last 14 days</span><span class="num">${buckets(MIA_CONVS, 14, 14).reduce((a, b) => a + b, 0)} calls</span></div>${barSpark(buckets(MIA_CONVS, 14, 14), 420, 28).replace("<svg", "<svg preserveAspectRatio=\"none\"")}<div class="axis"><span>${fDate(NOW - 13 * DAY)}</span><span>${fDate(NOW)}</span></div></div>
      </div>
      <div class="card-foot"><span>Managed by the Limitless setup team</span><a class="link" href="javascript:void 0">Request changes ${ic("arrow", 13)}</a></div></div>`;

    const total = sum(convs, cost);
    const costDays = Math.min(days, 90);
    const daily = (() => { const out = new Array(costDays).fill(0); convs.forEach((c) => { const i = costDays - 1 - Math.floor((NOW - c.start_time_unix_secs) / DAY); if (i >= 0) out[i] += cost(c); }); return out; })();
    const prevTotal = sum(prev, cost);
    const vMin = sum(convs, voiceMin), tMsg = sum(convs, textMsgs);
    const usage = `<div class="card usage" style="grid-area:usage">
      <div class="usage-head"><h3>Usage cost</h3><span class="chip plain">Provider usage · ElevenLabs</span><span class="meta" style="margin-left:auto">${rangeWord.replace(/^the l/, "L")}</span></div>
      <div class="usage-body">
        <div class="ustat"><div class="k">Total</div><div class="v">${usdT(total)}</div><div class="s">${state.range === "all" ? "since first loaded call" : `${usdT(prevTotal)} prior ${RANGES[state.range]}d`}</div></div>
        <div class="ustat"><div class="k">Calls</div><div class="v">${n}</div><div class="s">${vMin.toFixed(1)} voice min · ${tMsg} text msgs</div></div>
        <div class="ustat"><div class="k">Avg per call</div><div class="v">${n ? usd(total / n) : "—"}</div><div class="s">${n ? `range ${usd(Math.min(...convs.map(cost)))}–${usd(Math.max(...convs.map(cost)))}` : "no calls"}</div></div>
        <div class="ustat"><div class="k">Per captured lead</div><div class="v">${leads ? usdT(total / leads) : "—"}</div><div class="s">${leads ? `all ${n} calls ÷ ${leads} leads` : "no leads in window"}</div></div>
        <div class="uchart"><div class="k"><span>Daily cost</span><span>max ${usd(Math.max(...daily))}</span></div>${barSpark(daily, 300, 44, { color: "#1f6f4a" })}<div class="axis"><span>${fDate(NOW - (costDays - 1) * DAY)}</span><span>${fDate(NOW)}</span></div></div>
      </div>
      <div class="card-foot"><span>${COST_NOTE}</span></div></div>`;

    const body = `<div class="ov-grid">
      <div style="grid-area:kpi">${kpis}</div>
      ${usage}
      <div class="card" style="grid-area:recent"><div class="card-head"><h3>Recent conversations</h3><a class="link" href="#/conversations">View all ${n} ${ic("arrow", 13)}</a></div>
        <table><tbody>${recent || `<tr><td style="color:var(--muted)">No calls in ${rangeWord}.</td></tr>`}</tbody></table></div>
      <div class="card" style="grid-area:outcome"><div class="card-head"><h3>Outcome snapshot</h3><span class="meta">${n} calls · ${rangeWord}</span></div><div class="card-body" style="padding-top:20px">${funnel}</div>
        <div class="card-foot"><span>Bars are share of answered calls.</span></div></div>
      <div class="card" style="grid-area:follow"><div class="card-head"><h3>Follow-ups needing a human</h3><span class="meta">${fus.length} open</span></div>${fuRows}
        <div class="card-foot"><span>Calls with contact details, high urgency first. Not limited by the reporting window.</span></div></div>
      ${agentCard}
      </div>
      <div class="footnote"><b>About this sample</b><span>Figures reflect only the ${MIA_CONVS.length} calls loaded from the provider snapshot (${n} in ${rangeWord}). The ${leads}/${n} capture result is not a forecast or a verified booking-conversion rate. Unscored evaluations are shown as “Not measured”, not as failures.</span></div>`;

    const ranges = [["7d", "7d"], ["30d", "30d"], ["90d", "90d"], ["all", "All"]];
    const t = convs.map((c) => c.start_time_unix_secs);
    const src = convs.length ? `${n} call${n === 1 ? "" : "s"} from ElevenAgents · ${fDate(Math.min(...t))} – ${fDate(Math.max(...t))} · Snapshot ${fFull(NOW)} · Times in ${TZ}` : `No calls in ${rangeWord} · Snapshot ${fFull(NOW)}`;
    const ohead = `<div class="ohead">
      <div class="ot"><div class="l1"><h1>Overview</h1><span class="who"><span class="dot ok"></span>Mia · Purple Basil Medspa</span></div><div class="src">${src}</div></div>
      <div class="oa"><div class="segment"><span class="label">Window</span><div class="seg">${ranges.map(([k, l]) => `<button class="${state.range === k ? "active" : ""}" data-range="${k}">${l}</button>`).join("")}</div></div>
        <a class="btn" href="#/conversations">Review conversations</a><a class="btn primary" href="#/conversations/${fus[0] ? fus[0].id : ""}">Open top follow-up</a></div>
    </div>`;
    return frame("overview", false, ["Configure", "Voice Agents", "Overview"], ohead + body, false, true);
  }

  /* ───────── 2. Conversations ───────── */
  function summaryOf(c) {
    const dc = c.data_collection || {}, s = [];
    const turns = callerTurns(c);
    if (!turns) return "Mia greeted the caller, but the caller did not speak before the session ended.";
    const si = dc.service_interest && (/^(Brazilian|LHR)/.test(dc.service_interest) ? dc.service_interest : dc.service_interest.charAt(0).toLowerCase() + dc.service_interest.slice(1));
    s.push(si ? `Caller asked about ${si}.` : `Caller opened a conversation about “${c.title.toLowerCase()}” without naming a specific service.`);
    if (c.lead_captured) {
      const got = [dc.contact_name ? "name" : null, dc.phone ? "phone" : null, dc.email ? "email" : null].filter(Boolean);
      s.push(`Mia collected ${got.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
    } else s.push("No contact details were collected.");
    if (dc.urgency) s.push(`Urgency was marked ${dc.urgency}.`);
    if (hasTool(c, "request_human_review")) s.push("Mia requested a human review so the team can follow up.");
    s.push(`The call ended: ${termination(c).label.toLowerCase()}.`);
    return s.join(" ");
  }

  const PAGE_SIZES = [8, 25, 50];
  const ROUTE = { q: new URLSearchParams() };
  function convHref(id, page, size) {
    const qs = new URLSearchParams();
    if (page && page > 1) qs.set("page", page);
    if (size && size !== 8) qs.set("size", size);
    if (state.range !== "30d") qs.set("range", state.range);
    const str = qs.toString();
    return `#/conversations${id ? "/" + id : ""}${str ? "?" + str : ""}`;
  }
  // Filter, search or window changes always land on page 1 (selection id is kept).
  function resetConvPage() {
    const parts = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
    if (parts[0] !== "conversations") return render();
    const next = convHref(parts[1] || null, 1, PAGE_SIZES.includes(+ROUTE.q.get("size")) ? +ROUTE.q.get("size") : 8);
    if (location.hash === next) render(); else location.hash = next;
  }
  /* ───────── 2. Conversations (inbox layout: views · list · detail) ───────── */
  const spokeTool = (c) => (c.transcript || []).some((t) => t.role === "agent" && /\((request_human_review|create_lead_record)\)/.test(t.message || ""));
  function intents(c) {
    const s = ((c.title || "") + " " + ((c.data_collection && c.data_collection.service_interest) || "")).toLowerCase();
    const out = [];
    if (/laser|lhr|hair removal/.test(s)) out.push("Laser hair removal");
    if (/membership/.test(s)) out.push("Membership");
    if (/website|design preview/.test(s)) out.push("Business inquiry");
    if (/price|pricing/.test(s)) out.push("Pricing");
    if (/book|appointment|consult/.test(s)) out.push("Booking");
    if (!out.length) out.push(/aesthetic|treatment|services|concierge|inquiry/.test(s) ? "General questions" : "Other");
    return out;
  }
  const channelOf = (c) => (c.source === "twilio" ? "twilio" : "widget");
  const visitorLabel = (c) => callerName(c) || (c.source === "twilio" ? "Phone caller" : "Website visitor");
  const VIEWS = [
    ["all", "All calls", "inbox", () => true],
    ["follow", "Needs follow-up", "flag", (c) => hasTool(c, "request_human_review") || !!(c.data_collection && c.data_collection.urgency) || spokeTool(c)],
    ["leads", "Leads captured", "star", (c) => c.lead_captured],
    ["team", "Handed to team", "user", (c) => hasTool(c, "request_human_review")],
    ["long", "Long calls", "clock", (c) => c.duration_secs > 120],
    ["short", "Dropped < 15s", "stop", (c) => c.duration_secs < 15],
  ];
  const VICON = {
    inbox: '<path d="M2.5 9.5l1.8-5.2A1 1 0 0 1 5.2 3.6h5.6a1 1 0 0 1 .9.7l1.8 5.2V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/><path d="M2.5 9.5h3l.8 1.5h3.4l.8-1.5h3"/>',
    flag: '<path d="M4 14V2.5M4 3h7.5l-1.5 3 1.5 3H4"/>',
    star: '<path d="M8 2.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L8 10.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z"/>',
    user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/>',
    clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
    stop: '<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/>',
    phone: '<path d="M4 2.5h2l1 3-1.5 1a7 7 0 0 0 4 4l1-1.5 3 1v2a1 1 0 0 1-1 1A10.5 10.5 0 0 1 3 3.5a1 1 0 0 1 1-1z"/>',
    task: '<rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 6l1 1 2-2M5.5 10h5"/>',
    play: '<path d="M5.5 3.5v9l7-4.5z"/>',
    tool: ICON.tools,
  };
  const vic = (n, s) => `<svg width="${s || 14}" height="${s || 14}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${VICON[n]}</svg>`;
  const convAvatar = (c, sm) => callerName(c)
    ? `<span class="cav ${sm ? "sm" : ""}">${initials(callerName(c))}</span>`
    : `<span class="cav anon ${sm ? "sm" : ""}">${vic("user", sm ? 11 : 13)}</span>`;
  function hashN(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }

  function buildThread(c) {
    const items = [], tools = (c.tool_names || []).slice(), tr = c.transcript || [];
    for (let i = 0; i < tr.length; i++) {
      const t = tr[i];
      if (t.role === "agent" && !(t.message || "").trim()) {
        let j = i;
        while (j + 1 < tr.length && tr[j + 1].role === "agent" && !(tr[j + 1].message || "").trim()) j++;
        items.push({ type: "tool", name: tools.shift() || "tool_call", t: t.time_in_call_secs, timed: true });
        i = j; continue;
      }
      let msg = t.message || "", spoken = null;
      const m = msg.match(/\s*\((request_human_review|create_lead_record)\)\s*$/);
      if (m) { spoken = m[1]; msg = msg.slice(0, m.index); }
      items.push({ type: "turn", role: t.role, msg, t: t.time_in_call_secs, spoken });
    }
    tools.forEach((n) => items.push({ type: "tool", name: n, t: c.duration_secs, timed: false }));
    return items;
  }
  function toolCardHtml(it) {
    const meta = {
      request_human_review: ["Mia asked your team to follow up", "flag", false],
      create_lead_record: ["Lead record created for this caller", "user", false],
      end_call: ["Mia ended the call", "phone", true],
    }[it.name] || ["Tool call", "tool", false];
    return `<div class="tcard ${meta[2] ? "builtin" : ""}"><span class="tic">${vic(meta[1], 14)}</span>
      <div class="tbody"><div class="tt">${meta[0]}</div><div class="tn mono">${esc(it.name)}${meta[2] ? " · built-in" : " · webhook"}</div></div>
      <div class="tr"><span class="num">${dur(it.t)}${it.timed ? "" : "*"}</span>${meta[2] ? "" : `<span class="chip ok">Fired</span>`}</div></div>`;
  }
  function waveform(c, items) {
    const N = 120, W = 1000, H = 44, r = rng(hashN(c.id));
    const turns = (c.transcript || []).filter((t) => (t.message || "").trim());
    const roleAt = (sec) => { let role = "agent"; for (const t of turns) { if (t.time_in_call_secs <= sec) role = t.role; else break; } return role; };
    const bw = W / N, total = Math.max(1, c.duration_secs);
    let bars = "";
    for (let i = 0; i < N; i++) {
      const role = roleAt((i / N) * total);
      const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.37 + r() * 0.8));
      const h = Math.max(3, (H - 8) * env * (0.45 + r() * 0.55));
      bars += `<rect x="${(i * bw + 1).toFixed(1)}" y="${((H - h) / 2).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${role === "user" ? "#17160f" : "#d6d2c7"}" opacity="${role === "user" ? 0.78 : 1}"/>`;
    }
    const marks = items.filter((x) => x.type === "tool" && x.name !== "end_call").map((x) => {
      const X = Math.min(W - 4, (x.t / total) * W);
      return `<line x1="${X}" x2="${X}" y1="0" y2="${H}" stroke="#1f6f4a" stroke-width="2" stroke-dasharray="3 3"/><rect x="${X - 5}" y="0" width="10" height="10" rx="2" fill="#1f6f4a" transform="rotate(45 ${X} 5)"/>`;
    }).join("");
    return `<div class="wave"><div class="wave-top"><span class="play" title="Audio not available">${vic("play", 10)}</span>
        <span class="num"><b>0:00</b> / ${dur(c.duration_secs)}</span>
        <span class="chip muted" style="margin-left:auto">Audio not in snapshot</span></div>
      <svg class="wf" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Decorative timeline">${bars}${marks}</svg>
      <div class="wave-legend"><span><i style="background:#d6d2c7"></i>Mia</span><span><i style="background:#17160f;opacity:.78"></i>Caller</span><span><i style="background:#1f6f4a"></i>Tool fired</span><span class="note">Decorative · shaped from transcript timing, not audio</span></div></div>`;
  }

  function conversations(id) {
    const scoped = MIA_CONVS.filter((c) => inRange(c)); // newest first; counts stay totals for the window
    const view = VIEWS.find((v) => v[0] === state.view) || VIEWS[0];
    const q = state.q.trim().toLowerCase();
    const list = scoped.filter(view[3])
      .filter((c) => !state.intents.length || intents(c).some((t) => state.intents.includes(t)))
      .filter((c) => !state.channels.length || state.channels.includes(channelOf(c)))
      .filter((c) => !q || [visitorLabel(c), c.title, (c.data_collection || {}).phone, (c.data_collection || {}).email, (c.data_collection || {}).service_interest, intents(c).join(" ")].join(" ").toLowerCase().includes(q));
    const size = PAGE_SIZES.includes(+ROUTE.q.get("size")) ? +ROUTE.q.get("size") : 8;
    const pages = Math.max(1, Math.ceil(list.length / size));
    const idxOf = id ? list.findIndex((c) => c.id === id) : -1;
    let pageNo = parseInt(ROUTE.q.get("page"), 10);
    if (!pageNo) pageNo = idxOf >= 0 ? Math.floor(idxOf / size) + 1 : 1;
    pageNo = Math.min(Math.max(1, pageNo), pages);
    const start = (pageNo - 1) * size, visible = list.slice(start, start + size);
    const sel = MIA_CONVS.find((c) => c.id === id) || visible.find((c) => c.lead_captured && c.data_collection.urgency === "high") || visible[0] || MIA_CONVS[0];
    const selIdx = list.findIndex((c) => c.id === sel.id);
    const selOnPage = selIdx >= start && selIdx < start + size;
    const href = (cid, pg, sz) => convHref(cid, pg, sz || size);

    // left: views, intents, channels
    const iCounts = {};
    scoped.forEach((c) => intents(c).forEach((t) => (iCounts[t] = (iCounts[t] || 0) + 1)));
    const intentList = Object.entries(iCounts).sort((a, b) => b[1] - a[1]);
    const left = `<div class="ib-filters">
      <h1 class="ib-title">Conversations</h1><div class="ib-agent"><span class="dot ok"></span>Mia · ${esc(PB.display_name)}</div>
      <div class="views">${VIEWS.map((v) => `<button class="fview ${v[0] === view[0] ? "on" : ""}" data-view="${v[0]}">${vic(v[2], 14)}<span>${v[1]}</span><span class="n">${scoped.filter(v[3]).length}</span></button>`).join("")}</div>
      <div class="fgroup"><div class="flbl">Intent</div>${intentList.map(([k, n]) => `<button class="fcheck" data-intent="${esc(k)}"><span class="box ${state.intents.includes(k) ? "on" : ""}">${state.intents.includes(k) ? checkIc : ""}</span><span>${esc(k)}</span><span class="n">${n}</span></button>`).join("")}</div>
      <div class="fgroup"><div class="flbl">Channel</div>${[["widget", "Website widget"], ["twilio", "Phone"]].map(([k, l]) => { const n = scoped.filter((c) => channelOf(c) === k).length; return `<button class="fcheck ${n ? "" : "zero"}" data-chan="${k}"><span class="box ${state.channels.includes(k) ? "on" : ""}">${state.channels.includes(k) ? checkIc : ""}</span><span>${l}</span><span class="n">${n}</span></button>`; }).join("")}</div>
      <p class="fnote">Intent tags are derived from call titles and collected service interest, not from a classifier. Counts cover ${state.range === "all" ? "all loaded calls" : `the last ${RANGES[state.range]} days`}.</p>
    </div>`;

    // middle: search, window, rows, pager
    const ranges = [["7d", "7d"], ["30d", "30d"], ["90d", "90d"], ["all", "All"]];
    const filtered = state.intents.length || state.channels.length || q;
    const offPage = !selOnPage ? `<div class="offpage"><span title="${esc(sel.title)}">Viewing <b>${esc(visitorLabel(sel))}</b> · ${esc(sel.title)}</span>${selIdx >= 0 ? `<a class="link" href="${href(sel.id, Math.floor(selIdx / size) + 1)}">On page ${Math.floor(selIdx / size) + 1} →</a>` : `<span class="link" style="color:var(--muted)">Not in this list</span>`}</div>` : "";
    const rows = visible.map((c) => {
      const its = intents(c);
      const flags = (hasTool(c, "request_human_review") ? `<span title="Handed to team">${vic("flag", 12)}</span>` : "") + (c.lead_captured ? `<span title="Lead captured" class="g">${vic("star", 12)}</span>` : "");
      return `<a class="crow ${c.id === sel.id ? "on" : ""}" href="${href(c.id, pageNo)}">${convAvatar(c)}
        <div class="cb"><div class="r1"><span class="who ${callerName(c) ? "" : "anon"}">${esc(visitorLabel(c))}</span><span class="when num">${fDate(c.start_time_unix_secs)} · ${fTime(c.start_time_unix_secs)}</span></div>
        <div class="ttl">${esc(c.title)}</div>
        <div class="r3"><span class="itag">${esc(its[0])}</span>${its.length > 1 ? `<span class="itag more">+${its.length - 1}</span>` : ""}<span class="meta">${flags ? `<span class="flags">${flags}</span>` : ""}<span class="num">${dur(c.duration_secs)}</span></span></div></div></a>`;
    }).join("") || `<p class="empty">No calls match. Try another view or clear filters.</p>`;
    const nums = Array.from({ length: pages }, (_, i) => i + 1).map((n) => `<a class="pg ${n === pageNo ? "active" : ""}" href="${href(sel.id, n)}" ${n === pageNo ? 'aria-current="page"' : ""}>${n}</a>`).join("");
    const navBtn = (lbl, n, dis) => (dis ? `<span class="pg nav dis" aria-disabled="true">${lbl}</span>` : `<a class="pg nav" href="${href(sel.id, n)}">${lbl}</a>`);
    const middle = `<div class="ib-list">
      <div class="ib-top">
        <label class="ib-search">${ic("search", 14)}<input id="conv-q" type="search" placeholder="Search callers, topics, numbers" value="${esc(state.q)}" autocomplete="off"></label>
        <div class="ib-row"><div class="seg sm">${ranges.map(([k, l]) => `<button class="${state.range === k ? "active" : ""}" data-range="${k}">${l}</button>`).join("")}</div><span class="sortlbl">Newest first</span></div>
        <div class="ib-meta"><span><b class="num">${list.length}</b> call${list.length === 1 ? "" : "s"} · ${esc(view[1])}${filtered ? " · filtered" : ""}</span>${filtered || view[0] !== "all" ? `<button class="clear" data-clear="1">Clear</button>` : ""}</div>
      </div>
      ${offPage}
      <div class="ib-items">${rows}</div>
      <div class="conv-foot">
        <div class="cf-row"><span class="num range">${list.length ? `${start + 1}–${start + visible.length}` : "0"} of ${list.length}</span>
          <span class="sizes"><span class="lbl">Rows</span>${PAGE_SIZES.map((n) => `<a class="sz ${n === size ? "active" : ""}" href="${convHref(sel.id, 1, n)}">${n}</a>`).join("")}</span></div>
        <div class="cf-row pager">${navBtn("‹ Prev", pageNo - 1, pageNo <= 1)}<span class="nums">${nums}</span>${navBtn("Next ›", pageNo + 1, pageNo >= pages)}</div>
      </div>
    </div>`;

    // right: one scroll container, sticky header, two columns
    const th = buildThread(sel);
    let prevRole = null;
    const thread = th.map((it) => {
      if (it.type === "tool") { prevRole = null; return toolCardHtml(it); }
      const cont = prevRole === it.role; prevRole = it.role;
      const av = it.role === "agent" ? `<span class="cav agent sm">M</span>` : convAvatar(sel, true);
      return `<div class="msg ${it.role === "user" ? "caller" : "agent"} ${cont ? "cont" : ""}"><div class="mav">${av}</div>
        <div class="mcol"><div class="bub">${esc(it.msg)}${it.spoken ? `<span class="spoken">Mia said “${it.spoken}” aloud — the tool did not run</span>` : ""}</div></div>
        <span class="mts num">${dur(it.t)}</span></div>`;
    }).join("");
    const dc = sel.data_collection || {};
    const o = outcome(sel), term = termination(sel), its = intents(sel);
    const kvRow = (k, v, raw) => `<div class="lrow"><span class="k">${k}</span><span class="v ${v ? "" : "none"}">${v ? (raw ? v : esc(v)) : "Not collected"}</span></div>`;
    const urg = dc.urgency ? `<span class="chip ${dc.urgency === "high" ? "warn" : "muted"}">${dc.urgency[0].toUpperCase() + dc.urgency.slice(1)} urgency</span>` : null;
    const k = sel.cost;
    const llmPct = k ? pct(k.llm_price_usd, cost(sel)) : 0;
    const taskDone = state.tasks[sel.id];
    const untimed = th.some((x) => x.type === "tool" && !x.timed);
    const detail = `<div class="ib-detail" id="dt-scroll" data-id="${sel.id}">
      <header class="dt-head">${convAvatar(sel)}
        <div class="dt-id"><h2>${esc(visitorLabel(sel))}</h2><div class="sub"><span class="st">${esc(sel.title)}</span><span class="sm"><span class="num">${fDateTime(sel.start_time_unix_secs)}</span><i>·</i><span>Web widget · ${k && k.text_only ? "text" : "voice"}</span><i>·</i><span class="num">${dur(sel.duration_secs)}</span></span></div></div>
        <div class="dt-acts"><span class="chip ${o.cls}">${o.label}</span>${taskDone ? `<button class="btn" disabled>${vic("task", 14)}Task drafted</button>` : `<button class="btn ${callerName(sel) ? "primary" : ""}" data-task="${sel.id}" ${callerName(sel) ? "" : 'title="No contact details to attach"'}>${vic("task", 14)}Create CRM task</button>`}</div>
      </header>
      <div class="dt-grid">
        <section class="dt-main">
          ${waveform(sel, th)}
          <div class="daysep"><span>${fFull(sel.start_time_unix_secs)} · ${fTime(sel.start_time_unix_secs)} · ${(sel.transcript || []).length} transcript turn${(sel.transcript || []).length === 1 ? "" : "s"}</span></div>
          <div class="thread">${thread || `<p class="empty">No transcript in this snapshot.</p>`}</div>
          ${untimed ? `<p class="prov">* Tool has no timing in the transcript; placed at end of call.</p>` : ""}
        </section>
        <aside class="learned">
          <h3>What we learned</h3><p class="lead">From Mia’s data collection, tool calls and the transcript.</p>
          ${spokeTool(sel) && !hasTool(sel, "request_human_review") ? `<div class="lcard warnc"><div class="lh">Handoff not logged</div><p>Mia told the caller she was logging the request, but no handoff tool ran. Your team was not notified.</p></div>` : ""}
          <div class="lcard"><div class="lh">Summary <span class="chip muted" style="height:19px">Composed · draft</span></div><p class="summary">${esc(summaryOf(sel))}</p><div class="prov">Composed from collected data and tool calls; the provider summary is not in this snapshot.</div></div>
          <div class="lcard"><div class="lh">Collected data</div>${kvRow("Name", dc.contact_name)}${kvRow("Phone", dc.phone)}${kvRow("Email", dc.email)}${kvRow("Interested in", dc.service_interest)}${kvRow("Urgency", urg, true)}</div>
          <div class="lcard"><div class="lh">Intent <span class="prov" style="margin:0">derived</span></div><div class="chips-wrap">${its.map((t, i) => `<span class="itag ${i ? "more" : ""}">${esc(t)}</span>`).join("")}</div></div>
          <div class="lcard"><div class="lh">Outcome</div>
            <div class="chips-wrap"><span class="chip ${o.cls}">${o.label}</span>${hasTool(sel, "request_human_review") ? `<span class="chip plain">Handed to team</span>` : ""}<span class="chip warn">Booking not verified</span></div>
            <div class="score"><span>Provider call evaluation</span><b class="num">${sel.call_successful === "success" ? "Successful" : sel.call_successful === "failure" ? "Unsuccessful" : "Not measured"}</b></div>
            <div class="crits">${MIA.evaluation_criteria.map((e) => `<div class="crit"><span class="k">${e}</span><span class="v">Not measured</span></div>`).join("")}</div>
            ${kvRow("Ended by", `${term.label}${term.code ? ` <span class="mono" style="color:var(--faint);font-size:11px">${term.code}</span>` : ""}`, true)}
            <div class="lrow stack"><span class="k">Tools invoked</span><span class="v">${(sel.tool_names || []).length ? `<span class="chips-wrap">${sel.tool_names.map((t) => `<span class="chip tool ${t === "end_call" ? "sys" : ""}">${t}</span>`).join("")}</span>` : `<span class="none">None</span>`}</span></div>
          </div>
          ${k ? `<div class="lcard"><div class="lh">Usage cost <span class="prov" style="margin:0">ElevenLabs</span></div>
            <div class="callcost"><span class="v">${usd(cost(sel))}</span><span class="m">${k.text_only ? "Text-only session" : "Voice session"}</span></div>
            <div class="minibar"><span class="llm" style="width:${llmPct}%"></span><span class="plat" style="width:${100 - llmPct}%"></span></div>
            ${kvRow('<i class="sw llm"></i>LLM', usd(k.llm_price_usd), true)}${kvRow('<i class="sw plat"></i>Platform', usd(k.platform_price_usd), true)}${kvRow("Billed", billedLabel(sel))}
            <div class="prov">Provider usage only, not an invoice. Excludes Limitless markup, Twilio, Convex and Twenty.</div></div>` : ""}
          <p class="fnote">Per-criterion evaluation results aren’t in this snapshot, so they show as “Not measured”, not as failures. Bookings are never counted without CRM or calendar confirmation.</p>
        </aside>
      </div>
    </div>`;

    document.documentElement.classList.remove("internal");
    return `<div class="shell">${sidebar("conversations", false)}<main class="main fixed">${topbar(["Configure", "Voice Agents", "Conversations"])}<div class="inbox">${left}${middle}${detail}</div></main></div>`;
  }

  /* ───────── router + reviewer ───────── */
  const SCREENS = [["overview", "Overview"], ["conversations", "Conversations"]];
  function reviewer(screen) {
    let html = `<span class="rh">01 · LEDGER</span>`;
    SCREENS.forEach(([k, l], i) => {
      if (i === 2) html += `<span class="div"></span>`;
      html += `<a href="#/${k}" class="${k === screen ? "active" : ""}"><span class="n">0${i + 1}</span>${l}</a>`;
    });
    const rev = document.getElementById("reviewer"); if (rev) rev.innerHTML = html;
  }

  function render() {
    let [path, qs] = (location.hash.replace(/^#\/?/, "") || "overview").split("?");
    if (path === "calls" || path.startsWith("calls/")) path = path.replace(/^calls/, "conversations");
    if (path.startsWith("call/")) path = "conversations/" + path.slice(5);
    ROUTE.q = new URLSearchParams(qs || "");
    if (ROUTE.q.get("range") && RANGES.hasOwnProperty(ROUTE.q.get("range"))) state.range = ROUTE.q.get("range");
    const parts = (path || "overview").split("/");
    const screen = SCREENS.some((s) => s[0] === parts[0]) ? parts[0] : "overview";
    const arg = parts[1] ? decodeURIComponent(parts.slice(1).join("/")) : null;
    const fn = { overview, conversations }[screen] || overview;
    const prevDt = document.getElementById("dt-scroll");
    const prevScroll = prevDt ? { id: prevDt.dataset.id, top: prevDt.scrollTop } : null;
    app.innerHTML = fn(arg);
    reviewer(screen);
    const dt = document.getElementById("dt-scroll");
    if (dt) {
      if (ROUTE.q.get("scroll")) dt.scrollTop = +ROUTE.q.get("scroll") || 0; // debug: #/conversations?scroll=700
      else if (prevScroll && prevScroll.id === dt.dataset.id) dt.scrollTop = prevScroll.top; // same call re-rendered
      else dt.scrollTop = 0; // another call selected
      if (ROUTE.q.get("audit")) { // debug: report which scroll containers hold the two detail columns
        const scrollers = [...document.querySelectorAll("*")].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight);
        const holds = (sel) => scrollers.filter((el) => el.querySelector(sel)).map((el) => el.className || el.tagName);
        document.body.dataset.audit = JSON.stringify({ scrollers: scrollers.map((el) => el.className || el.tagName), main: holds(".dt-main"), learned: holds(".learned"), headSticky: getComputedStyle(document.querySelector(".dt-head")).position, headBg: getComputedStyle(document.querySelector(".dt-head")).backgroundColor, footerBottom: Math.round(document.querySelector(".conv-foot").getBoundingClientRect().bottom), viewport: innerHeight, docScrolls: document.documentElement.scrollHeight > innerHeight, topbarRect: (() => { const r = document.querySelector(".topbar").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.height)]; })() });
      }
      const on = document.querySelector(".crow.on");
      if (on) on.scrollIntoView({ block: "nearest" });
    }
    const main = app.querySelector(".main");
    if (main && render.last !== screen) main.scrollTop = 0;
    render.last = screen;
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-href],[data-range],[data-env],[data-cfilter],[data-failures],[data-csort],[data-view],[data-intent],[data-chan],[data-task],[data-clear]");
    if (!t) return;
    const tog = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : arr.concat(v));
    if (t.dataset.view) { state.view = t.dataset.view; return resetConvPage(); }
    if (t.dataset.intent) { state.intents = tog(state.intents, t.dataset.intent); return resetConvPage(); }
    if (t.dataset.chan) { state.channels = tog(state.channels, t.dataset.chan); return resetConvPage(); }
    if (t.dataset.clear) { state.view = "all"; state.intents = []; state.channels = []; state.q = ""; return resetConvPage(); }
    if (t.dataset.task) { state.tasks[t.dataset.task] = true; return render(); }
    if (t.dataset.csort) { state.costSort = t.dataset.csort; render(); return; }
    if (t.dataset.nohref) return;
    if (t.dataset.href) { if (t.tagName !== "A") location.hash = t.dataset.href; return; }
    if (t.dataset.range) { state.range = t.dataset.range; return resetConvPage(); }
    if (t.dataset.env) state.env = t.dataset.env;
    if (t.dataset.cfilter) { state.convFilter = t.dataset.cfilter; return resetConvPage(); }
    if (t.dataset.failures) state.failuresOnly = !state.failuresOnly;
    render();
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id !== "conv-q") return;
    state.q = ev.target.value;
    const pos = ev.target.selectionStart;
    resetConvPage();
    const el = document.getElementById("conv-q");
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });
  window.LedgerCustomer = { render, state };
  window.addEventListener("hashchange", () => {
    const had = document.activeElement && document.activeElement.id === "conv-q";
    const pos = had ? document.activeElement.selectionStart : 0;
    render();
    const el = had && document.getElementById("conv-q");
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });
  /* initial render via wireframe bootstrap */
})();
