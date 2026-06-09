export function getDebugSkill(): string {
  return `### 🐛 EVIDENCE-DRIVEN DEBUGGING SKILL (ACTIVE)
1. **Observe Symptom**: Capture error traces, logs, and visual layouts before touching code.
2. **Identify Producer**: Track which file, function, API, or handler produces the incorrect output.
3. **Form One Hypothesis**: Form exactly one focused theory on the root cause.
4. **Verify Hypothesis**: Call read_file or grep_search to test and confirm your hypothesis before editing code.
5. **Fail & Discard**: If a patch fails to resolve the symptom, immediately discard your theory and re-evaluate from first principles. Do NOT stack defensive locks/state checks on top of failed theories.`;
}
