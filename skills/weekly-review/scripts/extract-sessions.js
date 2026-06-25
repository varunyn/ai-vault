#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildReport } = require("./session-report-lib");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.status && !["done", "in-progress", "blocked", "note"].includes(args.status)) {
    throw new Error("--status must be done, in-progress, blocked, or note.");
  }
  const report = await buildReport({
    sessionsRoot: args["sessions-root"] || path.join(os.homedir(), ".codex", "sessions"),
    inputs: args.input,
    scope: args.scope || (args.input.length ? "input" : (args.from || args.to ? "range" : "current")),
    from: args.from,
    to: args.to,
    redact: Boolean(args.redact),
    status: args.status,
    maxItems: numberArg(args["max-items"], 6),
    maxSnippet: numberArg(args["max-snippet"], 220),
    maxSessions: numberArg(args["max-sessions"], undefined),
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, json);
  } else {
    process.stdout.write(json);
  }
}

function parseArgs(argv) {
  const parsed = { input: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") parsed.input.push(argv[++index]);
    else if (arg.startsWith("--input=")) parsed.input.push(arg.slice("--input=".length));
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) parsed[key] = true;
      else { parsed[key] = next; index += 1; }
    }
  }
  return parsed;
}

function numberArg(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) throw new Error("Numeric limits must be positive.");
  return number;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
