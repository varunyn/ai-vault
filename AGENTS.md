# AI Vault Guidelines

Use this repo as a compact catalog, not a long-form documentation site.

## Resource Entries

- Keep entries short and scannable.
- Use this format by default:

```md
- [name](https://example.com) - Short note on why it is useful.
```

- Prefer one sentence after the dash.
- Do not add long descriptions unless setup notes, usage details, or caveats are genuinely needed.
- Keep the user's wording and intent when they provide it.
- When adding an external skill, archive a source-faithful copy under `skills/<skill-name>/`.
- Preserve upstream files and its license, and add a `SOURCE.md` with the source URL, upstream path, and pinned commit SHA.
- Do not modify archived upstream files by hand. Refresh them from a new upstream revision instead.

## Organization

- Add agent skills under `## Skills`.
- Add MCP servers under `## MCPs`.
- Add frameworks, tools, prompts, workflows, plugins, and references under `## Other AI Resources`.
- Create a new subsection only when there are at least a few related entries or the category is clearly useful.
- Keep placeholder category ideas below real entries.

## Style

- Use plain Markdown.
- Use compact link text, usually `owner/repo` for GitHub repositories.
- Avoid marketing language.
- Avoid duplicate entries.
- If a resource fits multiple categories, put it where the user is most likely to look for it.
