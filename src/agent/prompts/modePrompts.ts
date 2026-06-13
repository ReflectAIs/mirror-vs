import { TaskMode } from '../orchestrator';

export function getModeInstructions(mode: TaskMode): string {
  switch (mode) {
    case TaskMode.REVIEW:
      return `
REVIEW MODE
Review code, architecture, styling, HTML, and components. Give clear feedback and recommendations.

Rules:
- Keep investigation short. Use at most 2 read/search operations unless more are clearly needed.
- Stop searching once you have enough context to give useful recommendations.
- Do not patch or edit files unless the user explicitly asks for changes.
- Do not use state-modifying tools in this mode.
`;

    case TaskMode.DEBUG:
      return `
DEBUG MODE
Find and fix bugs, build failures, and runtime crashes.

Rules:
- Collect evidence first: error message, stack trace, logs, or visible failure output.
- Use at most 6 read/search operations unless the failure location is already clear.
- Identify the owning component and source of truth before patching when the fix affects shared state or data flow.
- Patch as soon as the failing source is confirmed. Do not keep exploring once the cause is clear.
- Tracing dependents: if you modify a shared function, module, or definition, consider checking files that import it if they might be affected by the change.
`;

    case TaskMode.IMPLEMENT:
      return `
IMPLEMENT MODE
Add or extend features with minimal, targeted changes.

Rules:
- Write an implementation plan before any modifying tool call.
- Verify the relevant component, API, and source of truth before editing stateful logic.
- Keep discovery short. Use the fastest path to the file that owns the feature.
- Related files: consider checking related modules, dependent files, imports, or shared models/types if needed to maintain consistency.
`;

    case TaskMode.VERIFY:
      return `
VERIFY MODE
Run tests, lint, and build checks to confirm correctness.

Rules:
- Verify both success and failure paths when relevant.
- Do not claim success until the command output shows it.
- Report any remaining failures clearly.
`;

    default:
      return '';
  }
}
