/**
 * Mirror VS v2.0 Engine Type System
 *
 * Provides text-free enum boundaries for execution modes and state processing.
 * Isolates LLM outputs to single tool calls and explicit intent schema blocks,
 * preventing queue desynchronisation and "Empty Response" exceptions.
 */

// ---------------------------------------------------------------------------
// Agent Mode — 6-stage execution FSM
// ---------------------------------------------------------------------------

/**
 * The primary execution mode of the agentic engine.
 * Transitions: BOOTSTRAP → EXPLORE → PLAN → PATCH → VERIFY → DONE
 */
export type AgentMode =
  | 'BOOTSTRAP'  // Environment discovery (BootstrapGraph)
  | 'EXPLORE'    // Read-only workspace investigation
  | 'PLAN'       // Implementation plan construction
  | 'PATCH'      // Active code modification
  | 'VERIFY'     // Build/test/diagnostics checks
  | 'DONE';      // Task complete, awaiting next user input

// ---------------------------------------------------------------------------
// Task Item — v2 task with dependency tracking
// ---------------------------------------------------------------------------

/**
 * A discrete unit of work within the engine's task queue.
 * Unlike the runtime Task (which uses subtasks[]), TaskItem uses a flat
 * dependency list for explicit prerequisite ordering.
 */
export interface TaskItem {
  /** Unique identifier (e.g. "task-001") */
  id: string;
  /** Human-readable description of the work item */
  description: string;
  /** Lifecycle state */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** IDs of TaskItems that must complete before this one starts */
  dependencies: string[];
}

// ---------------------------------------------------------------------------
// Action Intent — strict JSON schema for LLM tool routing
// ---------------------------------------------------------------------------

/**
 * A discriminated union representing the single action the engine
 * intends to execute on the next turn. Forces the LLM to commit to
 * one concrete operation rather than emitting free-form prose.
 */
export interface ActionIntent {
  intent:
    | 'READ_SYMBOL'        // Read a named symbol from a file
    | 'PATCH_LINES'        // Apply a line-range patch to a file
    | 'EXECUTE_ROUTINE'    // Run a terminal command
    | 'PROBE_DIAGNOSTICS'  // Check LSP/build diagnostics
    | 'YIELD_TASK';        // Complete the current task and advance the queue
  /** Rationale for choosing this action (brief, for logging) */
  rationale: string;
  /** Action-specific parameters */
  payload: {
    /** Absolute or workspace-relative path of the target file */
    targetFile?: string;
    /** Named symbol to look up (for READ_SYMBOL) */
    symbolName?: string;
    /** Inclusive start line of the patch range */
    startLine?: number;
    /** Inclusive end line of the patch range */
    endLine?: number;
    /** Replacement content to apply at the patch range */
    patchContent?: string;
    /** Shell command to execute (for EXECUTE_ROUTINE) */
    commandStr?: string;
  };
}

// ---------------------------------------------------------------------------
// V2 Execution State — namespaced to avoid clash with runtime ExecutionState
// ---------------------------------------------------------------------------

/**
 * The high-level processing state of the v2 core engine.
 * This is distinct from the runtime `ExecutionState` enum in
 * `src/agent/runtime/types.ts` which governs the orchestrator FSM.
 */
export type V2ExecutionState = {
  /** Current execution mode */
  currentMode: AgentMode;
  /** The task actively being processed, or null if idle */
  activeTask: TaskItem | null;
  /** Ordered queue of pending tasks */
  taskQueue: TaskItem[];
  /**
   * SHA-256 hash of the last file snapshot + diagnostic count.
   * Used by ActionPhysicsGuard to detect stagnation (no real change
   * between consecutive turns on the same file).
   */
  stagnationHash: string;
  /**
   * Per-file consecutive read counter.
   * Incremented each time read_file is called for the same target
   * without an intervening patch; reset to 0 on any write to that file.
   */
  consecutiveReads: Record<string, number>;
};
