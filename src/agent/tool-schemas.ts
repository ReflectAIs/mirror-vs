/**
 * tool-schemas.ts
 *
 * Defines all Mirror VS agent tools as OpenAI-compatible JSON Schema objects
 * for use with native function calling APIs (DeepSeek, OpenAI, OpenRouter, LiteLLM).
 *
 * When passed to the API as the `tools` array, the LLM will emit structured
 * `tool_calls` objects instead of free-form XML text — eliminating hallucination
 * and ensuring exactly one tool fires per turn.
 */

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

const TOOL_SCHEMAS: ToolSchema[] = [
  // ─── File Reading ────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the contents of a file from the workspace. If the file is an image (PNG, JPG, JPEG, GIF, WEBP, etc.), reading it will automatically encode the image to base64 and feed it into your vision model context. Use start_line and end_line to read specific ranges of text files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or workspace-relative path to the file.',
          },
          start_line: {
            type: 'number',
            description: 'First line to read (1-indexed, inclusive). Omit to start from the beginning.',
          },
          end_line: {
            type: 'number',
            description: 'Last line to read (1-indexed, inclusive). Omit to read to the end.',
          },
        },
        required: ['path'],
      },
    },
  },

  // ─── File Writing ─────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'create_file',
      description:
        'Create a new file at the specified path with the given content. Fails if the file already exists.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the new file to create.' },
          content: { type: 'string', description: 'Full content to write to the new file.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Overwrite an existing file with new content. Use only when a full rewrite is needed; prefer patch_file for targeted edits.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path of the file to overwrite.' },
          content: { type: 'string', description: 'New full content for the file.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_file',
      description:
        'Apply a targeted modification to a specific line range in an existing file. ' +
        'Ensure you have executed read_file on these exact lines first to get the current content and accurate line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to patch.' },
          start_line: { 
            type: 'number', 
            description: 'The 1-indexed line number where the modification block begins.' 
          },
          end_line: { 
            type: 'number', 
            description: 'The 1-indexed line number where the modification block ends (inclusive).' 
          },
          expected_search_content: {
            type: 'string',
            description: 'The exact code currently residing between start_line and end_line. Used to verify line stability before applying changes.'
          },
          replace_content: { 
            type: 'string', 
            description: 'The new code block that will replace the specified line range completely.' 
          },
        },
        required: ['path', 'start_line', 'end_line', 'expected_search_content', 'replace_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'multi_patch_file',
      description:
        'Apply multiple independent line-range patches to a single file in a single operation. Use when making several non-adjacent edits across the file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to patch.' },
          patches: {
            type: 'array',
            description: 'List of individual patch objects sorted by line numbers from highest to lowest (to prevent line-shifting issues during execution).',
            items: {
              type: 'object',
              properties: {
                start_line: { type: 'number', description: '1-indexed starting line.' },
                end_line: { type: 'number', description: '1-indexed ending line.' },
                expected_search_content: { type: 'string', description: 'The exact existing code block across this line range.' },
                replace_content: { type: 'string', description: 'The new code to inject.' }
              },
              required: ['start_line', 'end_line', 'expected_search_content', 'replace_content']
            }
          }
        },
        required: ['path', 'patches'],
      },
    },
  },


  // ─── Directory ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description:
        'List the contents of a directory, showing files and subdirectories with their sizes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or workspace-relative directory path.' },
          depth: {
            type: 'number',
            description: 'How many levels deep to recurse (default: 1). Max: 4.',
          },
        },
        required: ['path'],
      },
    },
  },

  // ─── Search ───────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description:
        'Search for a literal string or regex pattern across files in the workspace. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text or regex pattern to search for.' },
          path: {
            type: 'string',
            description: 'Directory or file path to limit the search scope. Omit for workspace-wide search.',
          },
          is_regex: {
            type: 'boolean',
            description: 'Treat the query as a regular expression pattern. Default: false.',
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Perform a case-sensitive search. Default: false.',
          },
          includes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns to filter files (e.g. ["*.ts", "*.js"]). Only matching files will be searched.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'symbol_search',
      description:
        'Search for code symbols (functions, classes, variables, types) by name across the workspace.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Symbol name or partial name to search for.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'semantic_search',
      description:
        'Perform a semantic (embedding-based) search over the workspace codebase. Good for finding conceptually related code when you don\'t know the exact symbol name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language description of what to find.' },
        },
        required: ['query'],
      },
    },
  },

  // ─── Terminal / Commands ──────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Execute a shell command in the VS Code integrated terminal. Use for builds, tests, installs, git commands, etc. Output is captured and returned.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute.' },
          terminal_name: {
            type: 'string',
            description: 'Optional name for the terminal panel (for reuse across turns).',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_script',
      description:
        'Execute a finite, short-running script or command in the terminal (e.g., run tests, compile/build code, run database migrations, or trigger code generation). This tool is strictly blocking, waiting for the command to finish executing, and returns the full stdout/stderr output in a single turn.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command or script to execute.' },
          terminal_name: {
            type: 'string',
            description: 'Optional name for the terminal panel (for reuse across turns).',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_server',
      description:
        'Start a long-running background daemon process or server (e.g., local dev server, vite dev, api daemon, database docker container). This tool starts the server asynchronously, probes for port listeners, and returns immediately without blocking. Restrict this exclusively to persistent processes.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The server start command to execute.' },
          terminal_name: {
            type: 'string',
            description: 'Optional name for the terminal panel (for reuse across turns).',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_terminal_input',
      description: 'Send input text to a running terminal (e.g., to answer an interactive prompt).',
      parameters: {
        type: 'object',
        properties: {
          terminal_name: { type: 'string', description: 'Name of the terminal to send input to.' },
          text: { type: 'string', description: 'Text to send (include \\n for Enter).' },
        },
        required: ['terminal_name', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_terminal',
      description: 'Read the output from an active running terminal panel.',
      parameters: {
        type: 'object',
        properties: {
          terminal_name: { type: 'string', description: 'Name of the terminal to read from.' },
          chars: { type: 'number', description: 'Optional number of characters to read from the end of the output buffer. Default is 5000.' },
        },
        required: ['terminal_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_terminal',
      description: 'Terminate and close an active terminal panel.',
      parameters: {
        type: 'object',
        properties: {
          terminal_name: { type: 'string', description: 'Name of the terminal to close.' },
        },
        required: ['terminal_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_terminals',
      description: 'List all active running terminal panels managed by the agent.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  // ─── Git ──────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show the current git status of the workspace (staged, unstaged, untracked files).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show the git diff for the workspace or a specific file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional file path to limit the diff.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_add',
      description: 'Stage files for a git commit.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File or directory path to stage. Use "." for all.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Create a git commit with the staged changes.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The commit message.' },
        },
        required: ['text'],
      },
    },
  },

  // ─── Web ──────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for documentation, error messages, or technical information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Open a URL in the embedded browser.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to.' },
        },
        required: ['url'],
      },
    },
  },

  // ─── Diagnostics ──────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_diagnostics',
      description:
        'Get TypeScript/ESLint diagnostics (errors, warnings) for a file or the entire workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional file path. Omit for workspace-wide diagnostics.' },
        },
      },
    },
  },

  // ─── Utilities ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'wait',
      description: 'Pause execution for a specified duration (e.g., to let a server start up).',
      parameters: {
        type: 'object',
        properties: {
          ms: { type: 'number', description: 'Milliseconds to wait.' },
        },
        required: ['ms'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_agent_memory',
      description: 'Store a key-value pair in persistent agent memory for use in future sessions.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Memory key.' },
          value: { type: 'string', description: 'Value to store.' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_artifact',
      description:
        'Create a new interactive previewable artifact or update an existing one by ID (HTML, SVG, Mermaid, code, markdown). ' +
        'Use this to publish planning documents, task lists, or walkthrough summaries.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The unique identifier of the artifact. Required when updating an existing plan, task list, or code snippet.',
          },
          type: {
            type: 'string',
            description: 'The artifact type. Supported: "html", "svg", "mermaid", "code", "markdown".',
          },
          title: {
            type: 'string',
            description: 'The user-friendly title of the artifact tab/window.',
          },
          content: {
            type: 'string',
            description: 'The complete code, diagram text, markdown body, or HTML markup for the artifact.',
          },
          language: {
            type: 'string',
            description: 'Syntax highlighting language (e.g. "typescript", "javascript", "python", "css", etc.) if type is "code".',
          },
        },
        required: ['type', 'title', 'content'],
      },
    },
  },

  // ─── File Management ──────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description:
        'Permanently delete a file from the workspace. Use with caution — a checkpoint is created automatically so the action can be reverted. Requires user approval unless auto-approve is enabled.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or workspace-relative path of the file to delete.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description:
        'Rename or move a file within the workspace. Provide the current path as "from" and the new path as "to". Parent directories for the destination are created automatically. A checkpoint is created so the action can be reverted.',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: 'Current path of the file to rename/move.',
          },
          to: {
            type: 'string',
            description: 'New path (including new filename) for the file.',
          },
        },
        required: ['from', 'to'],
      },
    },
  },
];

/**
 * Returns all tool schemas for passing to native function calling APIs.
 *
 * @param excludeNames - Optional list of tool names to exclude (e.g., for mode-based restrictions)
 */
export function getToolSchemas(excludeNames?: string[]): ToolSchema[] {
  if (!excludeNames || excludeNames.length === 0) {
    return TOOL_SCHEMAS;
  }
  const excluded = new Set(excludeNames);
  return TOOL_SCHEMAS.filter((t) => !excluded.has(t.function.name));
}

/**
 * Returns true if the given provider+model combo supports native tool calling.
 * Ollama and thinking/reasoner models are excluded.
 */
export function supportsNativeToolCalling(provider: string, model: string): boolean {
  // Ollama does not have reliable tool calling support
  if (provider === 'ollama') return false;

  // DeepSeek thinking/reasoner models have instability with tool schemas
  const lowerModel = model.toLowerCase();
  if (
    provider === 'deepseek' &&
    (lowerModel.includes('reasoner') || lowerModel.includes('r1'))
  ) {
    return false;
  }

  // Supported providers
  return ['deepseek', 'openrouter', 'custom', 'litellm'].includes(provider) ||
    (typeof provider === 'string' && provider.startsWith('custom_'));
}
