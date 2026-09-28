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

Sélectionner le dossier exact du workspace, par exemple :

```text
/tmp/llm-wiki-test/workspaces/acpi
```

Puis sélectionner le dossier contenant `dist/bin/wiki.js` :

```text
/Users/dotdrelle/Developpement/wikiLLM/llm-wiki
```

L'extension lit le token MCP dans le `.env` du workspace et conserve ce
workspace comme périmètre exclusif de la connexion.

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
serveur MCP : les outils sont fournis par l’extension `.mcpb`.

Le plugin peut aussi exécuter les skills headless sans extension MCP. Il lit la
liste des workspaces dans le registre de `wiki-manager`. Si plusieurs
workspaces existent, Claude demande lequel utiliser :

```text
/llm-wiki lance ingest
```

ou le workspace peut être donné directement :

```text
/llm-wiki lance ingest sur ACPI
```

Dans ce second cas, le skill exact `ingest` est transmis à `wiki-manager` avec
le workspace `ACPI`.

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
