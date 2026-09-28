# llm-wiki Desktop pour Claude

Ce paquet connecte Claude Desktop à un workspace `llm-wiki` local via MCP.
Il s'appuie sur `wiki-workspace` pour le moteur et sur `wiki-manager` pour les
workspaces, le runtime et les permissions.

Le paquet fournit deux fichiers Claude complémentaires :

- `dist/llm-wiki-claude.mcpb` : serveur MCP local et outils `wiki_*` ;
- `dist/llm-wiki.plugin` : skill Claude et instructions d'utilisation.

Le `.mcpb` ne nécessite ni ShellUI ni `serve`. Il lance directement le moteur
MCP du workspace sélectionné.

## Installation

### Extension MCP locale

Construire l'extension :

```bash
node scripts/build-mcpb.mjs
```

Installer ensuite `dist/llm-wiki-claude.mcpb` dans :

```text
Claude Desktop → Settings → Extensions → Install Extension
```

Sélectionner le dossier d'état de `wiki-manager` :

```text
<manager-state-directory>
```

L'extension découvre les workspaces enregistrés. Elle expose
`wiki_workspace_list`, `wiki_workspace_current` et
`wiki_workspace_select`. Après sélection, les outils standards
(`wiki_search_context`, `wiki_graph_view`, etc.) utilisent le workspace actif.
La sélection reste en mémoire pendant la session Claude et est réinitialisée
au redémarrage de l'extension. Un workspace non initialisé est ignoré et
signalé dans le journal ; il ne bloque pas les autres workspaces.

Les outils `wiki_skill_list` et `wiki_skill_run` listent puis exécutent un skill
demandé explicitement via le `wiki-manager` local. L'outil `wiki_ingest` lance
le pipeline natif d'ingestion des sources en attente. Ils fonctionnent depuis
Claude Desktop sans dépendre d'un shell cloud ou d'une interface ShellUI.

Puis sélectionner le dossier contenant `dist/bin/wiki.js` :

```text
<llm-wiki-engine-directory>
```

Le champ attend le dossier `llm-wiki`, pas le fichier `wiki.js` et pas le
dossier `dist/bin`.

Installations possibles :

```text
# dépôt de développement
/chemin/vers/wikiLLM/llm-wiki/dist/bin/wiki.js

# dépendance npm locale
/chemin/vers/projet/node_modules/llm-wiki/dist/bin/wiki.js

# paquet npm global
$(npm root -g)/llm-wiki/dist/bin/wiki.js
```

Dans l’interface Claude, sélectionner dans tous les cas le dossier situé avant
`/dist/bin/wiki.js`. Pour vérifier une installation npm globale :

```bash
test -f "$(npm root -g)/llm-wiki/dist/bin/wiki.js" && echo "wiki.js trouvé"
```

Avec le dépôt de développement, construire d’abord le moteur avec `pnpm build`
dans `llm-wiki/`.

L'extension lit le token MCP dans le `.env` de chaque workspace. Les outils
restent isolés par le workspace actif de la session.

### Skill Claude

Construire le plugin :

```bash
node scripts/build-claude-plugin.mjs
```

Importer ensuite `dist/llm-wiki.plugin` dans :

```text
Claude Desktop → Settings → Plugins → Importer un plugin
```

Le plugin contient uniquement le skill `llm-wiki`. Il ne démarre pas un second
serveur MCP : les outils sont fournis par l'extension `.mcpb`. Le même fichier
`.mcpb` donne accès à tous les workspaces du registre ; il n'est pas nécessaire
de générer un paquet par workspace.

Le plugin peut aussi exécuter les skills headless sans extension MCP. Il lit la
liste des workspaces dans le registre de `wiki-manager`. Si plusieurs
workspaces existent, Claude demande lequel utiliser. L’ingestion n’est pas un
skill : c’est une commande native du moteur, exposée par `wiki_ingest`.

```text
/llm-wiki lance l’ingestion des sources en attente
```

ou le workspace peut être donné directement :

```text
/llm-wiki lance l’ingestion des sources en attente sur ACPI
```

Dans ce second cas, l’outil `wiki_ingest` appelle localement
`wiki-workspace wiki ACPI ingest`.

Les commandes natives sont également disponibles via `wiki_command_run` :

```text
/wiki doctor
/wiki run <arguments>
/wiki build
/wiki export
```

Elles ne doivent pas être recherchées dans la liste des skills du workspace.

## Utilisation

Exemples de demandes à Claude :

```text
Recherche dans mon wiki les informations sur Juno.
```

```text
Lis la page wiki/concepts/produit.md.
```

```text
Affiche le graphe autour du concept Juno.
```

Les opérations de recherche, lecture, écriture et graphe utilisent le workspace
associé à l'extension. Le modèle ne choisit jamais un autre chemin à partir du
texte de la demande.

Pour exécuter une compétence déjà installée dans ce workspace, demander
explicitement à Claude, par exemple :

```text
Exécute la compétence <nom-exact-du-skill>.
```

Le skill Claude appelle alors `scripts/run-wiki-skill.py`. Celui-ci transmet le
nom exact à `wiki-manager --headless --skill`, attend la fin du traitement et
retourne à Claude un résultat JSON avec le statut, la sortie et les erreurs.
L'exécution ne lance ni ShellUI ni `serve`.

Pour une installation de développement, le script découvre le manager voisin
de `LLM_WIKI_ENGINE_HOME`. Sinon, définir `LLM_WIKI_MANAGER_BIN` vers le fichier
`wiki-manager.js` (et `BUN_BIN` si Bun n'est pas dans `~/.bun/bin`).

## Diagnostic local

Lister les workspaces détectés :

```bash
node bin/llm-wiki-connect.mjs list
```

Tester le serveur MCP directement :

```bash
node bin/llm-wiki-connect.mjs mcp --workspace acpi
```

La commande attend les messages MCP sur l'entrée standard. Elle ne lance pas
ShellUI et ne démarre pas le serveur web.

## Langue

La langue suit cette priorité : `language` du `.wikirc.yaml` du workspace, puis
la langue du desktop (`LANG`/`LC_*`), puis `en`.
