const fs = require("fs");
const path = require("path");
const readline = require("readline");

async function buildReport(options = {}) {
  const now = options.now || new Date();
  const scope = options.scope || (options.inputs?.length ? "input" : (options.from || options.to ? "range" : "current"));
  const range = resolveRange({ scope, from: options.from, to: options.to, now });
  const files = resolveFiles({
    sessionsRoot: options.sessionsRoot,
    inputs: options.inputs || [],
    scope,
    range,
    maxSessions: options.maxSessions ?? (scope === "current" ? 1 : Number.POSITIVE_INFINITY),
  });

  if (!files.length) {
    throw new Error(`No Codex session files found for scope "${scope}".`);
  }

  const sessions = [];
  for (const file of files) {
    sessions.push(...await parseSession(file, {
      current: scope === "current",
      maxItems: options.maxItems || 6,
      maxSnippet: options.maxSnippet || 220,
      redact: Boolean(options.redact),
      status: options.status,
    }));
  }
  sessions.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

  return {
    generatedAt: now.toISOString(),
    scope,
    range,
    sourceCount: files.length,
    sessions,
  };
}

function resolveRange({ scope, from, to, now }) {
  const today = localDate(now);
  if (from || to) {
    const range = { from: from || today, to: to || today };
    validateRange(range);
    return range;
  }
  if (scope === "week") {
    return { from: shiftDate(today, -6), to: today };
  }
  if (scope === "today" || scope === "current" || scope === "input" || scope === "range") {
    return { from: today, to: today };
  }
  if (isDate(scope)) {
    return { from: scope, to: scope };
  }
  throw new Error(`Unsupported scope "${scope}". Use current, today, week, YYYY-MM-DD, or --from/--to.`);
}

function resolveFiles({ sessionsRoot, inputs, scope, range, maxSessions }) {
  if (inputs.length) {
    return inputs.map((file) => path.resolve(file));
  }
  if (!sessionsRoot || !fs.existsSync(sessionsRoot)) {
    return [];
  }
  if (scope === "current") {
    return listAllDatedJsonl(sessionsRoot)
      .sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime)
      .slice(0, 1)
      .map(({ file }) => file);
  }
  return listRangeJsonl(sessionsRoot, range)
    .sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime)
    .slice(0, maxSessions)
    .map(({ file }) => file);
}

function listRangeJsonl(sessionsRoot, range) {
  const entries = [];
  for (let date = range.from; date <= range.to; date = shiftDate(date, 1)) {
    const [year, month, day] = date.split("-");
    entries.push(...listJsonl(path.join(sessionsRoot, year, month, day), date));
  }
  return entries;
}

function listAllDatedJsonl(sessionsRoot) {
  const entries = [];
  for (const year of listDirs(sessionsRoot)) {
    for (const month of listDirs(path.join(sessionsRoot, year))) {
      for (const day of listDirs(path.join(sessionsRoot, year, month))) {
        const date = `${year}-${month}-${day}`;
        if (isDate(date)) {
          entries.push(...listJsonl(path.join(sessionsRoot, year, month, day), date));
        }
      }
    }
  }
  return entries;
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function listJsonl(dir, date) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => {
      const file = path.join(dir, name);
      return { file, date, mtime: fs.statSync(file).mtimeMs };
    });
}

async function parseSession(file, options) {
  const source = {
    file,
    id: "",
    startedAt: "",
    cwd: "",
    model: "",
    tasks: [],
    activeTask: null,
  };
  const input = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    collectEvent(source, event, options);
  }
  finalizeTask(source, options);
  return source.tasks.map((task, index) => toTaskEntry(source, task, index, options));
}

function collectEvent(source, event, options) {
  const compact = (value) => sanitizeSnippet(value, options);
  if (event.type === "session_meta") {
    source.id = event.payload?.id || source.id;
    source.startedAt = event.payload?.timestamp || event.timestamp || source.startedAt;
    source.cwd = event.payload?.cwd || source.cwd;
    source.model = event.payload?.model_provider || source.model;
    return;
  }
  if (event.type === "turn_context") {
    source.cwd = event.payload?.cwd || source.cwd;
    return;
  }
  if (event.type === "event_msg" && event.payload?.type === "agent_message") {
    if (source.activeTask && !isPolicyApprovalText(event.payload.message)) {
      pushUnique(source.activeTask.assistantUpdates, compact(event.payload.message));
    }
    return;
  }
  if (event.type !== "response_item") return;

  const payload = event.payload || {};
  if (payload.type === "message" && payload.role === "user") {
    const text = contentText(payload.content);
    if (isUsefulUserText(text)) {
      finalizeTask(source, options);
      source.activeTask = { request: compact(text), assistantUpdates: [], finalResponse: "" };
    }
  }
  if (payload.type === "message" && payload.role === "assistant") {
    const rawText = contentText(payload.content);
    if (isPolicyApprovalText(rawText)) return;
    const text = compact(rawText);
    if (source.activeTask && text) {
      if (payload.phase === "final_answer") recordAssistantText(source.activeTask, text);
      else pushUnique(source.activeTask.assistantUpdates, text);
    }
  }
}

function recordAssistantText(task, text) {
  pushUnique(task.assistantUpdates, text);
  task.finalResponse = text;
}

function finalizeTask(source, options) {
  const task = source.activeTask;
  if (!task) return;
  if (task.request && (task.finalResponse || options.current)) source.tasks.push(task);
  source.activeTask = null;
}

function toTaskEntry(source, task, index, options) {
  return {
    file: source.file,
    id: source.id,
    taskIndex: index + 1,
    startedAt: source.startedAt,
    cwd: source.cwd,
    model: source.model,
    userRequests: [task.request],
    assistantUpdates: task.assistantUpdates.slice(-options.maxItems),
    toolCalls: [],
    commandOutputs: [],
    title: inferTitle(task),
    summary: task.request,
    status: options.status || (options.current ? "in-progress" : inferStatus(task)),
    outcomes: inferOutcomes(task),
  };
}

function contentText(content) {
  if (!Array.isArray(content)) return "";
  return content.map((part) => part.text || "").join(" ").replace(/\s+/g, " ").trim();
}

function isUsefulUserText(text) {
  return Boolean(text)
    && !text.startsWith("# AGENTS.md instructions")
    && !text.startsWith("<skill>")
    && !text.startsWith("<environment_context>")
    && !text.startsWith("<permissions instructions>")
    && !text.startsWith("<INSTRUCTIONS>")
    && !text.startsWith("The following is the Codex agent history");
}

function isPolicyApprovalText(text) {
  const value = safeJson(String(text || "").trim());
  if (!value || typeof value !== "object" || Array.isArray(value) || !["allow", "deny"].includes(value.outcome)) {
    return false;
  }
  const policyKeys = new Set(["outcome", "risk_level", "user_authorization", "rationale"]);
  return Object.keys(value).every((key) => policyKeys.has(key));
}

function sanitizeSnippet(value, { maxSnippet, redact }) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  if (redact) text = redactText(text);
  return text.slice(0, maxSnippet);
}

function redactText(text) {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, "Bearer [REDACTED]")
    .replace(/\b(api[_-]?key|token|password)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

function summarizeOutput(output, maxSnippet) {
  const text = output.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const useful = text.match(/Process exited with code \d+.*?(Output:.*)?$/);
  return (useful ? useful[0] : text).slice(0, maxSnippet);
}

function inferTitle(task) {
  const request = task.request || "";
  if (/weekly-log|weekly log|session log|engineering log/i.test(request)) return "Generated Codex session log";
  if (/commit/i.test(request)) return "Prepared commit workflow";
  if (/fix|bug|error|broken/i.test(request)) return "Investigated issue";
  return request ? titleCase(request.replace(/^\[[^\]]+\]\([^)]*\)\s*/, "").slice(0, 72)) : "Codex session work";
}

function inferStatus(task) {
  const final = task.finalResponse || "";
  if (/\b(blocked|unable to proceed|cannot proceed)\b/i.test(final)) return "blocked";
  if (/^(done|updated|fixed|committed|created|added|installed|implemented|shipped|completed|verified|checked)\b/i.test(final)) return "done";
  return "note";
}

function inferOutcomes(task) {
  const outcomes = [];
  if (task.finalResponse) outcomes.push(task.finalResponse);
  return outcomes;
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

function titleCase(value) {
  const clean = value.replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Codex session work";
}

function localDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf());
}

function validateRange(range) {
  if (!isDate(range.from) || !isDate(range.to) || range.from > range.to) {
    throw new Error("Use valid YYYY-MM-DD dates with --from no later than --to.");
  }
}

module.exports = { buildReport, redactText, resolveRange };
