const { loadSettings, debugLog, getRecallConfig } = require('./lib/settings');
const { readStdin, writeOutput } = require('./lib/stdin');

const DEFAULT_RECALL_DIRECTIVE = `<supermemory-recall>
Before responding, silently decide whether recalling saved memory (past sessions, decisions, conventions, the user's preferences) would materially improve your answer to THIS message. Reason first — don't search reflexively, and don't narrate the decision.

Recall — via the supermemory-search skill — when the message:
- refers to earlier work or decisions ("the auth flow", "like we did", "continue", "the bug from before")
- touches an area where saved conventions, patterns, or preferences likely exist
- is ambiguous in a way past context would resolve

Skip recall when the message is self-contained, trivial, a greeting/meta, fully answerable from the current conversation, or you already recalled the relevant context this session and the topic hasn't shifted.

Cadence is per-message: it's fine to recall on several turns in a row, and fine to never recall in a session. When you do recall, run it before answering and fold the results into your response.
</supermemory-recall>`;

const RECALL_DEBUG_SUFFIX = `<recall-debug>
DEBUG MODE: Begin your reply with exactly one line, then continue normally:
[recall-decision] yes|no — <short reason>
"yes" means you are recalling saved Supermemory memory (via the supermemory-search skill, separate from any obsidian/smfs notes mount) for THIS message; "no" means you are skipping it.
</recall-debug>`;

async function main() {
  const settings = loadSettings();

  try {
    const input = await readStdin();
    const cwd = input.cwd || process.cwd();

    const { directive } = getRecallConfig(cwd);

    let additionalContext = directive || DEFAULT_RECALL_DIRECTIVE;
    if (settings.debug) {
      additionalContext += `\n\n${RECALL_DEBUG_SUFFIX}`;
    }

    debugLog(settings, 'Injecting recall directive', {
      sessionId: input.session_id,
      custom: !!directive,
      debugDecision: !!settings.debug,
    });

    writeOutput({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext,
      },
    });
  } catch (err) {
    debugLog(settings, 'Recall hook error', { error: err.message });
    writeOutput({ continue: true, suppressOutput: true });
  }
}

main().catch(() => {
  writeOutput({ continue: true, suppressOutput: true });
});
