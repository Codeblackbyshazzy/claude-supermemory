const { loadSettings, debugLog } = require('./lib/settings');
const { readStdin, writeOutput } = require('./lib/stdin');

const SEARCH_BASH_RE = /node[\s\S]*search-memory\.cjs/;
const SHELL_OPS = /[;&|`>]|\$\(/;
const SEARCH_SKILL = 'supermemory-search';

function isSupermemorySearch(toolName, toolInput) {
  if (toolName === 'Skill') {
    return JSON.stringify(toolInput || {}).includes(SEARCH_SKILL);
  }
  if (toolName === 'Bash') {
    const cmd = String(toolInput?.command || '');
    return SEARCH_BASH_RE.test(cmd) && !SHELL_OPS.test(cmd);
  }
  return false;
}

async function main() {
  const settings = loadSettings();

  try {
    const input = await readStdin();

    if (isSupermemorySearch(input.tool_name, input.tool_input)) {
      debugLog(settings, 'Auto-approving recall search', {
        toolName: input.tool_name,
      });
      writeOutput({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason:
            'Supermemory reasoned recall runs automatically (read-only memory search).',
        },
      });
      return;
    }

    writeOutput({ continue: true, suppressOutput: true });
  } catch (err) {
    debugLog(settings, 'Recall approve hook error', { error: err.message });
    writeOutput({ continue: true, suppressOutput: true });
  }
}

main().catch(() => {
  writeOutput({ continue: true, suppressOutput: true });
});
