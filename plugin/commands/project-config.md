---
description: Update Supermemory project-level configuration
allowed-tools: ["Bash", "Read", "Edit", "AskUserQuestion"]
---

# Project Config

Update project-level config stored in `.claude/.supermemory-claude/config.json`.

## Steps

1. First, find the git root and read the current project config:

   ```bash
   git_root=$(git rev-parse --show-toplevel 2>/dev/null || echo "$(pwd)")
   cat "$git_root/.claude/.supermemory-claude/config.json" 2>/dev/null || echo "{}"
   ```

2. Ask the user what they want to update using AskUserQuestion:
   - **API Key** (`apiKey`): Project-level API key that overrides global
   - **Base URL** (`baseUrl`): Supermemory API base URL, defaults to `https://api.supermemory.ai`
   - **Project Container Tag** (`repoContainerTag`): Overrides the unified container used by Claude Code and Codex
   - **Legacy Personal Container Tag** (`personalContainerTag`): Optional read-only fallback for memories created by older plugin versions

3. Ask the user for the new value. Confirm the value they provide.

4. Update the project config file:

   ```bash
   node -e "
     const fs = require('fs');
     const path = require('path');
     const { execSync } = require('child_process');
     let gitRoot;
     try { gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim(); } catch { gitRoot = process.cwd(); }
     const dir = path.join(gitRoot, '.claude', '.supermemory-claude');
     const file = path.join(dir, 'config.json');
     let data = {};
     try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch {}
     data['KEY_NAME'] = 'NEW_VALUE';
     fs.mkdirSync(dir, { recursive: true });
     fs.writeFileSync(file, JSON.stringify(data, null, 2));
     console.log('Updated: ' + file);
   "
   ```

   Replace `KEY_NAME` with `apiKey`, `baseUrl`, `repoContainerTag`, or the legacy-read-only `personalContainerTag`, and `NEW_VALUE` with the user's provided value.

5. Confirm to the user the project configuration has been updated.
