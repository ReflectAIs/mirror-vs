import { TaskMode } from './orchestrator';

export const GUIDE_ONLY_DIRECTIVE =
  '## GUIDE-ONLY MODE - TOOL POLICY\n' +
  'The latest user turn explicitly forbids tool use. Do not call tools, do not ' +
  'run shell commands, and do not inspect local files or the environment. ' +
  'Respond in normal text by guiding the user or asking them to paste the ' +
  'output they will produce locally.';

const GUIDE_ONLY_PATTERNS = [
  /\bguide[-\s]?only mode\b/i,
  /\bno[-\s]?tools? mode\b/i,
  /\bdo not use (?:any )?tools?\b/i,
  /\bdon'?t use (?:any )?tools?\b/i,
  /\bnot allowed to use (?:any )?tools?\b/i,
  /\bask (?:me )?(?:for confirmation )?before using tools?\b/i,
];

export function detectGuideOnly(message: string): boolean {
  if (!message) return false;
  const cleaned = message.replace(/\s+/g, ' ').trim();
  return GUIDE_ONLY_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export const DOMAIN_TOOL_MAP: Record<string, Set<string>> = {
  code_analysis: new Set([
    'analyze_project',
    'analyze_dependencies',
    'analyze_complexity',
    'analyze_coverage',
    'analyze_dead_code',
    'analyze_impact',
    'graphify',
    'get_diagnostics',
    'lint_fix',
  ]),
  file_ops: new Set([
    'read_file',
    'create_file',
    'write_file',
    'patch_file',
    'multi_patch_file',
    'rename_file',
    'delete_file',
    'update_plan',
  ]),
  terminal: new Set([
    'run_command',
    'send_terminal_input',
    'close_terminal',
    'read_terminal',
    'list_terminals',
    'python_eval',
  ]),
  git: new Set(['git_status', 'git_diff', 'git_add', 'git_commit']),
  search: new Set(['grep_search', 'symbol_search', 'ast_grep']),
  browser: new Set([
    'browser_navigate',
    'browser_click',
    'browser_type',
    'browser_evaluate_script',
    'browser_screenshot',
  ]),
  figma: new Set(['figma_inspect']),
};

export const DOMAIN_RULES: Record<string, string> = {
  code_analysis:
    '### Code Analysis Rules\n- Use graphify or analyze_project to understand structural dependencies and exports.\n- Check diagnostics for compiling status before declaring a fix is done.',
  file_ops:
    '### File Operation Rules\n- Prefer patch_file for targeted changes over overwriting with write_file.\n- Do not delete files without explicit user approval.',
  terminal:
    '### Terminal Rules\n- Use run_command to execute builds or test suites.\n- Ensure you do not leave unwanted background commands running.',
  git: '### Git Rules\n- Use git_status and git_diff to double check changes before finalizing.',
  search: '### Search Rules\n- Use grep_search for fast, case-insensitive keyword lookup across the repository.',
  browser:
    '### Browser Automation Rules\n- Take screenshots with browser_screenshot to visually verify layout or rendering changes.',
  figma: '### Figma Rules\n- Use figma_inspect to retrieve design coordinates, layers, or styling specs.',
};

/**
 * Filter and compose relevant rules based on the tools that are active this turn.
 */
export function domainRulesForTools(activeTools: Set<string>): string {
  const rules: string[] = [];
  for (const [domain, tools] of Object.entries(DOMAIN_TOOL_MAP)) {
    const hasActiveTool = [...activeTools].some((tool) => tools.has(tool));
    if (hasActiveTool && DOMAIN_RULES[domain]) {
      rules.push(DOMAIN_RULES[domain]);
    }
  }
  return rules.join('\n\n');
}

// Mode-based allowed tools denylists/allowlists
export const REVIEW_MODE_TOOLS = new Set([
  'read_file',
  'graphify',
  'analyze_project',
  'grep_search',
  'symbol_search',
  'get_diagnostics',
  'git_diff',
  'git_status',
]);

export const PLAN_MODE_TOOLS = new Set([...REVIEW_MODE_TOOLS, 'run_command']);

/**
 * Retrieve the set of disallowed tools for a given TaskMode.
 */
export function getDisabledToolsForMode(mode: TaskMode, allTools: Set<string>): Set<string> {
  const allowed = mode === TaskMode.REVIEW ? REVIEW_MODE_TOOLS : mode === TaskMode.VERIFY ? PLAN_MODE_TOOLS : allTools;
  return new Set([...allTools].filter((t) => !allowed.has(t)));
}

export const DOMAIN_KEYWORD_MAP: Record<string, string[]> = {
  code_analysis: [
    'analyze',
    'structure',
    'import',
    'export',
    'dependency',
    'graph',
    'diagnostics',
    'complexity',
    'dead code',
    'coverage',
    'graphify',
    'lint',
    'format',
    'eslint',
    'prettier',
    'lint_fix',
  ],
  terminal: [
    'run',
    'command',
    'terminal',
    'compile',
    'test',
    'npm',
    'yarn',
    'pnpm',
    'vitest',
    'build',
    'execute',
    'exec',
    'python',
    'python_eval',
    'eval',
  ],
  git: ['git', 'commit', 'diff', 'stage', 'status', 'add', 'push', 'pull', 'log', 'branch'],
  browser: ['browser', 'screenshot', 'navigate', 'click', 'type', 'url', 'web', 'page', 'site', 'viewport', 'preview'],
  figma: ['figma', 'design', 'inspect', 'layer', 'coordinate', 'style', 'color', 'pixel'],
};

export function getToolsForQuery(query: string, allTools: Set<string>): Set<string> {
  if (!query) return allTools;
  const ql = query.toLowerCase();
  const activeDomains = new Set<string>();

  // Always enable file_ops and search by default (core workflow)
  activeDomains.add('file_ops');
  activeDomains.add('search');

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORD_MAP)) {
    if (keywords.some((kw) => ql.includes(kw))) {
      activeDomains.add(domain);
    }
  }

  // Fallback: If no custom domains match and it's a short/vague query, keep everything active to be safe
  if (activeDomains.size === 2 && ql.length < 15) {
    return allTools;
  }

  const filtered = new Set<string>();
  for (const tool of allTools) {
    // Check if tool is in one of the active domains
    let isDomainTool = false;
    for (const [domain, tools] of Object.entries(DOMAIN_TOOL_MAP)) {
      if (tools.has(tool)) {
        isDomainTool = true;
        if (activeDomains.has(domain)) {
          filtered.add(tool);
        }
      }
    }
    // If tool is not mapped to any domain, keep it
    if (!isDomainTool) {
      filtered.add(tool);
    }
  }

  // Ensure core tools are never pruned
  const coreTools = ['read_file', 'patch_file', 'grep_search'];
  for (const core of coreTools) {
    if (allTools.has(core)) {
      filtered.add(core);
    }
  }

  return filtered;
}
