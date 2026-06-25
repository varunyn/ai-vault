---
name: codex-weekly-log
description: Generate a token-efficient Codex engineering log, session journal, daily digest, rolling seven-day weekly log, changelog, or progress report as a static HTML page from local Codex session history.
---

# Codex Weekly Log

Produce one self-contained HTML report from Codex session history. Use deterministic extraction first so raw session JSONL stays out of model context. For weekly/range reports, add an editorial pass that groups task fragments into meaningful project/work-arc summaries.

## Workflow

1. Set `SKILL_DIR` to this skill folder. Default install: `SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/weekly-review"`.
2. Run `scripts/extract-sessions.js` to produce compact JSON. Do not read raw session JSONL unless debugging the extractor.
3. Choose the output mode:
   - Task log: render the compact JSON directly.
   - Editorial digest: read the compact JSON and write curated JSON before rendering.
4. Run `scripts/render-report.js` to generate HTML from compact or curated JSON and `base-report.html`.
5. Sanity-check HTML for the expected title, date range, item count, session IDs/source sessions, and no placeholder text.

## Scope Contract

- `current`: newest session across every local session-date folder; reported as `in-progress` unless `--status` overrides it.
- `today`: all sessions in the current local calendar day.
- `week`: today plus the preceding six local calendar days.
- `YYYY-MM-DD`: one local calendar day.
- `--from YYYY-MM-DD --to YYYY-MM-DD`: inclusive explicit range. If either bound is omitted, use today for that bound.
- `--status done|in-progress|blocked|note`: override inferred status.
- `--redact`: mask common API-key, bearer-token, token, and password values. Source excerpts remain unredacted by default.

## Privacy Contract

Preserve source text by default. Only redact when the user opts in with `--redact`. Before sharing or publishing an HTML report, remind the user that unredacted reports can include private prompts, file paths, commands, and secrets from Codex history.

## Commands

Current/newest session:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/weekly-review"
node "$SKILL_DIR/scripts/extract-sessions.js" --scope current --out /tmp/codex-log.json
node "$SKILL_DIR/scripts/render-report.js" --input /tmp/codex-log.json --out ./reports/codex-session-log.html
```

Rolling seven-day log:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/weekly-review"
node "$SKILL_DIR/scripts/extract-sessions.js" --scope week --out /tmp/codex-week.json
node "$SKILL_DIR/scripts/render-report.js" --input /tmp/codex-week.json --out ./reports/codex-weekly-log.html
```

Explicit range with redaction:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/weekly-review"
node "$SKILL_DIR/scripts/extract-sessions.js" --from 2026-06-17 --to 2026-06-23 --redact --out /tmp/codex-range.json
node "$SKILL_DIR/scripts/render-report.js" --input /tmp/codex-range.json --out ./reports/codex-range-log.html
```

Explicit files:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/weekly-review"
node "$SKILL_DIR/scripts/extract-sessions.js" --input /path/to/rollout.jsonl --out /tmp/codex-log.json
```

If the skill folder was installed under a different name, set `SKILL_DIR` to that folder instead.

## Editorial Digest Pass

Use this for weekly/range progress reports when the user wants meaningful information rather than logs.

1. Read only the compact JSON from extraction.
2. Group related task entries into about 8-12 project/work-arc items. Prefer fewer, more meaningful entries over many thin fragments.
3. Preserve concrete evidence: project names, features, bugs fixed, decisions, commands/verification, commits, blockers, and follow-ups.
4. Drop duplicated status chatter, raw prompt fragments, policy decisions, shell noise, and entries whose only content is "looked into it".
5. Write curated JSON with the same top-level shape, but include:
   - `"entryLabel": "curated work item"`
   - `"entryLabelPlural": "curated work items"`
   - `sessions`: curated items with `id`, `title`, `status`, `startedAt`, `summary`, `outcomes`, `cwd`, and optional `sourceSessions`.
6. Render the curated JSON with `render-report.js`.

Curated item example:

```json
{
  "id": "reader-pointe-parser-work",
  "title": "Reader Pointe parser and schema hardening",
  "status": "done",
  "startedAt": "2026-06-20T12:00:00Z",
  "summary": "Grouped related parser, Zod, Defuddle, and Prisma work into one project arc.",
  "outcomes": [
    "Tightened schema handling around extracted article content.",
    "Captured follow-ups where data shape or persistence still needed validation."
  ],
  "cwd": "/path/to/reader-pointe",
  "sourceSessions": ["session-a", "session-b"]
}
```

## Output Guidance

- Treat each meaningful request/outcome pair as one task entry; discard empty session fragments and raw command-output-only activity.
- Preserve concrete features, fixes, refactors, decisions, commands, commits, and outcomes.
- Use concise internal engineering language; avoid raw transcript wording and prompt fragments.
- Keep uncertain historical work as `note` rather than claiming it is complete.
- For editorial digests, make titles project/work-arc level rather than session-prompt level.

## Resources

- `scripts/extract-sessions.js`: CLI for compact report extraction.
- `scripts/session-report-lib.js`: streaming JSONL discovery, parsing, range handling, and optional redaction.
- `scripts/render-report.js`: static HTML renderer.
- `base-report.html`: style source.
- `references/report-design.md`: read only when changing report layout or visual conventions.

## Debugging

The extractor parses JSONL one line at a time and retains bounded excerpts. If a report is wrong, inspect the selected compact JSON or targeted event lines; do not load entire raw session files into context.
