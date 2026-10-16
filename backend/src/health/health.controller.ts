import { Controller, Get, Header } from '@nestjs/common';
import { HealthService, HealthCheck, HealthReport } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Machine-readable health check (for uptime monitors, frontends, CI). */
  @Get('health')
  health(): Promise<HealthReport> {
    return this.healthService.report();
  }

  /** Minimalist status page shown when opening the API root in a browser. */
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async statusPage(): Promise<string> {
    const report = await this.healthService.report();
    return renderStatusPage(report);
  }
}

function renderStatusPage(report: HealthReport): string {
  const ok = report.status === 'ok';
  const row = (name: string, check: HealthCheck) => `
      <div class="row">
        <span class="dot ${check.status}"></span>
        <span class="name">${name}</span>
        <span class="meta">${check.status === 'up' ? `${check.latency_ms} ms` : 'down'}${
          check.detail ? ` · ${escapeHtml(check.detail)}` : ''
        }</span>
      </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TaskBuddy API — ${ok ? 'OK' : 'Degraded'}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; margin: 0; }
  body {
    font: 15px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: #fafafa; color: #1a1a1a;
    display: grid; place-items: center; min-height: 100vh; padding: 24px;
  }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } }
  main { width: 100%; max-width: 420px; }
  h1 { font-size: 17px; font-weight: 600; letter-spacing: .02em; }
  .sub { opacity: .55; font-size: 13px; margin: 4px 0 28px; }
  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 0; border-top: 1px solid rgba(128,128,128,.25);
  }
  .row:last-of-type { border-bottom: 1px solid rgba(128,128,128,.25); }
  .name { flex: 1; }
  .meta { opacity: .55; font-size: 13px; text-align: right; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .dot.up { background: #22c55e; }
  .dot.down { background: #ef4444; }
  footer { margin-top: 28px; font-size: 12px; opacity: .45; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>TaskBuddy API ${ok ? '· all systems go' : '· degraded'}</h1>
  <p class="sub">uptime ${formatUptime(report.uptime_s)} · ${report.timestamp}${report.commit ? ` · ${report.commit.slice(0, 7)}` : ''}</p>
  <div class="row">
    <span class="dot up"></span>
    <span class="name">api</span>
    <span class="meta">running</span>
  </div>
  ${row('database (supabase)', report.checks.database)}
  ${row('ml service', report.checks.ml_service)}
  <footer>JSON: <a href="/health">/health</a> · docs: backend/README.md</footer>
</main>
</body>
</html>`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
