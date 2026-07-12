---
description: Learn how Mirror VS uses tools to interact with your system. Understand file operations, command execution, and the approval workflow.
keywords:
    - Mirror VS tools
    - AI tools
    - file operations
    - command execution
    - tool approval
---

# How Tools Work

Mirror VS doesn't just talk a big game — it actually does stuff. And the way it does stuff is through **tools**. These are specialized helpers that read files, make edits, run commands, and search your codebase. Think of them as Mirror VS's hands, eyes, and vocal cords.

You describe what you want in plain English. Mirror VS picks the right tool for the job. It's that simple.

---

## Tool Workflow

Here's the dance — four steps, no complicated footwork:

1. **You say the thing.** "Fix this bug," "Refactor that function," "Deploy to Mars." Whatever.
2. **Mirror VS picks a tool.** It analyzes your request and selects the appropriate tool. No, you don't need to tell it which one.
3. **You review and approve.** Mirror shows you the tool, its parameters, and what it's about to do. You get to be the responsible adult.
4. **Results come back.** Mirror executes the approved action and shows you what happened. Rinse and repeat until your task is done.

---

## Tool Categories

| Category | Purpose                                    | Tool Names                                                                          |
| :------- | :----------------------------------------- | :---------------------------------------------------------------------------------- |
| Read     | Access file content and code structure     | `read_file`, `search_files`, `list_files`, `codebase_search`, `read_command_output` |
| Edit     | Create or modify files and code            | `write_to_file`, `apply_diff`, `apply_patch`, `edit`, `edit_file`, `search_replace` |
| Execute  | Run commands and perform system operations | `execute_command`                                                                   |
| Image    | Generate AI-powered images                 | `generate_image`                                                                    |
| Workflow | Manage task flow and context               | `ask_followup_question`, `attempt_completion`, `switch_mode`, `new_task`, `skill`   |

---

## Example: Using Tools

Let's see this in action. It's less "watching paint dry" and more "watching AI paint":

<img src="/img/how-tools-work/how-tools-work.png" alt="Tool approval interface showing Save and Reject buttons along with Auto-approve checkbox" width="600" />

_The tool approval interface. Two buttons, one checkbox, infinite possibilities._

**You:** "Create a file named `greeting.js` that logs a greeting message"

**Mirror VS:** (Thinks for a moment, then proposes the `write_to_file` tool)

```
<write_to_file>
<path>greeting.js</path>
<content>
function greet(name) {
  console.log(`Hello, ${name}!`);
}

greet('World');
</content>
<line_count>5</line_count>
</write_to_file>
```

**You:** (Clicks "Save" — or "Reject" if you're feeling contrary today)

**Mirror VS:** "File created. What's next?"

---

## Tool Safety and Approval

Every tool use requires your explicit approval. Mirror VS doesn't go rogue on you — this isn't that kind of movie. When Mirror proposes a tool, you'll see:

- **Save** — Approve and execute. Green light. Go go go.
- **Reject** — Decline the proposal. Maybe you want something different. Maybe you just want to feel powerful.
- **Auto-approve** — For trusted operations you're tired of clicking through. Check this box and Mirror runs those specific tools without asking. Use wisely. With great power comes great responsibility.

This safety net ensures **you** remain in control. Mirror VS is your co-pilot, not your pilot. Review proposals carefully, then hit Save like you mean it.

---

## Core Tools Reference

| Tool Name               | Description                                                 | Category |
| :---------------------- | :---------------------------------------------------------- | :------- |
| `read_file`             | Reads file content with line numbers (for the organized)    | Read     |
| `search_files`          | Regex search across your files (find anything, fast)        | Read     |
| `list_files`            | Lists files and directories (explore without clicking)      | Read     |
| `codebase_search`       | Semantic search across your indexed codebase                | Read     |
| `read_command_output`   | Grabs truncated output from previous commands               | Read     |
| `write_to_file`         | Creates new files or overwrites existing ones               | Edit     |
| `apply_diff`            | Makes precise, surgical edits to specific file sections     | Edit     |
| `apply_patch`           | Applies multi-file unified diff patches                     | Edit     |
| `edit`                  | Search-and-replace (first occurrence, by default)           | Edit     |
| `edit_file`             | Search-and-replace (all occurrences, with count validation) | Edit     |
| `search_replace`        | Search-and-replace (all occurrences, simple mode)           | Edit     |
| `execute_command`       | Runs commands in the VS Code terminal                       | Execute  |
| `generate_image`        | Generates AI-powered images from text prompts               | Image    |
| `ask_followup_question` | Asks clarifying questions (it knows when it doesn't know)   | Workflow |
| `attempt_completion`    | Declares the task done (virtual mic drop)                   | Workflow |
| `switch_mode`           | Changes to a different operational mode                     | Workflow |
| `new_task`              | Creates a new subtask in a specific starting mode           | Workflow |
| `skill`                 | Loads and executes predefined skill instructions            | Workflow |

---

## Learn More About Tools

Hungry for more detail about each tool — parameters, advanced patterns, the works? Check out the full [Tool Use Overview](/advanced-usage/available-tools/tool-use-overview) documentation. It's like this page, but with more parentheses and edge cases.
