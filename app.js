(function () {
  "use strict";

  const DATA = window.WIREFRAME_DATA;
  const { renderVoicePage, metricCard, metricRow, escapeHtml } = window.PdfShell;

  if (!DATA || !renderVoicePage) {
    document.body.innerHTML = "<p style='padding:2rem'>Missing data.js or pdf-shell.js</p>";
    return;
  }

  const SCREENS = [
    { id: "overview", label: "V2 · 01 Overview", group: "Customer" },
    { id: "calls", label: "V2 · 02 Conversations", group: "Customer" },
    { id: "call-detail", label: "V2 · 03 Call details", group: "Customer" },
    { id: "overview-ready", label: "V2 · 04 Ready state", group: "Customer" },
    { id: "analytics", label: "V2 · 05 Analytics", group: "Customer" },
    { id: "analytics-detail", label: "V2 · 07 Analytics detail", group: "Customer" },
    { id: "analytics-trends", label: "V2 · 08 Weekly trends", group: "Customer" },
    { id: "analytics-quality", label: "V2 · 09 Call quality", group: "Customer" },
    { id: "empty", label: "V2 · 10 Empty state", group: "Customer" },
    { id: "agent", label: "V2 · 11 Mia · Agent setup", group: "Customer" },
    { id: "templates", label: "V2 · 12 Templates", group: "Future" },
    { id: "chat-intent", label: "V2 · 13 Build in Chat", group: "Future" },
    { id: "chat-goals", label: "V2 · 14 Goals & KPIs", group: "Future" },
    { id: "chat-tasks", label: "V2 · 15 Tasks", group: "Future" },
    { id: "managed-1", label: "V2 · 16 Managed request", group: "Managed" },
    { id: "managed-2", label: "V2 · 17 Setup progress", group: "Managed" },
    { id: "internal-1", label: "V2 · 18 Customer registry", group: "Internal" },
    { id: "internal-2", label: "V2 · 19 Routing editor", group: "Internal" },
    { id: "internal-3", label: "V2 · 20 Tool diagnostics", group: "Internal" },
    { id: "briefing", label: "V2 · 21 Briefing handoff", group: "Customer" },
  ];

  const state = {
    screen: "overview",
    callId: null,
    selectedCallId: null,
    reportRange: "30d",
    demoEmpty: false,
  };

  const EYEBROW_CUSTOMER = "Voice agents · Purple Basil Medspa";
  const EYEBROW_UPPER = "VOICE AGENTS · PURPLE BASIL MEDSPA";

  function parseRoute() {
    const parts = (location.hash.replace(/^#/, "") || "overview").split("/").filter(Boolean);
    if (parts[0] === "call" && parts[1]) {
      state.screen = "call-detail";
      state.callId = parts[1];
      state.selectedCallId = parts[1];
      return;
    }
    if (parts[0] === "voice-crm") {
      location.replace("#/internal-2");
      state.screen = "internal-2";
      return;
    }
    state.screen = parts[0] || "overview";
  }

  function navigate(screen, callId) {
    if (screen === "call-detail" && callId) {
      state.callId = callId;
      state.selectedCallId = callId;
      location.hash = "#/call/" + callId;
    } else {
      location.hash = "#/" + screen;
    }
  }

  function conversations() {
    if (state.demoEmpty) return [];
    return DATA.conversations || [];
  }

  function fmtDate(unix) {
    if (!unix) return "—";
    return new Date(unix * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function fmtDateShort(unix) {
    if (!unix) return "—";
    return new Date(unix * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function callerLabel(c) {
    return c.data_collection?.contact_name || c.title || "Caller";
  }

  function renderTranscript(conversation, opts = {}) {
    const turns = conversation?.transcript || [];
    if (!turns.length) {
      return `<p class="wf-list-meta">No transcript turns in this snapshot.</p>`;
    }
    const max = opts.maxTurns;
    const slice = max ? turns.slice(0, max) : turns;
    const more = max && turns.length > max ? `<p class="wf-list-meta">${turns.length - max} more turns · open full call details</p>` : "";
    return `<div class="wf-transcript">${slice
      .map((t) => {
        const role = t.role === "user" ? "Caller" : t.role === "agent" ? "Mia" : t.role;
        const time =
          t.time_in_call_secs != null && t.time_in_call_secs > 0
            ? `<span class="wf-turn-time">${t.time_in_call_secs}s</span>`
            : "";
        return `<div class="wf-turn wf-turn-${escapeHtml(t.role || "unknown")}">
          <div class="wf-turn-head">${escapeHtml(role)}${time}</div>
          <div class="wf-turn-msg">${escapeHtml(t.message || "")}</div>
        </div>`;
      })
      .join("")}</div>${more}`;
  }

  function sourceLine() {
    const convs = conversations();
    if (!convs.length) return "Source: 0 call rows · Purple Basil Medspa";
    const times = convs.map((c) => c.start_time_unix_secs).filter(Boolean);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const range =
      times.length > 1
        ? `${fmtDateShort(min)} – ${fmtDateShort(max)}`
        : fmtDateShort(min);
    return `Source: ${convs.length} call row${convs.length === 1 ? "" : "s"} · Purple Basil Medspa · ${range}`;
  }

  function stats() {
    const convs = conversations();
    const leads = convs.filter((c) => c.lead_captured).length;
    const scored = convs.filter((c) => c.call_success_score != null).length;
    return {
      n: convs.length,
      leads,
      scored,
      answered: convs.length,
    };
  }

  function selectedCall() {
    const id = state.callId || state.selectedCallId;
    return conversations().find((c) => c.id === id) || conversations()[0];
  }

  function followUpCall() {
    return (
      conversations().find((c) => c.lead_captured && c.data_collection?.urgency === "high") ||
      conversations().find((c) => c.lead_captured) ||
      conversations()[0]
    );
  }

  function voiceCrmRow() {
    const agentId = DATA.agent?.agent_id;
    return (DATA.voice_crm_control_plane?.customers || []).find((r) =>
      (r.elevenlabs_agent_ids || []).includes(agentId)
    );
  }

  function page(opts) {
    return renderVoicePage(opts);
  }

  function renderOverview() {
    const s = stats();
    const convs = conversations().slice(0, 4);
    const list = convs
      .map(
        (c) => `
      <div class="wf-list-item" data-call="${c.id}">
        <div class="wf-list-title">${escapeHtml(callerLabel(c))} · ${escapeHtml(fmtDate(c.start_time_unix_secs).split(", ").pop() || "")}</div>
        <div class="wf-list-meta">${escapeHtml(fmtDateShort(c.start_time_unix_secs))} · ${escapeHtml(c.title)} · ${c.lead_captured ? "Follow-up context available" : "Outcome not verified"}</div>
      </div>`
      )
      .join("");

    return page({
      eyebrow: EYEBROW_UPPER,
      title: "Voice agents",
      subtitle: "Agent activity, conversations and customer outcomes — in one place.",
      activeTab: "overview",
      activeRange: state.reportRange,
      sourceLine: sourceLine(),
      body: `
        ${metricRow([
          metricCard("Answered calls", s.answered, "Provider call rows"),
          metricCard("Captured leads", s.leads, "Both source rows marked captured"),
          metricCard("Contact records", s.leads, "Records available in source"),
          metricCard("Confirmed bookings", "—", "CRM / calendar not verified"),
        ])}
        <div class="wf-grid-2">
          <div class="wf-panel">
            <div class="wf-panel-head">Recent conversations <button type="button" class="wf-btn" data-go="calls">View all conversations</button></div>
            <div class="wf-panel-body">${list || "<p class='wf-list-meta'>No calls loaded.</p>"}</div>
          </div>
          <div class="wf-panel">
            <div class="wf-panel-head">Outcome snapshot</div>
            <div class="wf-panel-body">
              <p class="wf-list-meta">Select a call to read its summary or follow-up context.</p>
              <p class="wf-list-meta">Based on ${s.n} source call${s.n === 1 ? "" : "s"}</p>
              <p style="margin-top:12px"><strong>Answered ${s.answered}</strong><br/>Lead captured ${s.leads}</p>
              <p class="wf-list-meta" style="margin-top:8px">Qualified &amp; booked —</p>
            </div>
          </div>
        </div>
        <div class="wf-panel" style="margin-top:16px">
          <div class="wf-panel-head">Ready to use · Mia</div>
          <div class="wf-panel-body">
            <p>Inbound voice receptionist · Purple Basil Medspa · Managed configuration.</p>
          </div>
        </div>
        <p class="wf-footnote"><strong>About this snapshot</strong> — The ${s.leads}/${s.n || "0"} capture result reflects only the loaded call sample. It isn't a forecast or verified booking-conversion rate.</p>
      `,
    });
  }

  function renderOverviewReady() {
    const s = stats();
    return page({
      eyebrow: EYEBROW_UPPER,
      title: "Voice agents",
      subtitle: "Agent activity, conversations and customer outcomes — in one place.",
      activeTab: "overview",
      sourceLine: sourceLine(),
      body: `
        <p class="wf-callout info">Your agent is ready to handle calls.<br/>Prioritize calls and follow-up requests, then explore more detail.</p>
        ${metricRow([
          metricCard("Answered", s.answered, ""),
          metricCard("Captured", s.leads, ""),
          metricCard("Booked", "—", ""),
          metricCard("", "", ""),
        ])}
      `,
    });
  }

  function renderCalls() {
    const s = stats();
    const convs = conversations();
    const sel = selectedCall();
    return page({
      eyebrow: EYEBROW_UPPER,
      title: "Conversations",
      subtitle: "Review each real conversation, its source summary and next action.",
      activeTab: "calls",
      activeRange: state.reportRange,
      sourceLine: sourceLine(),
      body: `
        ${metricRow([
          metricCard("Calls loaded", s.n, "Two source conversation rows"),
          metricCard("Lead captured", s.leads, "Provider stage records"),
          metricCard("Success evaluations", s.scored, "Scored call-success rows available"),
          metricCard("", "", ""),
        ])}
        <div class="wf-grid-2">
          <div class="wf-panel">
            <div class="wf-panel-head">Recent calls <span class="wf-list-meta">${s.n} results · Sorted newest first</span></div>
            <div class="wf-panel-body">
              ${convs
                .map(
                  (c) => `
                <div class="wf-list-item" data-call="${c.id}">
                  <div class="wf-list-title">${escapeHtml(callerLabel(c))} · ${escapeHtml(c.title)}</div>
                  <div class="wf-list-meta">${escapeHtml(fmtDate(c.start_time_unix_secs))} · ${c.lead_captured ? "Lead captured" : "Outcome unknown"}</div>
                </div>`
                )
                .join("")}
            </div>
          </div>
          <div class="wf-panel">
            <div class="wf-panel-head">Selected conversation ${sel ? '<span class="wf-pill ok">SELECTED</span>' : ""}</div>
            <div class="wf-panel-body">
              ${
                sel
                  ? `<p>${escapeHtml(sel.data_collection?.service_interest || sel.title)}</p>
                     <p class="wf-list-meta">Call success · ${sel.call_success_score != null ? sel.call_success_score : "Not measured"}</p>
                     ${renderTranscript(sel, { maxTurns: 3 })}
                     <button type="button" class="wf-btn primary" data-call="${sel.id}">Open full call details</button>`
                  : "<p class='wf-list-meta'>Select a call from the list.</p>"
              }
            </div>
          </div>
        </div>
        <p class="wf-footnote"><strong>Data completeness</strong> — The source contains ${s.n} calls and ${s.scored} scored call-success rows. This doesn't mean both calls failed.</p>
      `,
    });
  }

  function renderCallDetail() {
    const c = selectedCall();
    if (!c) {
      return page({
        eyebrow: "VOICE AGENTS · CONVERSATION DETAIL",
        title: "Call details",
        activeTab: "calls",
        showVoiceTabs: true,
        body: `<p class="wf-callout warn">No call selected.</p>`,
      });
    }
    const summary =
      c.data_collection?.service_interest ||
      c.title ||
      "Summary available from provider analysis.";
    return page({
      eyebrow: "VOICE AGENTS · CONVERSATION DETAIL",
      title: "Call details",
      subtitle: `${callerLabel(c)} · ${fmtDate(c.start_time_unix_secs)} · ${c.title}`,
      activeTab: "calls",
      sourceLine: sourceLine(),
      body: `
        <dl class="wf-dl" style="margin-bottom:16px">
          <dt>Contact</dt><dd>${escapeHtml(callerLabel(c))}</dd>
          <dt>Agent</dt><dd>Mia</dd>
          <dt>Duration</dt><dd>${c.duration_secs != null ? c.duration_secs + "s" : "Not captured"}</dd>
          <dt>Outcome</dt><dd>${c.lead_captured ? "Lead captured" : "Not verified"}</dd>
        </dl>
        <div class="wf-grid-2">
          <div class="wf-panel">
            <div class="wf-panel-head">Conversation summary</div>
            <div class="wf-panel-body">
              <p class="wf-list-meta">Source-backed summary from ElevenLabs conversation analysis</p>
              <p><strong>${escapeHtml(DATA.customer.display_name)}</strong></p>
              <p>${escapeHtml(summary)}</p>
              <p class="wf-list-meta" style="margin-top:8px">Caller · ${escapeHtml(callerLabel(c))}</p>
              <p class="wf-list-meta">Contact details restricted to permitted workspace roles</p>
            </div>
          </div>
          <div class="wf-panel">
            <div class="wf-panel-head">Transcript <span class="wf-list-meta">${(c.transcript || []).length} turns · text from ConvAI</span></div>
            <div class="wf-panel-body">
              <p class="wf-list-meta">Playback not available in wireframe; transcript text is from the loaded ElevenLabs snapshot.</p>
              ${renderTranscript(c)}
              <div class="wf-callout warn" style="margin-top:12px">
                <strong>Evaluation coverage</strong> — ${c.call_success_score != null ? "Call success score " + c.call_success_score : "Call success · Not measured"}
              </div>
            </div>
          </div>
        </div>
      `,
    });
  }

  function renderAnalytics() {
    const s = stats();
    return page({
      eyebrow: "VOICE AGENTS / ANALYTICS",
      title: "Voice analytics",
      subtitle: "Monitor real activity and outcomes without guessing at unverified stages.",
      activeTab: "analytics",
      activeRange: state.reportRange,
      sourceLine: `Purple Basil Medspa · ${s.n} source calls · ${sourceLine().split("·").pop()?.trim() || ""}`,
      body: `
        <p class="wf-footnote" style="margin-top:0;margin-bottom:16px">Both loaded calls have captured-lead records where applicable. This is a sample, not a verified booking-conversion rate.</p>
        ${metricRow([
          metricCard("Answered", s.answered, ""),
          metricCard("Captured", s.leads, ""),
          metricCard("Booked", "—", ""),
          metricCard("", "", ""),
        ])}
        <button type="button" class="wf-btn" data-go="analytics-detail">View metric definitions</button>
        <button type="button" class="wf-btn" data-go="analytics-trends">Weekly trends</button>
        <button type="button" class="wf-btn" data-go="analytics-quality">Call quality</button>
      `,
    });
  }

  function renderAnalyticsDetail() {
    const s = stats();
    return page({
      eyebrow: "VOICE AGENTS / ANALYTICS",
      title: "Voice analytics",
      subtitle: "Monitor real activity and outcomes without guessing at unverified stages.",
      activeTab: "analytics",
      activeRange: state.reportRange,
      sourceLine: `Purple Basil Medspa · ${s.n} source calls`,
      body: metricRow([
        metricCard("Answered calls", s.answered, "Loaded conversation rows"),
        metricCard("Captured leads", s.leads, "Provider stage evidence"),
        metricCard("Capture among calls", s.n ? `${s.leads}/${s.n}` : "—", ""),
        metricCard("Success scored", s.scored, ""),
      ]),
    });
  }

  function renderAnalyticsTrends() {
    const s = stats();
    return page({
      eyebrow: "VOICE AGENTS / ANALYTICS",
      title: "Weekly trends",
      subtitle: "Track movement over time when reliable weekly aggregates exist.",
      activeTab: "analytics",
      activeRange: state.reportRange,
      sourceLine: `Purple Basil Medspa · ${s.n} source calls`,
      body: `
        <div class="wf-panel">
          <div class="wf-panel-head">Call activity by week</div>
          <div class="wf-panel-body">
            <p class="wf-list-meta">${s.n} week reporting grid · Real buckets required before plotting a line.</p>
            <p><strong>Loaded calls</strong> · ${s.n}</p>
            <p class="wf-list-meta">Week 1 — · Week 2 — · Week 3 —</p>
          </div>
        </div>
      `,
    });
  }

  function renderAnalyticsQuality() {
    const s = stats();
    return page({
      eyebrow: "VOICE AGENTS / ANALYTICS",
      title: "Voice call quality",
      subtitle: "Make each quality signal easy to understand, with clear measurement coverage.",
      activeTab: "analytics",
      sourceLine: `Purple Basil Medspa · ${s.n} source calls`,
      body: metricRow([
        metricCard("Sentiment", "Not configured", "Requires detector"),
        metricCard("Call success", s.scored + " scored rows", "—"),
        metricCard("Average duration", "Not captured", "—"),
        metricCard("Repetition", "—", "—"),
      ]),
    });
  }

  function renderEmpty() {
    return page({
      eyebrow: "VOICE AGENTS · CUSTOMER",
      title: "No voice activity yet",
      subtitle: "When no real calls exist, guide the user without misleading metrics.",
      activeTab: "overview",
      showReporting: false,
      body: `
        <p><strong>Your voice agent is ready to take its first call.</strong></p>
        <p class="wf-list-meta">Calls, customer summaries and verified outcomes will appear once a connected voice agent receives real conversations.</p>
        <div class="wf-grid-2" style="margin-top:20px">
          <div class="wf-panel"><div class="wf-panel-head">Conversations</div><div class="wf-panel-body"><p class="wf-list-meta">No calls loaded. This is not a failed service check.</p></div></div>
          <div class="wf-panel"><div class="wf-panel-head">Analytics</div><div class="wf-panel-body"><p class="wf-list-meta">No data to visualize yet. Avoid showing 0% health or synthetic charts.</p></div></div>
        </div>
        <button type="button" class="wf-btn" data-go="agent">Review agent settings</button>
        <button type="button" class="wf-btn" id="exit-empty">Return to live sample data</button>
      `,
    });
  }

  function renderAgent() {
    const row = voiceCrmRow();
    return page({
      eyebrow: "VOICE AGENTS · CUSTOMER",
      title: "Mia · Voice receptionist",
      subtitle: "Customer-facing settings and status for your managed voice agent.",
      activeTab: "agent",
      showReporting: false,
      body: `
        <div class="wf-grid-2">
          <div class="wf-panel">
            <div class="wf-panel-head">Agent profile</div>
            <div class="wf-panel-body">
              <p><strong>Status · Ready</strong></p>
              <p class="wf-list-meta">Operational readiness shown; booking outcomes may still be unavailable.</p>
              <dl class="wf-dl" style="margin-top:12px">
                <dt>Purpose</dt><dd>Answer inbound calls, capture enquiries and offer safe escalation</dd>
                <dt>Voice</dt><dd><button type="button" class="wf-btn" disabled>Request changes</button></dd>
                <dt>Workspace</dt><dd>Managed by Limitless setup team · Not self-service yet</dd>
              </dl>
            </div>
          </div>
          <div class="wf-panel">
            <div class="wf-panel-head">ElevenLabs · ${escapeHtml(DATA.agent.agent_id)}</div>
            <div class="wf-panel-body">
              <dl class="wf-dl">
                <dt>Model</dt><dd>${escapeHtml(DATA.agent.tts_model || "")}</dd>
                <dt>LLM</dt><dd>${escapeHtml(DATA.agent.llm || "")}</dd>
              </dl>
            </div>
          </div>
        </div>
        ${
          row
            ? `<div class="wf-panel" style="margin-top:16px">
            <div class="wf-panel-head">CRM &amp; notify routing <span class="wf-pill ok">Limitless internal</span></div>
            <div class="wf-panel-body">
              <p class="wf-list-meta">Edit on <button type="button" class="wf-btn" data-go="internal-2">Routing editor</button> — maps agent to Twenty workspace and notify emails for human review / urgent tasks.</p>
              <dl class="wf-dl">
                <dt>Twenty workspace</dt><dd><code>${escapeHtml(row.twenty_workspace_id || "")}</code></dd>
                <dt>Notify</dt><dd>${escapeHtml((row.notify_emails || []).join(", "))}</dd>
                <dt>Timezone</dt><dd>${escapeHtml(row.voice_lead_email_timezone || "")}</dd>
              </dl>
            </div>
          </div>`
            : ""
        }
        <button type="button" class="wf-btn" style="margin-top:12px" data-go="templates">New agent (future concept)</button>
      `,
    });
  }

  function renderFuture(id) {
    const map = {
      templates: {
        eyebrow: "FUTURE CONCEPT · SELF-SERVICE",
        title: "Start with an agent template",
        subtitle:
          "Choose a ready-made persona or describe an outcome; creation continues in guided Chat. This is a proposed future experience. Currently, Limitless manages agent setup.",
        body: `<div class="wf-template-grid">
          <div class="wf-template-card"><strong>Voice receptionist</strong><p>Handle incoming calls, answer approved FAQs and capture leads.</p><button class="wf-btn" disabled>Use template →</button></div>
          <div class="wf-template-card"><strong>Lead qualifier</strong><p>Ask discovery questions, flag high-intent contacts and request handoff.</p><button class="wf-btn" disabled>Use template →</button></div>
          <div class="wf-template-card"><strong>Appointment assistant</strong><p>Prepare booking requests and verify availability.</p><button class="wf-btn" disabled>Use template →</button></div>
        </div>
        <p class="wf-footnote">Not every new task needs a new agent — reuse an existing agent and add a skill when the outcome fits.</p>
        <button class="wf-btn" data-go="managed-1">Request managed setup</button>`,
      },
      "chat-intent": {
        eyebrow: "FUTURE CONCEPT · AGENT CREATION",
        title: "Build your agent in Chat",
        subtitle:
          "A guided conversation asks focused questions rather than exposing a technical setup form. Builder stays inside Voice Agents.",
        body: `<div class="wf-callout future"><strong>Meera · Agent builder</strong><p>What job do you want this agent to handle?</p></div>
        <p>Handle inbound calls · Qualify leads · Appointment requests</p>
        <div class="wf-panel"><div class="wf-panel-head">Live agent brief</div><div class="wf-panel-body">Role: Voice receptionist · Business: Purple Basil Medspa</div></div>`,
      },
      "chat-goals": {
        eyebrow: "FUTURE CONCEPT · GOALS & KPIs",
        title: "Connect your agent to business goals",
        subtitle: "Meera proposes KPIs; the customer selects what should be measured.",
        body: `<ul><li>✓ Answered calls by time period</li><li>✓ Captured contact details</li><li>○ Qualified enquiries · needs agreed definition</li><li>○ Booked consultations · requires verified CRM/calendar</li></ul>`,
      },
      "chat-tasks": {
        eyebrow: "FUTURE CONCEPT · TASKS & CONTROLS",
        title: "Review the agent's plan and permissions",
        subtitle: "Turn approved goals and KPIs into tasks, skills and a clear human approval policy.",
        body: `<ol><li>Import and verify business FAQs</li><li>Connect inbound call provider and CRM</li><li>Configure handoff and notification conditions</li></ol>
        <p class="wf-footnote">Goal → KPI → Plan tasks → Agent skills → Voice outcomes.</p>`,
      },
    };
    const x = map[id];
    return page({
      eyebrow: x.eyebrow,
      title: x.title,
      subtitle: x.subtitle,
      showVoiceTabs: false,
      showReporting: false,
      body: x.body,
    });
  }

  function renderManaged(n) {
    if (n === 1) {
      return page({
        eyebrow: "AVAILABLE PATH · MANAGED SETUP",
        title: "Request a voice agent",
        subtitle:
          "The current path is team-managed setup with a clear request and review state. Creation will be handled by Limitless for now.",
        showVoiceTabs: false,
        body: `
          <div class="wf-panel"><div class="wf-panel-head">What our setup team configures</div><div class="wf-panel-body">
            Agent persona and voice, permitted skills, business knowledge, ElevenLabs and CRM routing, evaluation data and guardrails.
          </div></div>
          <p><strong>Business</strong> · Purple Basil Medspa</p>
          <p><strong>Recommended persona</strong> · Voice receptionist</p>
          <button class="wf-btn primary" disabled>Submit request (wireframe)</button>`,
      });
    }
    return page({
      eyebrow: "AVAILABLE PATH · MANAGED SETUP",
      title: "Agent setup progress",
      subtitle: "Customer-facing visibility into a managed setup without exposing internal CRM credentials.",
      showVoiceTabs: false,
      body: `<ul class="wf-steps">
        <li><strong>01 Request received</strong> · Completed — Your objective and business details are captured</li>
        <li><strong>02 Agent configuration</strong> · In progress — Limitless prepares skills, voice, integrations and data</li>
        <li><strong>03 Test and review</strong> · Pending — Test recordings, outputs and handoff rules will be reviewed</li>
        <li><strong>04 Activate agent</strong> · Requires approval — Go-live waits for required checks and customer authorisation</li>
      </ul>`,
    });
  }

  function renderInternal(n) {
    const row = voiceCrmRow();
    const base = {
      eyebrow: "INTERNAL · CONTROL PLANE · ADMIN ACCESS ONLY",
      showVoiceTabs: false,
      showReporting: false,
    };
    if (n === 1) {
      return page({
        ...base,
        title: "Customer registry",
        subtitle: "Use this internal view for production routing, model readiness and tenant-scoped diagnostics.",
        internalScreen: "internal-1",
        body: `
          <div class="wf-env-bar"><span class="wf-pill ok">Production</span><span class="wf-list-meta">2 customer records shown in source examples. Production is the default.</span></div>
          <div class="wf-panel"><div class="wf-panel-body">
            <p><strong>Purple Basil Medspa</strong> <span class="wf-pill ok">Ready</span></p>
            <p class="wf-list-meta">Mia · ElevenLabs · Twenty workspace · timezone America/Chicago</p>
            <button type="button" class="wf-btn" data-go="internal-2">Open routing editor</button>
          </div></div>`,
      });
    }
    if (n === 2) {
      return page({
        ...base,
        title: "Routing editor",
        subtitle: "Edit the internal agent-to-CRM handoff; never expose provider secrets in the customer workspace.",
        internalScreen: "internal-2",
        body: `
          <div class="wf-form-grid">
            <div class="wf-field"><label>Customer ID</label><input disabled value="${escapeHtml(row?.customer_id || "purple-basil-medspa")}" /></div>
            <div class="wf-field"><label>Display name</label><input disabled value="${escapeHtml(row?.display_name || "Purple Basil Medspa")}" /></div>
            <div class="wf-field"><label>ElevenLabs agent IDs</label><input disabled value="${escapeHtml(DATA.agent.agent_id)}" /></div>
            <div class="wf-field"><label>Agent display names</label><input disabled value="Mia" /></div>
            <div class="wf-field"><label>Twenty workspace ID</label><input disabled value="${escapeHtml(row?.twenty_workspace_id || "")}" /></div>
            <div class="wf-field"><label>Notification recipients</label><input disabled value="${escapeHtml((row?.notify_emails || []).join(", "))}" /></div>
            <div class="wf-field"><label>Twenty API secret reference</label><input disabled value="${escapeHtml(row?.twenty_api_key_secret_ref || "")}" /></div>
            <div class="wf-field"><label>Voice lead email timezone</label><input disabled value="${escapeHtml(row?.voice_lead_email_timezone || "America/Chicago")}" /></div>
          </div>
          <button class="wf-btn primary" disabled style="margin-top:12px">Save routing (wireframe)</button>`,
      });
    }
    return page({
      ...base,
      title: "Tool-call diagnostics",
      subtitle: "An internal evidence trail for customer routing, provider execution and failures.",
      internalScreen: "internal-3",
      body: `
        <div class="wf-env-bar"><span class="wf-pill ok">Production</span><span>Last 30 days</span><span>Agent · Mia</span></div>
        <div class="wf-panel"><div class="wf-panel-head">Lookup contact · Call sample</div><div class="wf-panel-body">
          <p class="wf-pill ok">Succeeded</p>
          <p class="wf-list-meta">Tenant: Purple Basil Medspa · Tool: request_human_review</p>
        </div></div>
        <p class="wf-footnote">Customers receive safe call summaries and verified outcomes, not this internal audit view.</p>`,
    });
  }

  function renderBriefing() {
    const c = followUpCall();
    return page({
      eyebrow: "VOICE AGENTS · CUSTOMER",
      title: "Follow-ups to review",
      subtitle: "Turn actionable voice conversations into owned CRM tasks and Briefing decisions.",
      activeTab: "overview",
      showReporting: false,
      body: c
        ? `<div class="wf-panel"><div class="wf-panel-head">Follow-up candidate · ${escapeHtml(callerLabel(c))}</div><div class="wf-panel-body">
            <p><strong>Why now</strong> · ${escapeHtml(c.data_collection?.urgency || "Customer follow-up requested")}</p>
            <p><strong>Source</strong> · Voice call · ${escapeHtml(fmtDate(c.start_time_unix_secs))}</p>
            <p><strong>Linked contact</strong> · ${escapeHtml(c.data_collection?.phone || "CRM contact record")}</p>
            <button class="wf-btn primary" disabled>Create task for approval</button>
            <p class="wf-footnote">Avoid duplicate tasks — match to the existing CRM contact before creating a new follow-up.</p>
          </div></div>`
        : "<p>No follow-up candidate in loaded sample.</p>",
    });
  }

  function renderProtoNav() {
    let html = "<h2>PDF V2 slice</h2>";
    let g = "";
    SCREENS.forEach((s) => {
      if (s.group !== g) {
        html += `<div class="proto-section">${s.group}</div>`;
        g = s.group;
      }
      const active = state.screen === s.id || (s.id === "call-detail" && state.screen === "call-detail");
      const href = s.id === "call-detail" ? "#/call/" + (state.callId || conversations()[0]?.id || "") : "#/" + s.id;
      html += `<a href="${href}" class="${active ? "active" : ""}">${s.label}</a>`;
    });
    html += `<div class="proto-demo"><label><input type="checkbox" id="demo-empty" ${state.demoEmpty ? "checked" : ""}/> Demo empty tenant (PDF p.10)</label><p style="margin-top:8px">${DATA.generated_at_utc}</p></div>`;
    return html;
  }

  function bindEvents() {
    document.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", () => navigate(el.getAttribute("data-go")));
    });
    document.querySelectorAll("[data-call]").forEach((el) => {
      el.addEventListener("click", () => navigate("call-detail", el.getAttribute("data-call")));
    });
    document.querySelectorAll(".wf-tab").forEach((el) => {
      el.addEventListener("click", () => navigate(el.getAttribute("data-tab")));
    });
    document.querySelectorAll(".wf-range").forEach((el) => {
      el.addEventListener("click", () => {
        state.reportRange = el.getAttribute("data-range");
        render();
      });
    });
    const demo = document.getElementById("demo-empty");
    if (demo) {
      demo.onchange = () => {
        state.demoEmpty = demo.checked;
        navigate(state.demoEmpty ? "empty" : "overview");
        render();
      };
    }
    const exit = document.getElementById("exit-empty");
    if (exit) {
      exit.onclick = () => {
        state.demoEmpty = false;
        navigate("overview");
        render();
      };
    }
  }

  function render() {
    parseRoute();
    const map = {
      overview: renderOverview,
      "overview-ready": renderOverviewReady,
      calls: renderCalls,
      "call-detail": renderCallDetail,
      analytics: renderAnalytics,
      "analytics-detail": renderAnalyticsDetail,
      "analytics-trends": renderAnalyticsTrends,
      "analytics-quality": renderAnalyticsQuality,
      empty: renderEmpty,
      agent: renderAgent,
      templates: () => renderFuture("templates"),
      "chat-intent": () => renderFuture("chat-intent"),
      "chat-goals": () => renderFuture("chat-goals"),
      "chat-tasks": () => renderFuture("chat-tasks"),
      "managed-1": () => renderManaged(1),
      "managed-2": () => renderManaged(2),
      "internal-1": () => renderInternal(1),
      "internal-2": () => renderInternal(2),
      "internal-3": () => renderInternal(3),
      briefing: renderBriefing,
    };
    const fn = map[state.screen] || renderOverview;
    document.getElementById("main").innerHTML = fn();
    document.getElementById("proto").innerHTML = renderProtoNav();
    bindEvents();
  }

  window.addEventListener("hashchange", render);
  render();
})();
