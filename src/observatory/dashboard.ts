export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plugin Hive Observatory</title>
<style>
  :root {
    --bg: #1a1a2e;
    --bg-card: #16213e;
    --bg-sidebar: #0f1629;
    --border: #2a2a4a;
    --text: #e0e0e0;
    --text-dim: #8888aa;
    --amber: #f5a623;
    --gold: #ffd700;
    --honey: #e8a317;
    --green: #2ecc71;
    --red: #e74c3c;
    --blue: #3498db;
    --purple: #9b59b6;
    --gray: #555;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 280px;
    min-width: 280px;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sidebar-header h2 {
    font-size: 14px;
    color: var(--amber);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  /* Nav Tabs */
  .nav-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .nav-tab {
    flex: 1;
    padding: 8px 4px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
  }
  .nav-tab:hover { color: var(--text); }
  .nav-tab.active { color: var(--amber); border-bottom-color: var(--amber); }

  .swarm-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .swarm-item {
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 4px;
    border: 1px solid transparent;
    transition: background 0.15s;
  }
  .swarm-item:hover { background: rgba(245, 166, 35, 0.08); }
  .swarm-item.active {
    background: rgba(245, 166, 35, 0.12);
    border-color: var(--amber);
  }
  .swarm-item .swarm-num {
    font-weight: 600;
    color: var(--gold);
    font-size: 13px;
  }
  .swarm-item .swarm-task {
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge-buzzing { background: rgba(52, 152, 219, 0.2); color: var(--blue); }
  .badge-completed { background: rgba(46, 204, 113, 0.2); color: var(--green); }
  .badge-failed { background: rgba(231, 76, 60, 0.2); color: var(--red); }
  .badge-cancelled { background: rgba(85, 85, 85, 0.2); color: var(--gray); }
  .badge-paused { background: rgba(155, 89, 182, 0.2); color: var(--purple); }
  .badge-scheduled { background: rgba(232, 163, 23, 0.2); color: var(--honey); }
  .badge-queued { background: rgba(232, 163, 23, 0.15); color: var(--amber); }

  /* Main */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Top Bar */
  .topbar {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-sidebar);
  }
  .topbar h1 {
    font-size: 18px;
    color: var(--gold);
    font-weight: 600;
  }
  .topbar h1 span { color: var(--text-dim); font-weight: 400; }
  .health-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .health-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green);
  }
  .health-dot.warning { background: var(--amber); }
  .health-dot.critical { background: var(--red); }

  /* Content */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-dim);
    font-size: 14px;
  }

  /* Cards */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .card-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    font-weight: 600;
    color: var(--amber);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .card-body { padding: 16px; }

  /* Stats Row */
  .stats-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .stat-card {
    flex: 1;
    min-width: 120px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--gold);
  }
  .stat-label {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  /* Trend bars */
  .trend-bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 60px;
    padding: 8px 0;
  }
  .trend-bar {
    flex: 1;
    min-width: 4px;
    border-radius: 2px 2px 0 0;
    transition: height 0.3s;
  }
  .trend-bar.completed { background: var(--green); }
  .trend-bar.failed { background: var(--red); }
  .trend-bar.started { background: var(--blue); opacity: 0.4; }

  /* Pipeline */
  .pipeline {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
  }
  .flight-node {
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--border);
    position: relative;
  }
  .flight-node.waiting { background: rgba(85, 85, 85, 0.2); color: var(--gray); }
  .flight-node.pending { background: rgba(155, 89, 182, 0.15); color: var(--purple); }
  .flight-node.in_flight { background: rgba(52, 152, 219, 0.2); color: var(--blue); border-color: var(--blue); }
  .flight-node.done { background: rgba(46, 204, 113, 0.15); color: var(--green); }
  .flight-node.failed { background: rgba(231, 76, 60, 0.15); color: var(--red); }
  .flight-node.gated { background: rgba(232, 163, 23, 0.15); color: var(--honey); border-color: var(--honey); }
  .pipeline-arrow {
    color: var(--text-dim);
    font-size: 14px;
  }

  /* Pulse progress */
  .pulse-bar-container {
    margin-top: 4px;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .pulse-bar-fill {
    height: 100%;
    background: var(--amber);
    border-radius: 2px;
    transition: width 0.3s;
  }

  /* Honeycomb Grid */
  .honeycomb {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
  }
  .hex-cell {
    width: 90px;
    height: 78px;
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    text-align: center;
    padding: 4px;
    line-height: 1.2;
    cursor: default;
  }
  .hex-cell.pending { background: var(--gray); color: #ccc; }
  .hex-cell.in_progress { background: var(--blue); color: #fff; }
  .hex-cell.verifying { background: var(--amber); color: #1a1a2e; }
  .hex-cell.done { background: var(--green); color: #1a1a2e; }
  .hex-cell.failed { background: var(--red); color: #fff; }

  /* Usage table */
  .usage-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .usage-table th {
    text-align: left;
    padding: 6px 8px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
    font-weight: 500;
  }
  .usage-table td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(42, 42, 74, 0.3);
  }

  /* Chain indicator */
  .chain-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    background: rgba(155, 89, 182, 0.2);
    color: var(--purple);
    margin-left: 8px;
  }

  /* Event Log */
  .event-log {
    max-height: 240px;
    overflow-y: auto;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
  }
  .event-row {
    padding: 4px 0;
    border-bottom: 1px solid rgba(42, 42, 74, 0.5);
    display: flex;
    gap: 12px;
  }
  .event-time { color: var(--text-dim); white-space: nowrap; }
  .event-type { color: var(--amber); white-space: nowrap; min-width: 140px; }
  .event-detail { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }
</style>
</head>
<body>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>Observatory</h2>
    </div>
    <div class="nav-tabs">
      <div class="nav-tab active" data-view="swarms">Swarms</div>
      <div class="nav-tab" data-view="fleet">Fleet</div>
      <div class="nav-tab" data-view="archives">Archives</div>
      <div class="nav-tab" data-view="config">Config</div>
    </div>
    <div class="swarm-list" id="swarm-list"></div>
  </div>
  <div class="main">
    <div class="topbar">
      <h1>Plugin Hive <span>Observatory</span></h1>
      <div class="health-indicator" id="health">
        <div class="health-dot" id="health-dot"></div>
        <span id="health-text">Healthy</span>
      </div>
    </div>
    <div class="content" id="content">
      <div class="empty-state">Select a swarm from the sidebar</div>
    </div>
  </div>

<script>
(function() {
  let selectedSwarm = null;
  let swarms = [];
  let beekeeperStatus = null;
  let currentView = 'swarms';

  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDuration(startedAt, completedAt) {
    if (!startedAt) return '';
    var start = new Date(startedAt.replace(' ', 'T') + 'Z');
    var end = completedAt ? new Date(completedAt.replace(' ', 'T') + 'Z') : new Date();
    var secs = Math.floor((end - start) / 1000);
    if (secs < 60) return secs + 's';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
    return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  }

  // --- Nav tabs ---
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      currentView = tab.dataset.view;
      document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      selectedSwarm = null;
      if (currentView === 'swarms') { renderSidebar(); renderEmpty(); }
      else if (currentView === 'fleet') { renderFleetSidebar(); renderFleetView(); }
      else if (currentView === 'archives') { renderArchiveSidebar(); }
      else if (currentView === 'config') { renderConfigSidebar(); renderConfigView(); }
    });
  });

  // --- Sidebar renderers ---
  function renderSidebar() {
    var list = document.getElementById('swarm-list');
    list.innerHTML = swarms.map(function(s) {
      var active = selectedSwarm && selectedSwarm.id === s.id ? ' active' : '';
      var task = s.task.length > 40 ? s.task.slice(0, 40) + '...' : s.task;
      var chainHtml = s.chain_id ? '<span class="chain-badge">chain</span>' : '';
      return '<div class="swarm-item' + active + '" data-id="' + s.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<span class="swarm-num">#' + s.swarm_number + chainHtml + '</span>'
        + '<span class="badge badge-' + s.status + '">' + s.status + '</span>'
        + '</div>'
        + '<div class="swarm-task">' + escapeHtml(task) + '</div>'
        + '</div>';
    }).join('');
    list.querySelectorAll('.swarm-item').forEach(function(el) {
      el.addEventListener('click', function() { selectSwarm(el.dataset.id); });
    });
  }

  function renderFleetSidebar() {
    document.getElementById('swarm-list').innerHTML = '<div style="padding:16px;color:var(--text-dim);font-size:12px">Fleet metrics view. No swarm selection needed.</div>';
  }

  async function renderArchiveSidebar() {
    var archives = (await fetchJSON('/api/archives')) || [];
    var list = document.getElementById('swarm-list');
    if (archives.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--text-dim);font-size:12px">No archived swarms</div>';
      renderEmpty();
      return;
    }
    list.innerHTML = archives.map(function(a) {
      var task = a.task.length > 40 ? a.task.slice(0, 40) + '...' : a.task;
      return '<div class="swarm-item" data-archive-id="' + a.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<span class="swarm-num">#' + a.swarm_number + '</span>'
        + '<span class="badge badge-' + a.original_status + '">' + a.original_status + '</span>'
        + '</div>'
        + '<div class="swarm-task">' + escapeHtml(task) + '</div>'
        + '<div class="swarm-task">Archived: ' + (a.archived_at || '').slice(0, 10) + '</div>'
        + '</div>';
    }).join('');
    list.querySelectorAll('.swarm-item').forEach(function(el) {
      el.addEventListener('click', async function() {
        var archive = await fetchJSON('/api/archives/' + el.dataset.archiveId);
        if (archive) renderArchiveDetail(archive);
      });
    });
    renderEmpty();
  }

  function renderConfigSidebar() {
    document.getElementById('swarm-list').innerHTML = '<div style="padding:16px;color:var(--text-dim);font-size:12px">Global hive configuration</div>';
  }

  // --- Select swarm ---
  async function selectSwarm(id) {
    var data = await fetchJSON('/api/swarms/' + id);
    if (!data) return;
    selectedSwarm = data.swarm;
    var flights = data.flights;
    var cells = (await fetchJSON('/api/swarms/' + id + '/cells')) || [];
    var events = (await fetchJSON('/api/swarms/' + id + '/events?limit=30')) || [];
    var pulses = (await fetchJSON('/api/swarms/' + id + '/pulses')) || [];
    var usage = (await fetchJSON('/api/swarms/' + id + '/usage')) || [];
    renderSidebar();
    renderSwarmDetail(selectedSwarm, flights, cells, events, pulses, usage);
  }

  function renderEmpty() {
    document.getElementById('content').innerHTML = '<div class="empty-state">Select an item from the sidebar</div>';
  }

  // --- Render swarm detail ---
  function renderSwarmDetail(swarm, flights, cells, events, pulses, usage) {
    var content = document.getElementById('content');
    var html = '';

    // Chain indicator
    if (swarm.chain_id) {
      html += '<div class="card"><div class="card-header">Chain</div><div class="card-body">'
        + '<span class="chain-badge">Chain: ' + swarm.chain_id.slice(0, 8) + '...</span>'
        + (swarm.parent_swarm_id ? ' Parent: ' + swarm.parent_swarm_id.slice(0, 8) + '...' : ' (root)')
        + '</div></div>';
    }

    // Pipeline with pulse bars
    html += '<div class="card"><div class="card-header">Flight Pipeline</div><div class="card-body"><div class="pipeline">';
    var regularFlights = flights.filter(function(f) { return !f.verify_meta; });
    regularFlights.forEach(function(f, i, arr) {
      var dur = formatDuration(f.started_at, f.completed_at);
      var durLabel = dur ? ' (' + dur + ')' : '';
      var pulseHtml = '';
      if (f.status === 'in_flight') {
        var flightPulses = (pulses || []).filter(function(p) { return p.flight_id === f.id; });
        if (flightPulses.length > 0) {
          var latest = flightPulses[0];
          var pct = Math.round(latest.progress * 100);
          pulseHtml = '<div class="pulse-bar-container"><div class="pulse-bar-fill" style="width:' + pct + '%"></div></div>'
            + '<div style="font-size:9px;color:var(--text-dim);margin-top:2px">' + escapeHtml(latest.step) + ' ' + pct + '%</div>';
        }
      }
      html += '<div class="flight-node ' + f.status + '" title="' + escapeHtml(f.flight_id) + durLabel + '">'
        + escapeHtml(f.flight_id) + (dur ? '<br><small>' + dur + '</small>' : '') + pulseHtml + '</div>';
      if (i < arr.length - 1) html += '<span class="pipeline-arrow">&#9654;</span>';
    });
    html += '</div></div></div>';

    // Honeycomb cells
    if (cells.length > 0) {
      var doneCount = cells.filter(function(c) { return c.status === 'done'; }).length;
      html += '<div class="card"><div class="card-header">Cells (' + doneCount + '/' + cells.length + ' done)</div><div class="card-body"><div class="honeycomb">';
      cells.forEach(function(c) {
        var label = c.title.length > 12 ? c.title.slice(0, 12) + '..' : c.title;
        html += '<div class="hex-cell ' + c.status + '" title="' + escapeHtml(c.title) + '">' + escapeHtml(label) + '</div>';
      });
      html += '</div></div></div>';
    }

    // Usage panel
    if (usage && usage.length > 0) {
      var totalIn = 0, totalOut = 0;
      usage.forEach(function(u) { totalIn += u.input_tokens; totalOut += u.output_tokens; });
      html += '<div class="card"><div class="card-header">Token Usage</div><div class="card-body">'
        + '<table class="usage-table"><tr><th>Bee</th><th>Input</th><th>Output</th><th>Total</th></tr>';
      // Aggregate by bee
      var byBee = {};
      usage.forEach(function(u) {
        if (!byBee[u.bee_id]) byBee[u.bee_id] = { input: 0, output: 0 };
        byBee[u.bee_id].input += u.input_tokens;
        byBee[u.bee_id].output += u.output_tokens;
      });
      Object.keys(byBee).forEach(function(bee) {
        var b = byBee[bee];
        html += '<tr><td>' + escapeHtml(bee) + '</td><td>' + b.input.toLocaleString() + '</td><td>' + b.output.toLocaleString() + '</td><td>' + (b.input + b.output).toLocaleString() + '</td></tr>';
      });
      html += '<tr style="font-weight:600"><td>Total</td><td>' + totalIn.toLocaleString() + '</td><td>' + totalOut.toLocaleString() + '</td><td>' + (totalIn + totalOut).toLocaleString() + '</td></tr>';
      html += '</table></div></div>';
    }

    // Event log
    if (events.length > 0) {
      html += '<div class="card"><div class="card-header">Event Log</div><div class="card-body"><div class="event-log">';
      events.forEach(function(e) {
        var time = e.created_at ? e.created_at.replace('T', ' ').slice(0, 19) : '';
        var payload = e.payload ? JSON.parse(e.payload) : {};
        var detail = Object.entries(payload).map(function(kv) { return kv[0] + '=' + kv[1]; }).join(' ');
        html += '<div class="event-row">'
          + '<span class="event-time">' + time + '</span>'
          + '<span class="event-type">' + escapeHtml(e.event_type) + '</span>'
          + '<span class="event-detail">' + escapeHtml(detail) + '</span>'
          + '</div>';
      });
      html += '</div></div></div>';
    }

    content.innerHTML = html;
  }

  // --- Fleet view ---
  async function renderFleetView() {
    var metrics = await fetchJSON('/api/metrics/fleet?period=30d');
    if (!metrics) { document.getElementById('content').innerHTML = '<div class="empty-state">No fleet data</div>'; return; }
    var content = document.getElementById('content');
    var html = '';

    // Stat cards
    html += '<div class="stats-row">'
      + '<div class="stat-card"><div class="stat-value">' + metrics.totals.swarms + '</div><div class="stat-label">Swarms (30d)</div></div>'
      + '<div class="stat-card"><div class="stat-value">' + metrics.totals.completed + '</div><div class="stat-label">Completed</div></div>'
      + '<div class="stat-card"><div class="stat-value">' + metrics.totals.failed + '</div><div class="stat-label">Failed</div></div>'
      + '<div class="stat-card"><div class="stat-value">' + Math.round(metrics.totals.success_rate * 100) + '%</div><div class="stat-label">Success Rate</div></div>'
      + '</div>';

    // Daily trend
    if (metrics.daily_trend && metrics.daily_trend.length > 0) {
      var maxCount = Math.max.apply(null, metrics.daily_trend.map(function(d) { return d.started; })) || 1;
      html += '<div class="card"><div class="card-header">Daily Trend (30d)</div><div class="card-body"><div class="trend-bars">';
      metrics.daily_trend.forEach(function(d) {
        var h = Math.max(4, Math.round((d.started / maxCount) * 52));
        var ch = Math.max(0, Math.round((d.completed / maxCount) * 52));
        var fh = Math.max(0, Math.round((d.failed / maxCount) * 52));
        html += '<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:1px;justify-content:flex-end;height:60px" title="' + d.date + ': ' + d.started + ' started, ' + d.completed + ' completed, ' + d.failed + ' failed">';
        if (fh > 0) html += '<div class="trend-bar failed" style="height:' + fh + 'px"></div>';
        if (ch > 0) html += '<div class="trend-bar completed" style="height:' + ch + 'px"></div>';
        html += '</div>';
      });
      html += '</div></div></div>';
    }

    // Per-blueprint table
    if (metrics.per_blueprint && metrics.per_blueprint.length > 0) {
      html += '<div class="card"><div class="card-header">Blueprints</div><div class="card-body">'
        + '<table class="usage-table"><tr><th>Blueprint</th><th>Swarms</th><th>Success</th><th>Avg Duration</th></tr>';
      metrics.per_blueprint.forEach(function(bp) {
        var dur = bp.avg_duration_seconds ? Math.round(bp.avg_duration_seconds) + 's' : '-';
        html += '<tr><td>' + escapeHtml(bp.blueprint_id) + '</td><td>' + bp.swarms + '</td><td>' + Math.round(bp.success_rate * 100) + '%</td><td>' + dur + '</td></tr>';
      });
      html += '</table></div></div>';
    }

    // Top bees
    if (metrics.top_bees && metrics.top_bees.length > 0) {
      html += '<div class="card"><div class="card-header">Top Bees</div><div class="card-body">'
        + '<table class="usage-table"><tr><th>Bee</th><th>Flights</th><th>Success Rate</th><th>Avg Duration</th></tr>';
      metrics.top_bees.forEach(function(b) {
        html += '<tr><td>' + escapeHtml(b.bee_id) + '</td><td>' + b.total_flights + '</td><td>' + Math.round(b.success_rate * 100) + '%</td><td>' + Math.round(b.avg_duration_seconds) + 's</td></tr>';
      });
      html += '</table></div></div>';
    }

    content.innerHTML = html;
  }

  // --- Archive detail ---
  function renderArchiveDetail(archive) {
    var content = document.getElementById('content');
    var data = {};
    try { data = JSON.parse(archive.data); } catch {}
    var html = '<div class="card"><div class="card-header">Archive: #' + archive.swarm_number + '</div><div class="card-body">'
      + '<p><strong>Blueprint:</strong> ' + escapeHtml(archive.blueprint_id) + '</p>'
      + '<p><strong>Task:</strong> ' + escapeHtml(archive.task) + '</p>'
      + '<p><strong>Status:</strong> ' + archive.original_status + '</p>'
      + '<p><strong>Archived:</strong> ' + (archive.archived_at || '') + '</p>'
      + '</div></div>';

    if (data.flights) {
      html += '<div class="card"><div class="card-header">Flights</div><div class="card-body"><div class="pipeline">';
      data.flights.forEach(function(f, i, arr) {
        html += '<div class="flight-node ' + f.status + '">' + escapeHtml(f.flight_id) + '</div>';
        if (i < arr.length - 1) html += '<span class="pipeline-arrow">&#9654;</span>';
      });
      html += '</div></div></div>';
    }
    content.innerHTML = html;
  }

  // --- Config view ---
  async function renderConfigView() {
    var config = (await fetchJSON('/api/config')) || [];
    var content = document.getElementById('content');
    var html = '<div class="card"><div class="card-header">Global Configuration</div><div class="card-body">'
      + '<table class="usage-table"><tr><th>Key</th><th>Value</th><th>Updated</th></tr>';
    config.forEach(function(c) {
      html += '<tr><td>' + escapeHtml(c.key) + '</td><td>' + escapeHtml(c.value) + '</td><td>' + (c.updated_at || '').slice(0, 19) + '</td></tr>';
    });
    html += '</table></div></div>';

    // Storage info
    var storage = await fetchJSON('/api/storage');
    if (storage) {
      html += '<div class="card"><div class="card-header">Storage</div><div class="card-body">'
        + '<p><strong>DB Size:</strong> ' + storage.db_size_display + '</p>';
      if (storage.table_counts) {
        html += '<table class="usage-table"><tr><th>Table</th><th>Rows</th></tr>';
        Object.keys(storage.table_counts).forEach(function(t) {
          html += '<tr><td>' + t + '</td><td>' + storage.table_counts[t] + '</td></tr>';
        });
        html += '</table>';
      }
      html += '</div></div>';
    }
    content.innerHTML = html;
  }

  // --- Health ---
  function updateHealth() {
    var dot = document.getElementById('health-dot');
    var text = document.getElementById('health-text');
    if (!beekeeperStatus) return;
    var issues = beekeeperStatus.current_stuck_flights + beekeeperStatus.current_stalled_swarms;
    if (issues === 0) {
      dot.className = 'health-dot';
      text.textContent = 'Healthy';
    } else if (issues <= 2) {
      dot.className = 'health-dot warning';
      text.textContent = issues + ' issue(s)';
    } else {
      dot.className = 'health-dot critical';
      text.textContent = issues + ' issues';
    }
  }

  // --- Poll ---
  async function poll() {
    swarms = (await fetchJSON('/api/swarms')) || [];
    beekeeperStatus = await fetchJSON('/api/beekeeper/status');
    updateHealth();

    if (currentView === 'swarms') {
      renderSidebar();
      if (selectedSwarm) {
        var data = await fetchJSON('/api/swarms/' + selectedSwarm.id);
        if (data) {
          selectedSwarm = data.swarm;
          var cells = (await fetchJSON('/api/swarms/' + selectedSwarm.id + '/cells')) || [];
          var events = (await fetchJSON('/api/swarms/' + selectedSwarm.id + '/events?limit=30')) || [];
          var pulses = (await fetchJSON('/api/swarms/' + selectedSwarm.id + '/pulses')) || [];
          var usage = (await fetchJSON('/api/swarms/' + selectedSwarm.id + '/usage')) || [];
          renderSwarmDetail(selectedSwarm, data.flights, cells, events, pulses, usage);
        }
      }
    }
  }

  poll();
  setInterval(poll, 5000);
})();
</script>
</body>
</html>`;
