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
  .pipeline-arrow {
    color: var(--text-dim);
    font-size: 14px;
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
      <h2>Swarms</h2>
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

  // --- Fetch helpers ---
  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  // --- Render sidebar ---
  function renderSidebar() {
    const list = document.getElementById('swarm-list');
    list.innerHTML = swarms.map(s => {
      const active = selectedSwarm && selectedSwarm.id === s.id ? ' active' : '';
      const task = s.task.length > 40 ? s.task.slice(0, 40) + '...' : s.task;
      return '<div class="swarm-item' + active + '" data-id="' + s.id + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center">'
        + '<span class="swarm-num">#' + s.swarm_number + '</span>'
        + '<span class="badge badge-' + s.status + '">' + s.status + '</span>'
        + '</div>'
        + '<div class="swarm-task">' + escapeHtml(task) + '</div>'
        + '</div>';
    }).join('');

    list.querySelectorAll('.swarm-item').forEach(el => {
      el.addEventListener('click', () => selectSwarm(el.dataset.id));
    });
  }

  // --- Select swarm ---
  async function selectSwarm(id) {
    const data = await fetchJSON('/api/swarms/' + id);
    if (!data) return;
    selectedSwarm = data.swarm;
    const flights = data.flights;
    const cells = await fetchJSON('/api/swarms/' + id + '/cells') || [];
    const events = await fetchJSON('/api/swarms/' + id + '/events?limit=30') || [];

    renderSidebar();
    renderSwarmDetail(selectedSwarm, flights, cells, events);
  }

  // --- Format duration ---
  function formatDuration(startedAt, completedAt) {
    if (!startedAt) return '';
    var start = new Date(startedAt.replace(' ', 'T') + 'Z');
    var end = completedAt ? new Date(completedAt.replace(' ', 'T') + 'Z') : new Date();
    var secs = Math.floor((end - start) / 1000);
    if (secs < 60) return secs + 's';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
    return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
  }

  // --- Render swarm detail ---
  function renderSwarmDetail(swarm, flights, cells, events) {
    const content = document.getElementById('content');
    let html = '';

    // Pipeline
    html += '<div class="card"><div class="card-header">Flight Pipeline</div><div class="card-body"><div class="pipeline">';
    flights.filter(f => !f.verify_meta).forEach((f, i, arr) => {
      var dur = formatDuration(f.started_at, f.completed_at);
      var durLabel = dur ? ' (' + dur + ')' : '';
      html += '<div class="flight-node ' + f.status + '" title="' + escapeHtml(f.flight_id) + durLabel + '">' + escapeHtml(f.flight_id) + (dur ? '<br><small>' + dur + '</small>' : '') + '</div>';
      if (i < arr.length - 1) html += '<span class="pipeline-arrow">&#9654;</span>';
    });
    html += '</div></div></div>';

    // Honeycomb cells
    if (cells.length > 0) {
      const doneCount = cells.filter(c => c.status === 'done').length;
      html += '<div class="card"><div class="card-header">Cells (' + doneCount + '/' + cells.length + ' done)</div><div class="card-body"><div class="honeycomb">';
      cells.forEach(c => {
        const label = c.title.length > 12 ? c.title.slice(0, 12) + '..' : c.title;
        html += '<div class="hex-cell ' + c.status + '" title="' + escapeHtml(c.title) + '">' + escapeHtml(label) + '</div>';
      });
      html += '</div></div></div>';
    }

    // Event log
    if (events.length > 0) {
      html += '<div class="card"><div class="card-header">Event Log</div><div class="card-body"><div class="event-log">';
      events.forEach(e => {
        const time = e.created_at ? e.created_at.replace('T', ' ').slice(0, 19) : '';
        const payload = e.payload ? JSON.parse(e.payload) : {};
        const detail = Object.entries(payload).map(function(kv) { return kv[0] + '=' + kv[1]; }).join(' ');
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

  // --- Health indicator ---
  function updateHealth() {
    const dot = document.getElementById('health-dot');
    const text = document.getElementById('health-text');
    if (!beekeeperStatus) return;
    const issues = beekeeperStatus.current_stuck_flights + beekeeperStatus.current_stalled_swarms;
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

  // --- Poll loop ---
  async function poll() {
    swarms = (await fetchJSON('/api/swarms')) || [];
    beekeeperStatus = await fetchJSON('/api/beekeeper/status');
    renderSidebar();
    updateHealth();

    if (selectedSwarm) {
      const data = await fetchJSON('/api/swarms/' + selectedSwarm.id);
      if (data) {
        selectedSwarm = data.swarm;
        const cells = (await fetchJSON('/api/swarms/' + selectedSwarm.id + '/cells')) || [];
        const events = (await fetchJSON('/api/swarms/' + selectedSwarm.id + '/events?limit=30')) || [];
        renderSwarmDetail(selectedSwarm, data.flights, cells, events);
      }
    }
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Initial load + poll every 5s
  poll();
  setInterval(poll, 5000);
})();
</script>
</body>
</html>`;
