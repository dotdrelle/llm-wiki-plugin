#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function configPath() {
  if (process.env.LLM_WIKI_CONNECTOR_CONFIG) return resolve(process.env.LLM_WIKI_CONNECTOR_CONFIG);
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configHome, 'llm-wiki', 'connector.json');
}

function readConnectorConfig() {
  const file = configPath();
  if (!existsSync(file)) return {};
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch (error) {
    throw new Error(`Configuration llm-wiki invalide: ${file} (${error.message})`);
  }
}

function writeConnectorConfig(value) {
  const file = configPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return file;
}

function desktopLanguage() {
  const values = [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANGUAGE, process.env.LANG];
  for (const raw of values) {
    if (!raw || /^(C|POSIX)(?:[.@_-].*)?$/i.test(raw)) continue;
    const match = raw.match(/^([A-Za-z]{2,3})(?:[-_].*)?/);
    if (match) return match[1].toLowerCase();
  }
  return 'en';
}

function workspaceLanguage(workspacePath) {
  const file = join(workspacePath, '.wikirc.yaml');
  if (!existsSync(file)) return null;
  const match = readFileSync(file, 'utf8').match(/^\s*language:\s*['"]?([A-Za-z]{2,3})['"]?\s*$/m);
  return match ? match[1].toLowerCase() : null;
}

function languageForWorkspace(workspacePath) {
  const configured = workspaceLanguage(workspacePath);
  return configured || desktopLanguage() || 'en';
}

function homeConfig() {
  const config = readConnectorConfig();
  return {
    ...config,
    managerHome: resolve(config.managerHome || process.env.WIKI_MANAGER_STATE_DIR || pluginRoot),
    workspacesHome: config.workspacesHome
      ? resolve(config.workspacesHome)
      : process.env.WIKI_WORKSPACES_DIR ? resolve(process.env.WIKI_WORKSPACES_DIR) : null,
    engineHome: resolve(config.engineHome || process.env.LLM_WIKI_ENGINE_HOME || resolve(pluginRoot, '../../llm-wiki')),
  };
}

function readEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function workspaceFromPath(workspacePath) {
  const canonicalPath = resolve(workspacePath);
  const env = readEnv(join(canonicalPath, '.env'));
  return {
    name: env.WORKSPACE_NAME || process.env.WIKI_WORKSPACE_NAME || canonicalPath.split('/').pop() || 'workspace-local',
    workspacePath: canonicalPath,
    registryPath: null,
    managerDir: null,
    mcpPort: env.WIKI_MCP_PORT || null,
    servePort: env.WIKI_SERVE_PORT || null,
    mcpAuthToken: env.WIKI_MCP_AUTH_TOKEN || null,
    language: languageForWorkspace(canonicalPath),
  };
}

function candidateManagerDirs() {
  const configured = homeConfig();
  const explicit = process.env.WIKI_MANAGER_STATE_DIR;
  const workspaceDir = process.env.WIKI_WORKSPACES_DIR;
  const candidates = [
    configured.managerHome,
    explicit,
    configured.workspacesHome ? dirname(configured.workspacesHome) : null,
    workspaceDir ? dirname(workspaceDir) : null,
    process.env.PWD,
    join(homedir(), 'llm-wiki'),
    join(homedir(), '.llm-wiki'),
    resolve(pluginRoot, '../..', 'llm-wiki-manager'),
  ].filter(Boolean);
  return [...new Set(candidates.map((value) => resolve(value)))];
}

function discoverWorkspaces() {
  const configured = homeConfig();
  const result = [];
  const seen = new Set();
  for (const managerDir of candidateManagerDirs()) {
    const root = configured.workspacesHome || (process.env.WIKI_WORKSPACES_DIR
      ? resolve(process.env.WIKI_WORKSPACES_DIR)
      : join(managerDir, 'workspaces'));
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const registryPath = join(root, entry.name);
      const env = readEnv(join(registryPath, '.env'));
      if (!Object.keys(env).length) continue;
      const workspacePath = resolve(env.WIKI_WORKSPACE_PATH || registryPath);
      let canonicalPath = workspacePath;
      try { canonicalPath = realpathSync.native?.(workspacePath) ?? realpathSync(workspacePath); } catch {}
      const workspace = {
        name: env.WORKSPACE_NAME || entry.name,
        workspacePath: canonicalPath,
        registryPath,
        managerDir,
        mcpPort: env.WIKI_MCP_PORT || null,
        servePort: env.WIKI_SERVE_PORT || null,
        mcpAuthToken: env.WIKI_MCP_AUTH_TOKEN || null,
        language: languageForWorkspace(canonicalPath),
      };
      const key = `${workspace.name}\0${workspace.workspacePath}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(workspace);
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function selectWorkspace(name) {
  const workspaces = discoverWorkspaces();
  const requestedName = name || process.env.WIKI_WORKSPACE_NAME;
  if (requestedName) {
    const normalizedName = requestedName.toLocaleLowerCase();
    const found = workspaces.find((workspace) => workspace.name.toLocaleLowerCase() === normalizedName);
    if (!found) throw new Error(`Workspace introuvable: ${requestedName}`);
    return found;
  }
  const path = process.env.WIKI_WORKSPACE_PATH;
  if (path) return workspaceFromPath(path);
  if (workspaces.length === 1) return workspaces[0];
  if (!workspaces.length) throw new Error('Aucun workspace détecté. Configurez WIKI_MANAGER_STATE_DIR ou WIKI_WORKSPACES_DIR.');
  throw new Error(`Plusieurs workspaces détectés (${workspaces.map((item) => item.name).join(', ')}). Utilisez --workspace <nom>.`);
}

function printUsage() {
  console.log(`Usage:
  llm-wiki-connect.mjs setup [--manager-home <path>] [--workspaces-home <path>] [--engine-home <path>]
  llm-wiki-connect.mjs list
  llm-wiki-connect.mjs mcp --workspace <nom>
  llm-wiki-connect.mjs claude-config --workspace <nom>`);
}

async function setup() {
  const current = readConnectorConfig();
  const managerHomeArg = argument('--manager-home');
  const workspacesHomeArg = argument('--workspaces-home');
  const engineHomeArg = argument('--engine-home');
  const languageArg = argument('--language');
  const nonInteractive = process.argv.includes('--non-interactive');
  let managerHome = managerHomeArg || current.managerHome || process.env.WIKI_MANAGER_STATE_DIR || '';
  let workspacesHome = workspacesHomeArg || current.workspacesHome || process.env.WIKI_WORKSPACES_DIR || '';
  let engineHome = engineHomeArg || current.engineHome || resolve(pluginRoot, '../../llm-wiki');

  if (!nonInteractive && process.stdin.isTTY && process.stdout.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const language = (languageArg || current.language || desktopLanguage()).toLowerCase();
    managerHome = (await rl.question(`Manager home [${managerHome || 'auto'}]: `)).trim() || managerHome;
    workspacesHome = (await rl.question(`Workspaces home [${workspacesHome || 'auto'}]: `)).trim() || workspacesHome;
    engineHome = (await rl.question(`Engine home [${engineHome}]: `)).trim() || engineHome;
    rl.close();
    current.language = language || 'en';
  } else if (languageArg) {
    current.language = languageArg.toLowerCase();
  }

  const next = {
    ...current,
    ...(managerHome ? { managerHome: resolve(managerHome) } : {}),
    ...(workspacesHome ? { workspacesHome: resolve(workspacesHome) } : {}),
    ...(engineHome ? { engineHome: resolve(engineHome) } : {}),
    language: current.language || desktopLanguage() || 'en',
  };
  const file = writeConnectorConfig(next);
  console.log(JSON.stringify({ config: file, ...next }, null, 2));
}

const command = process.argv[2];
if (!command || command === '--help' || command === 'help') {
  printUsage();
  process.exit(0);
}

try {
  if (command === 'setup' || command === 'init') {
    await setup();
    process.exit(0);
  }

  if (command === 'list') {
    console.log(JSON.stringify(discoverWorkspaces(), null, 2));
    process.exit(0);
  }

  const workspace = selectWorkspace(argument('--workspace'));

  if (command === 'claude-config') {
    const args = [join(pluginRoot, 'bin', 'llm-wiki-connect.mjs'), 'mcp'];
    const env = {};
    if (workspace.registryPath) {
      args.push('--workspace', workspace.name);
      env.WIKI_MANAGER_STATE_DIR = workspace.managerDir;
    } else {
      env.WIKI_WORKSPACE_PATH = workspace.workspacePath;
    }
    console.log(JSON.stringify({
      mcpServers: {
        [`llm-wiki-${workspace.name}`]: {
          type: 'stdio',
          command: process.execPath,
          args,
          env: { ...env, LLM_WIKI_LANGUAGE: workspace.language || 'en' },
        },
      },
    }, null, 2));
    process.exit(0);
  }

  if (command === 'mcp') {
    const entrypoint = process.env.LLM_WIKI_ENTRYPOINT || resolve(homeConfig().engineHome, 'dist/bin/wiki.js');
    if (!existsSync(entrypoint)) throw new Error(`Entrypoint llm-wiki introuvable: ${entrypoint}`);
    const child = spawn(process.execPath, [entrypoint, 'mcp'], {
      cwd: workspace.workspacePath,
      env: {
        ...process.env,
        WIKI_WORKSPACE_PATH: workspace.workspacePath,
        ...(workspace.mcpAuthToken ? { WIKI_MCP_AUTH_TOKEN: workspace.mcpAuthToken } : {}),
      },
      stdio: 'inherit',
    });
    child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
    process.on('SIGTERM', () => child.kill('SIGTERM'));
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.exitCode = 0;
    // Keep this process alive while the child MCP server is running.
    await new Promise(() => {});
  }

  throw new Error(`Commande inconnue: ${command}`);
} catch (error) {
  console.error(`llm-wiki connector: ${error.message}`);
  process.exit(1);
}
