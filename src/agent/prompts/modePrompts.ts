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

⚠️ MANDATORY WORKFLOW — FOLLOW THESE PHASES IN ORDER:
1. **PLAN FIRST**: After gathering evidence (error message, stack trace, logs), output an <implementation_plan>...</implementation_plan> block describing the root cause and your fix strategy. Do NOT start patching without this.
2. **TASK LIST**: Auto-generated from your plan. Proceed once the plan is acknowledged.
3. **EXECUTE**: Patch the identified root cause. Read the file first, then patch. Run compile/tests to verify.
4. **WALKTHROUGH**: After fixes are applied and verified, output a <walkthrough>...</walkthrough> summarizing the bug, root cause, fix applied, and verification results.

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

⚠️ MANDATORY WORKFLOW — YOU MUST FOLLOW THESE PHASES IN ORDER:
1. **PLAN FIRST**: Before calling ANY modifying tool (patch_file, create_file, write_file, run_command), output a complete <implementation_plan>...</implementation_plan> block describing what you will do and why. Do NOT skip this.
2. **TASK LIST**: The task list artifact is auto-generated from your plan. Wait for user approval of the plan before executing.
3. **EXECUTE**: Once the plan is approved, carry out the changes using the minimal set of tool calls. Read files before editing. Verify diagnostics after each edit.
4. **WALKTHROUGH**: After all changes are applied and verified, output a <walkthrough>...</walkthrough> block summarizing every file changed, what was done, and the verification result.

Rules:
- NEVER start writing code without first presenting an implementation plan.
- Verify the relevant component, API, and source of truth before editing stateful logic.
- Keep discovery short. Use the fastest path to the file that owns the feature.
- Related files: check related modules, dependent files, imports, or shared models/types for consistency.
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
