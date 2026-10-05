# llm-wiki Desktop pour Claude

Ce paquet connecte Claude Desktop aux workspaces `llm-wiki` locaux via MCP.
Il s'appuie sur le moteur `llm-wiki` (`dist/bin/wiki.js`) et sur le registre de
`wiki-manager` pour trouver les workspaces. Il ne nécessite ni ShellUI ni
`serve`.

Il produit deux fichiers Claude complémentaires :

- `dist/llm-wiki-claude.mcpb` : l'extension MCP locale (outils `wiki_*`) ;
- `dist/llm-wiki.plugin` : le skill Claude `llm-wiki` et ses instructions.

Une seule extension donne accès à **tous** les workspaces du registre : il
n'y a pas un paquet par workspace.

## Prérequis

- **Node.js 22 ou plus** dans le `PATH` vu par Claude Desktop (le moteur
  l'exige).
- Un moteur `llm-wiki` construit : `pnpm build` dans `llm-wiki/` pour un dépôt
  de développement.
- Un dossier d'état `wiki-manager` contenant `workspaces/`, avec des workspaces
  initialisés (`wiki init`).

## Construire

```bash
node scripts/build-mcpb.mjs
node scripts/build-claude-plugin.mjs
```

Les trois numéros de version — `CONNECTOR_VERSION` dans
`bin/llm-wiki-connect.mjs`, `mcpb/manifest.json` et
`claude-plugin/.claude-plugin/plugin.json` — doivent être identiques ; les deux
scripts refusent de construire sinon. Pour vérifier seul :

```bash
node scripts/check-versions.mjs
```

`dist/` n'est pas versionné : après toute modification de
`bin/llm-wiki-connect.mjs`, reconstruire **et** réinstaller l'extension (voir
« Mettre à jour »).

Le script de release du workspace (`build-and-push.sh`) aligne ces trois numéros
sur la version coordonnée (`SYNC_VERSIONS_ONLY=1`) puis reconstruit `dist/` ;
`scripts/check-versions.mjs` reste le contrôle local, et le `check-versions` du
manager les vérifie quand le dépôt est présent.

## Installer

### Extension MCP

`Claude Desktop → Settings → Extensions → Install Extension`, puis choisir
`dist/llm-wiki-claude.mcpb`. Deux champs sont demandés :

- **wiki-manager state directory** : le dossier qui contient `workspaces/`
  (et le `.env` du manager). Choisir un dossier **permanent** : un dossier
  sous `/tmp` est vidé au redémarrage du Mac et l'extension démarrerait alors
  sans aucun workspace.
- **wiki-workspace installation directory** : le dossier `llm-wiki` qui
  contient `dist/bin/wiki.js` — pas le fichier `wiki.js`, pas `dist/bin`.

```text
# dépôt de développement
/chemin/vers/wikiLLM/llm-wiki

# dépendance npm locale
/chemin/vers/projet/node_modules/llm-wiki

# paquet npm global (résoudre le chemin dans un terminal)
$(npm root -g)/llm-wiki
```

```bash
test -f "$(npm root -g)/llm-wiki/dist/bin/wiki.js" && echo "wiki.js trouvé"
```

Le sélecteur de dossier de Claude veut le chemin absolu résolu, pas `$(...)`.

### Skill Claude

`Claude Desktop → Settings → Plugins → Importer un plugin`, puis choisir
`dist/llm-wiki.plugin`. Le plugin ne contient que le skill `llm-wiki` et le
script `run-wiki-skill.py` ; il ne démarre aucun serveur MCP.

## Mettre à jour

1. `git pull` dans ce dépôt, puis reconstruire les deux fichiers.
2. Réinstaller `dist/llm-wiki-claude.mcpb` (même chemin d'installation) et
   réimporter `dist/llm-wiki.plugin` si `skills/` a changé.
3. Désactiver puis réactiver l'extension, ou redémarrer Claude Desktop.

Pour vérifier que la version installée est celle de la source :

```bash
diff -q "$HOME/Library/Application Support/Claude/Claude Extensions/local.mcpb.dotdrelle.llm-wiki-claude/bin/llm-wiki-connect.mjs" \
  bin/llm-wiki-connect.mjs && echo "extension à jour"
```

La version est aussi renvoyée par le serveur (`serverInfo.version`) à
l'initialisation MCP.

## Fonctionnement multi-workspace

Au démarrage, l'extension lit le registre `wiki-manager` et lance **un
processus moteur `wiki.js mcp` par workspace initialisé**. Un workspace non
initialisé est ignoré et signalé dans le journal de l'extension ; il ne bloque
pas les autres.

- `wiki_workspace_list` liste les workspaces, `wiki_workspace_select` choisit
  le workspace actif, `wiki_workspace_current` le rappelle.
- Tous les autres outils `wiki_*` (recherche, lecture, graphe, provenance,
  écriture, aide…) sont routés vers le **workspace actif**. Sans sélection, ils
  sont refusés avec une indication ; s'il n'existe qu'un workspace, il est
  sélectionné d'office.
- Le jeton MCP de chaque workspace est lu dans son `.env` ; le modèle ne
  choisit jamais un chemin à partir du texte de la demande.

Limites actuelles, à connaître :

- **Un seul workspace actif, partagé.** La sélection vit dans le processus de
  l'extension, que Claude Desktop partage normalement entre les
  conversations : changer de workspace dans une conversation le change pour
  les autres. Revérifier avec `wiki_workspace_current` en cas de doute.
- **Pas de requête sur plusieurs workspaces à la fois.** Pour comparer deux
  workspaces, les sélectionner l'un après l'autre ; éviter les appels en
  parallèle juste après un changement de sélection.
- **Registre lu au démarrage seulement.** Un nouveau workspace, ou un
  workspace initialisé depuis, n'apparaît qu'après un redémarrage de
  l'extension.
- **Un processus moteur par workspace** reste en mémoire pendant toute la
  session, workspace utilisé ou non.
- **Une seule ingestion suivie à la fois** : `wiki_ingest_stop` arrête la
  dernière lancée.
- **Les écritures ne passent pas par Donna.** `wiki_write_page`,
  `wiki_add_source`, `template_write` et `profile_update` écrivent
  directement ; seuls les verrous du moteur les refusent pendant un job de
  production (`PRODUCTION_JOB_ACTIVE`).

## Skills, ingestion et commandes natives

- `wiki_skill_list` / `wiki_skill_run` listent puis exécutent un skill du
  workspace actif (`.wiki/skills/*.md`) via
  `wiki-manager --headless --skill`. Ce mode n'approuve rien automatiquement :
  un skill qui modifie le workspace s'arrête en attente d'approbation, à
  donner dans le ShellUI ou dans `serve`.
- `wiki_ingest` lance l'ingestion native (`wiki-workspace wiki <ws> ingest`) ;
  ce n'est pas un skill. La progression est relayée à Claude.
- `wiki_command_run` exécute `doctor`, `run`, `build` ou `export` via
  `wiki-workspace wiki <ws> <commande>`. Avec `run`, les arguments sont
  transmis tels quels au moteur, y compris pour une commande qui écrit.

```text
Sélectionne le workspace ACPI.
Recherche les informations sur le dernier COPIL.
Lance l'ingestion des sources en attente.
Exécute /wiki doctor sur ACPI.
Exécute la compétence wiki-build.
```

Hors Claude Desktop (Cowork, Claude Code), le skill peut aussi lancer
`scripts/run-wiki-skill.py`, qui lit le même registre et demande le workspace
quand il y en a plusieurs. Pour une installation de développement, le script
découvre le manager voisin de `LLM_WIKI_ENGINE_HOME` ; sinon définir
`LLM_WIKI_MANAGER_BIN` vers `wiki-manager.js` (et `BUN_BIN` si Bun n'est pas
dans `~/.bun/bin`).

## Diagnostic local

```bash
# workspaces détectés
WIKI_MANAGER_STATE_DIR=<dossier-manager> node bin/llm-wiki-connect.mjs list

# un seul workspace en stdio (sans multiplexage)
node bin/llm-wiki-connect.mjs mcp --workspace acpi

# le connecteur multi-workspace, comme Claude Desktop le lance
WIKI_MANAGER_STATE_DIR=<dossier-manager> LLM_WIKI_ENGINE_HOME=<dossier-llm-wiki> \
  node bin/llm-wiki-connect.mjs multi-mcp
```

Les deux derniers attendent des messages MCP JSON-RPC sur l'entrée standard.
Le journal de l'extension (Claude Desktop → Settings → Extensions) montre les
workspaces ignorés et les erreurs de démarrage du moteur.

## Langue

`language` du `.wikirc.yaml` du workspace, puis la langue du système
(`LANG`/`LC_*`), puis `en`.
