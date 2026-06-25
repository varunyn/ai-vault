#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) fail("Missing --input compact JSON path.");

  const data = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  const skillDir = path.resolve(__dirname, "..");
  const templatePath = args.template ? path.resolve(args.template) : path.join(skillDir, "base-report.html");
  const template = fs.readFileSync(templatePath, "utf8");
  const entries = data.sessions.map(toEntry);
  const title = titleForScope(data.scope);
  const subtitle = subtitleFor(data, entries.length);
  const outPath = path.resolve(args.out || "codex-log.html");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderHtml({ template, title, subtitle, entries }));
  console.log(outPath);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) parsed[arg.slice(2)] = argv[++index];
  }
  return parsed;
}

function toEntry(session, index) {
  const id = `entry-${slug(`${session.id || "codex"}-${session.taskIndex || index + 1}-${session.title || "work"}`)}`;
  const sourceLabel = Array.isArray(session.sourceSessions) && session.sourceSessions.length > 0
    ? ["Source sessions", session.sourceSessions.join(", ")]
    : ["Source session", session.id || "unknown"];
  return {
    id,
    title: session.title || "Codex session work",
    status: session.status || "note",
    time: formatDate(session.startedAt),
    summary: session.summary || "Worked from local Codex session history.",
    details: session.outcomes?.length ? session.outcomes : ["No detailed outcomes were extracted."],
    meta: [sourceLabel, ["Workspace", basename(session.cwd || "")]],
  };
}

function renderHtml({ template, title, subtitle, entries }) {
  const style = extractStyle(template);
  const nav = entries.map((entry, index) => `<a href="#${escapeHtml(entry.id)}"${index === 0 ? ' class="active"' : ""}>${escapeHtml(entry.title)}</a>`).join("\n          ");
  const articles = entries.map(renderEntry).join("\n\n          ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>${style}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="page">
    <header class="topbar" aria-label="Breadcrumb"><span class="brand">Traces</span><span>/</span><span>codex log</span></header>
    <div class="layout">
      <aside class="sidebar" aria-label="On this page"><h2>On this page</h2><nav class="toc">${nav}</nav></aside>
      <main class="content" id="main"><section class="week-header"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></section><section class="entries" aria-label="Codex log entries">${articles}</section></main>
    </div>
  </div>
  <script>
    const tocLinks = [...document.querySelectorAll('.toc a')];
    const sections = tocLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const observer = new IntersectionObserver((entries) => entries.forEach(entry => {
      const link = tocLinks.find(item => item.getAttribute('href') === '#' + entry.target.id);
      if (link && entry.isIntersecting) { tocLinks.forEach(item => item.classList.remove('active')); link.classList.add('active'); }
    }), { rootMargin: '-30% 0px -55% 0px', threshold: 0.01 });
    sections.forEach(section => observer.observe(section));
    document.querySelectorAll('details').forEach((details) => {
      const summary = details.querySelector('summary');
      const syncLabel = () => { summary.textContent = details.open ? 'Hide details' : 'Show details'; };
      syncLabel(); details.addEventListener('toggle', syncLabel);
    });
  </script>
</body>
</html>`;
}

function renderEntry(entry) {
  const details = entry.details.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n                ");
  const meta = entry.meta.filter(([, value]) => value).map(([label, value]) => `<span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code>`).join("\n              ");
  return `<article class="entry" id="${escapeHtml(entry.id)}">
            <div class="entry-time">${escapeHtml(entry.time)}</div>
            <div class="entry-head"><h2 class="entry-title">${escapeHtml(entry.title)}</h2><span class="badge ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</span></div>
            <p class="entry-summary">${escapeHtml(entry.summary)}</p>
            <details open><summary>Hide details</summary><ul class="detail-list">${details}</ul></details>
            <div class="entry-meta">${meta}</div>
          </article>`;
}

function extractStyle(template) {
  const match = template.match(/<style>([\s\S]*?)<\/style>/);
  return match ? match[1].trim() : "";
}

function titleForScope(scope) {
  if (scope === "current") return "Codex Session Log";
  if (scope === "today") return "Today's Codex Log";
  if (scope === "week") return "Codex Weekly Log";
  if (scope === "range") return "Codex Engineering Log";
  if (/^\d{4}-\d{2}-\d{2}$/.test(scope || "")) return "Codex Daily Log";
  return "Codex Engineering Log";
}

function dateLabel(data) {
  if (data.range?.from && data.range?.to) {
    const from = formatDateOnly(data.range.from);
    const to = formatDateOnly(data.range.to);
    if (data.scope === "current") return `${from} - current session only`;
    return from === to ? from : `${from} – ${to}`;
  }
  const label = formatDate(data.sessions[0]?.startedAt || data.generatedAt);
  return data.scope === "current" ? `${label} - current session only` : label;
}

function subtitleFor(data, count) {
  const singular = data.entryLabel || "task entry";
  const plural = data.entryLabelPlural || pluralizeLabel(singular);
  return `${dateLabel(data)} - ${count} ${count === 1 ? singular : plural}`;
}

function pluralizeLabel(label) {
  return label.endsWith("y") ? `${label.slice(0, -1)}ies` : `${label}s`;
}

function formatDate(value) {
  if (!value) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function basename(value) { return value ? path.basename(value) : ""; }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "codex-entry"; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function fail(message) { console.error(message); process.exit(1); }

if (require.main === module) main();

module.exports = { dateLabel, renderHtml, subtitleFor, titleForScope, toEntry };
