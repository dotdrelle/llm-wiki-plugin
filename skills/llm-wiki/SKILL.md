---
name: llm-wiki
description: Use the connected llm-wiki MCP server to search, read, cite, traverse, and explicitly update a local Markdown knowledge base.
---

# llm-wiki workflow

Use `wiki_search_context` for a focused lookup. For synthesis, comparison,
architecture, or audit work, prefer `wiki_collect_context`, then use the
returned `readPagePaths` and `readPages` as the evidence base. Read full pages
with `wiki_read_page` or `wiki_read_pages` when search excerpts are not enough.

For relationship questions, use `wiki_graph_query` or `wiki_graph_path` before
reading the relevant pages. Preserve source citations such as `[src: ...]` in
the answer and state when raw archived sources were not opened in full.

Treat `wiki_write_page`, `wiki_add_source`, `template_write`, and
`profile_update` as mutating operations. Only call them when the user clearly
asked for the corresponding change; otherwise report the proposed change.

## Execute a workspace skill

When the user explicitly asks to run a skill, preserve its exact name and
delegate through `wiki-manager` headless mode. The workspace is resolved from
the wiki-manager registry, independently of MCP extensions. In a
local-execution session (Cowork or Claude Code), first run without a workspace
when the user did not provide one:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/run-wiki-skill.py \
  --skill "<exact-skill-name>"
```

If the result has `status: workspace_required`, ask the user to choose one of
the returned `workspaces`, then run again with its exact name:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/run-wiki-skill.py \
  --workspace "<workspace-name>" \
  --skill "<exact-skill-name>"
```

If only one workspace is registered, it is selected automatically. The manager
state folder may be supplied with `--manager-home`; the script also discovers
the development manager next to `LLM_WIKI_ENGINE_HOME` and the Bun installation
in `~/.bun/bin`. Do not translate a skill name into a guessed CLI command, and
do not run a skill unless the user explicitly requests it.

The script returns JSON containing the workspace, exact skill name, status,
exit code, output and error.

The MCP wrapper uses `WIKI_WORKSPACE_PATH` to select the workspace and defaults
to the current directory. Set `LLM_WIKI_ENTRYPOINT` if the built `wiki.js`
entrypoint is not at the default local path.
