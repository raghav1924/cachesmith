/**
 * CacheSmith Bento Grid Web Studio Server
 * Embedded visual dashboard featuring real-time Cache Stampede canvas simulation,
 * RFC 9111 Header Audit Linter, Key Normalizer, and Framework Code Generator.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import http from 'http';
import { CacheEngine, StampedeSimulator } from '../core/cache.js';
import { CacheKeyNormalizer } from '../core/keyNormalizer.js';
import { CacheLinter } from '../core/linter.js';
import { MiddlewareGenerator } from '../generators/middlewareGen.js';
import { FrameworkType } from '../types.js';

export class StudioServer {
  private server: http.Server | null = null;

  constructor(private port = 6969) {}

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://localhost:${this.port}`);

        // API: Simulate Cache Stampede
        if (req.method === 'POST' && url.pathname === '/api/simulate') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const workers = Number(data.workers) || 100;
              const naive = await StampedeSimulator.run('naive', workers);
              const mutex = await StampedeSimulator.run('mutex-singleflight', workers);
              const xfetch = await StampedeSimulator.run('xfetch-probabilistic', workers);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ naive, mutex, xfetch }));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // API: Audit Headers
        if (req.method === 'POST' && url.pathname === '/api/audit') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const headers: Record<string, string> = data.headers || {};
              const statusCode = Number(data.statusCode) || 200;
              const testUrl = data.url || 'https://api.example.com/v1/products';
              const audit = CacheLinter.auditHeaders(headers, statusCode, testUrl);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(audit));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // API: Normalize URL Key
        if (req.method === 'POST' && url.pathname === '/api/normalize') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const result = CacheKeyNormalizer.normalize(data.url || '');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // API: Generate Middleware
        if (req.method === 'POST' && url.pathname === '/api/generate') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const framework = (data.framework || 'nextjs') as FrameworkType;
              const result = MiddlewareGenerator.generate(framework, {
                ttlSeconds: Number(data.ttl) || 60,
                swrSeconds: Number(data.swr) || 86400
              });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Serve HTML Studio Dashboard
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderHtml());
      });

      this.server.listen(this.port, () => resolve(this.port));
      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }

  private renderHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CacheSmith Studio | Edge & HTTP Cache Linter & Stampede Simulator</title>
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 23, 42, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(0, 240, 255, 0.25);
      --cyan: #00f0ff;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --purple: #a855f7;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(circle at 15% 15%, rgba(0, 240, 255, 0.04) 0%, transparent 40%),
        radial-gradient(circle at 85% 85%, rgba(168, 85, 247, 0.04) 0%, transparent 40%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      padding: 24px;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-badge {
      background: linear-gradient(135deg, var(--cyan), var(--purple));
      color: #000;
      font-weight: 900;
      font-size: 18px;
      padding: 6px 14px;
      border-radius: 8px;
      letter-spacing: -0.5px;
      box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
    }

    .brand h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .brand p {
      font-size: 13px;
      color: var(--text-muted);
    }

    .author-badge {
      font-size: 12px;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 12px;
      border-radius: 20px;
      border: 1px solid var(--border);
    }

    .author-badge a {
      color: var(--cyan);
      text-decoration: none;
      font-weight: 600;
    }

    /* Bento Grid Layout */
    .bento-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 20px;
    }

    .bento-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .bento-card:hover {
      border-color: var(--border-accent);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    }

    .card-stampede { grid-column: span 8; }
    .card-metrics { grid-column: span 4; }
    .card-linter { grid-column: span 7; }
    .card-normalizer { grid-column: span 5; }
    .card-generator { grid-column: span 12; }

    .card-title {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--cyan);
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 20px;
    }

    /* Form Controls */
    input, textarea, select {
      width: 100%;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 13px;
      margin-bottom: 12px;
      transition: border-color 0.2s;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--cyan);
    }

    button {
      background: linear-gradient(135deg, var(--cyan), #0099ff);
      color: #000;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: transform 0.15s, opacity 0.15s;
    }

    button:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    /* Simulation Canvas */
    .sim-canvas-box {
      background: #000;
      border-radius: 10px;
      border: 1px solid var(--border);
      height: 220px;
      position: relative;
      display: flex;
      align-items: flex-end;
      padding: 16px;
      gap: 12px;
    }

    .sim-bar-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
      gap: 8px;
    }

    .sim-bar {
      width: 48px;
      border-radius: 6px 6px 0 0;
      transition: height 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }

    .bar-naive { background: linear-gradient(to top, var(--rose), #fb7185); }
    .bar-mutex { background: linear-gradient(to top, var(--amber), #fde047); }
    .bar-xfetch { background: linear-gradient(to top, var(--emerald), var(--cyan)); }

    .bar-label {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      text-align: center;
    }

    .bar-val {
      font-size: 13px;
      font-weight: 800;
      color: #fff;
    }

    /* Metric Cards */
    .metric-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .metric-item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .metric-item .name {
      font-size: 13px;
      color: var(--text-muted);
    }

    .metric-item .value {
      font-size: 18px;
      font-weight: 800;
      font-family: var(--font-mono);
    }

    .grade-badge {
      display: inline-block;
      font-size: 32px;
      font-weight: 900;
      padding: 8px 24px;
      border-radius: 12px;
      letter-spacing: -1px;
    }

    .grade-A { background: rgba(16, 185, 129, 0.2); color: var(--emerald); border: 1px solid var(--emerald); }
    .grade-F { background: rgba(244, 63, 94, 0.2); color: var(--rose); border: 1px solid var(--rose); }

    /* Code block */
    pre code {
      display: block;
      background: #000;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #cbd5e1;
      overflow-x: auto;
      max-height: 280px;
    }

    .issue-item {
      background: rgba(0, 0, 0, 0.4);
      border-left: 4px solid var(--rose);
      padding: 10px 14px;
      margin-bottom: 8px;
      border-radius: 0 6px 6px 0;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="logo-badge">CS</div>
      <div>
        <h1>CacheSmith Studio</h1>
        <p>Edge & Distributed HTTP Cache Linter, XFetch Calculator & Stampede Simulator</p>
      </div>
    </div>
    <div class="author-badge">
      Engineered by <a href="https://jatinsh.netlify.app/" target="_blank">Jatin Sharma</a>
    </div>
  </header>

  <div class="bento-grid">
    <!-- Card 1: Stampede Simulator Canvas -->
    <div class="bento-card card-stampede">
      <div class="card-title">⚡ Cache Stampede Simulator (Thundering Herd)</div>
      <p class="card-desc">Simulate 100 concurrent workers requesting an expired hot cache key across 3 concurrency strategies.</p>
      
      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <button id="btnRunSim" onclick="runSimulation()">▶ Run Simulation (100 Workers)</button>
        <span id="simStatus" style="font-size: 12px; color: var(--text-muted); align-self: center;">Ready to benchmark</span>
      </div>

      <div class="sim-canvas-box">
        <div class="sim-bar-group">
          <div class="bar-val" id="naiveVal">100%</div>
          <div class="sim-bar bar-naive" id="barNaive" style="height: 100%;"></div>
          <div class="bar-label">Naive Cache<br>(100 DB Hits)</div>
        </div>
        <div class="sim-bar-group">
          <div class="bar-val" id="mutexVal">1%</div>
          <div class="sim-bar bar-mutex" id="barMutex" style="height: 10%;"></div>
          <div class="bar-label">Mutex Singleflight<br>(1 DB Hit)</div>
        </div>
        <div class="sim-bar-group">
          <div class="bar-val" id="xfetchVal">1%</div>
          <div class="sim-bar bar-xfetch" id="barXfetch" style="height: 10%;"></div>
          <div class="bar-label">XFetch Probabilistic<br>(1 Pre-emptive Hit)</div>
        </div>
      </div>
    </div>

    <!-- Card 2: Resilience Metrics -->
    <div class="bento-card card-metrics">
      <div class="card-title">📊 Edge Performance Metrics</div>
      <p class="card-desc">Quantified stampede mitigation.</p>
      <div class="metric-list">
        <div class="metric-item">
          <span class="name">DB Query Reduction</span>
          <span class="value" style="color: var(--emerald);" id="mReduction">99.0%</span>
        </div>
        <div class="metric-item">
          <span class="name">P95 Latency (Naive)</span>
          <span class="value" style="color: var(--rose);" id="mP95Naive">65ms</span>
        </div>
        <div class="metric-item">
          <span class="name">P95 Latency (XFetch)</span>
          <span class="value" style="color: var(--cyan);" id="mP95Xfetch">0.2ms</span>
        </div>
      </div>
    </div>

    <!-- Card 3: Cache-Control Header Linter -->
    <div class="bento-card card-linter">
      <div class="card-title">🔍 RFC 9111 Header Audit Linter</div>
      <p class="card-desc">Paste HTTP response headers to test 16 RFC caching rules, check security leaks, and get an edge grade.</p>
      <textarea id="linterHeaders" rows="5">Cache-Control: public, max-age=3600
Vary: Accept-Encoding
ETag: "686897696a7c876b7e"
Set-Cookie: session_token=xyz123</textarea>
      <button onclick="auditHeaders()">Audit Headers</button>
      <div id="linterResult" style="margin-top: 16px;"></div>
    </div>

    <!-- Card 4: Key Normalizer -->
    <div class="bento-card card-normalizer">
      <div class="card-title">🔑 Cache Key Normalizer</div>
      <p class="card-desc">Strip tracking params, sort query strings & hash with SHA-256.</p>
      <input type="text" id="normUrl" value="https://api.shop.com/products?utm_source=twitter&b=shoes&a=men&fbclid=123" />
      <button onclick="normalizeUrl()">Normalize & Hash</button>
      <div id="normResult" style="margin-top: 16px; font-family: var(--font-mono); font-size: 11px;"></div>
    </div>

    <!-- Card 5: Framework Code Generator -->
    <div class="bento-card card-generator">
      <div class="card-title">⚡ Production Cache Middleware Generator</div>
      <p class="card-desc">Export verified caching middleware with SWR and ETag support.</p>
      <div style="display: flex; gap: 12px; margin-bottom: 12px; max-width: 400px;">
        <select id="genFramework" onchange="generateCode()">
          <option value="nextjs">Next.js 14/15 App Router</option>
          <option value="express">Express.js (XFetch)</option>
          <option value="fastify">Fastify Plugin</option>
          <option value="cloudflare">Cloudflare Workers KV</option>
          <option value="hono">Hono Edge Middleware</option>
          <option value="fastapi">FastAPI Python</option>
        </select>
        <button onclick="generateCode()">Generate</button>
      </div>
      <pre><code id="genCode">// Code will appear here...</code></pre>
    </div>
  </div>

  <script>
    async function runSimulation() {
      const btn = document.getElementById('btnRunSim');
      const status = document.getElementById('simStatus');
      btn.disabled = true;
      status.innerText = 'Simulating 100 concurrent workers...';

      try {
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workers: 100 })
        });
        const data = await res.json();
        
        document.getElementById('naiveVal').innerText = data.naive.totalDbQueries + ' DB Hits';
        document.getElementById('mutexVal').innerText = data.mutex.totalDbQueries + ' DB Hit';
        document.getElementById('xfetchVal').innerText = data.xfetch.totalDbQueries + ' DB Hit';

        document.getElementById('barNaive').style.height = '100%';
        document.getElementById('barMutex').style.height = (data.mutex.totalDbQueries / data.naive.totalDbQueries * 100) + '%';
        document.getElementById('barXfetch').style.height = (data.xfetch.totalDbQueries / data.naive.totalDbQueries * 100) + '%';

        document.getElementById('mReduction').innerText = (100 - (data.xfetch.totalDbQueries / data.naive.totalDbQueries * 100)).toFixed(1) + '%';
        document.getElementById('mP95Naive').innerText = data.naive.p95LatencyMs.toFixed(1) + 'ms';
        document.getElementById('mP95Xfetch').innerText = data.xfetch.p95LatencyMs.toFixed(1) + 'ms';

        status.innerText = 'Simulation completed successfully!';
      } catch (e) {
        status.innerText = 'Error running simulation.';
      } finally {
        btn.disabled = false;
      }
    }

    async function auditHeaders() {
      const raw = document.getElementById('linterHeaders').value;
      const headers = {};
      raw.split('\\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
          headers[parts[0].trim()] = parts.slice(1).join(':').trim();
        }
      });

      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, statusCode: 200 })
      });
      const data = await res.json();
      
      let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
      html += '<div><strong>Grade: ' + data.grade + '</strong> (' + data.score + '/100)</div>';
      html += '</div>';

      if (data.issues.length === 0) {
        html += '<p style="color:var(--emerald);">✔ Clean headers! Fully RFC 9111 compliant.</p>';
      } else {
        data.issues.forEach(iss => {
          const color = iss.severity === 'CRITICAL' ? 'var(--rose)' : iss.severity === 'HIGH' ? 'var(--amber)' : 'var(--cyan)';
          html += '<div class="issue-item" style="border-left-color:' + color + ';">';
          html += '<strong>[' + iss.code + ' ' + iss.severity + ']</strong> ' + iss.message + '<br>';
          html += '<span style="color:var(--text-muted);">' + iss.recommendation + '</span>';
          html += '</div>';
        });
      }
      document.getElementById('linterResult').innerHTML = html;
    }

    async function normalizeUrl() {
      const url = document.getElementById('normUrl').value;
      const res = await fetch('/api/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      let html = '<div style="background:#000; padding:12px; border-radius:8px; border:1px solid var(--border);">';
      html += '<div><span style="color:var(--cyan)">Normalized URL:</span> ' + data.normalizedUrl + '</div>';
      html += '<div style="margin-top:6px;"><span style="color:var(--purple)">SHA-256 Key:</span> ' + data.cacheKeySha256 + '</div>';
      html += '<div style="margin-top:6px;"><span style="color:var(--amber)">Stripped Params:</span> ' + (data.strippedTrackingParams.join(', ') || 'None') + '</div>';
      html += '<div style="margin-top:6px;"><span style="color:var(--emerald)">Risk:</span> ' + data.cardinalityRisk + ' - ' + data.explanation + '</div>';
      html += '</div>';
      document.getElementById('normResult').innerHTML = html;
    }

    async function generateCode() {
      const framework = document.getElementById('genFramework').value;
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework, ttl: 60, swr: 86400 })
      });
      const data = await res.json();
      document.getElementById('genCode').innerText = data.code;
    }

    // Initialize
    window.addEventListener('DOMContentLoaded', () => {
      generateCode();
      auditHeaders();
    });
  </script>
</body>
</html>
`;
  }
}
