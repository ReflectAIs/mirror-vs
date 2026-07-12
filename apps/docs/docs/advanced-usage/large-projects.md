# Working with Large Projects

## The Context Window: Your AI's Working Memory

Mirror VS is powerful, but even the best AI has a finite attention span. The **context window** is how much information the model can hold in its "working memory" at once. Think of it as a whiteboard — once it fills up, something has to get erased before anything new can be written.

For large projects, this matters. A lot.

## Understanding Context Limits

Every AI model has a maximum context window. Here's roughly what you're working with:

| Model             | Context Window | What That Means for You    |
| ----------------- | -------------- | -------------------------- |
| Claude 3.5 Sonnet | ~200K tokens   | A novel's worth of context |
| GPT-4o            | ~128K tokens   | A decent-sized novella     |
| DeepSeek V3       | ~128K tokens   | Same ballpark              |
| Gemini 1.5 Pro    | ~2M tokens     | Basically "yes"            |

But here's the thing: just because the model _can_ hold 200K tokens doesn't mean you _should_ fill it up. Performance degrades as context grows, and costs go up. It's like stuffing your suitcase to the breaking point — technically possible, but you're going to have a bad time.

## Strategies for Managing Context

### 1. Work Incrementally

Don't ask Mirror VS to refactor your entire monorepo in one go. Break work into smaller, focused tasks:

- **Good**: "Refactor the authentication module"
- **Bad**: "Refactor every file in the entire project, optimize the database schema, rewrite the frontend in a different framework, and also write documentation"

One step at a time. Your AI's context window will thank you.

### 2. Use the Right Mode

- **Architect mode**: For planning and design — uses less context because it's not holding all your source files in memory
- **Code mode**: For implementation — more context-hungry, but more focused on execution
- **Ask mode**: For questions — lightweight, perfect for quick queries without loading the whole project

### 3. Leverage .mirrorignore

Use a [`.mirrorignore`](/features/mirrorignore) file to exclude files that Mirror VS doesn't need to see. Your `node_modules`, `.git`, and `dist` directories aren't helping the AI make better decisions — they're just taking up valuable mental real estate.

### 4. Be Surgical with Context Mentions

Instead of mentioning entire folders, mention specific files. Instead of pasting the entire error log, paste the relevant section. Context mentions are a laser scalpel, not a flamethrower.

### 5. Use Checkpoints

Mirror VS's [checkpoint system](/features/checkpoints) lets you save and restore project states. If you hit a context limit mid-task, you can save your progress, start a fresh task, and restore the checkpoint. It's like saving your game before entering a boss fight.

## Example: Refactoring a Large File

Let's say you have a 2000-line TypeScript file that needs refactoring. Here's what _not_ to do:

```
Refactor this entire file, extract all the utilities,
fix the error handling, add types, and make it clean.
```

Instead, try this approach:

**Step 1**: Ask Mirror VS to analyze the file and suggest a plan
**Step 2**: Refactor one section at a time
**Step 3**: After each section, verify the changes
**Step 4**: Start a new task for the next section

```mermaid
flowchart LR
    A[Analyze File] --> B[Plan Refactoring]
    B --> C[Refactor Section 1]
    C --> D[Verify & Test]
    D --> E[New Task: Section 2]
    E --> F[Refactor Section 2]
    F --> G[Verify & Test]
```

This approach keeps context fresh, reduces errors, and makes it easier to track what changed. Plus, if something goes wrong in section 3, you don't lose the work from sections 1 and 2.

## When Size Matters

Large projects aren't a problem for Mirror VS — they're just a challenge that requires a bit of strategy. Think of it like packing for a long trip: you wouldn't throw everything you own into a single suitcase and hope for the best. You'd pack strategically, use multiple bags, and accept that you might need to do laundry along the way.

Mirror VS works the same way. Be strategic, work incrementally, and you'll get through even the largest codebases without breaking a sweat.
