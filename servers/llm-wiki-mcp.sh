#!/bin/sh
set -eu

workspace="${WIKI_WORKSPACE_PATH:?WIKI_WORKSPACE_PATH is required}"
engine_home="${LLM_WIKI_ENGINE_HOME:?LLM_WIKI_ENGINE_HOME is required}"
entrypoint="$engine_home/dist/bin/wiki.js"

if [ ! -f "$entrypoint" ]; then
  echo "llm-wiki: wiki.js not found: $entrypoint" >&2
  exit 1
fi

if [ -z "${WIKI_MCP_AUTH_TOKEN:-}" ] && [ -f "$workspace/.env" ]; then
  token="$(sed -n 's/^WIKI_MCP_AUTH_TOKEN=//p' "$workspace/.env" | head -n 1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  if [ -n "$token" ]; then
    export WIKI_MCP_AUTH_TOKEN="$token"
  fi
fi

cd "$workspace"
exec node "$entrypoint" mcp
