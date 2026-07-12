# Context Poisoning

## What Is Context Poisoning?

Imagine you're having a conversation, and someone keeps whispering incorrect facts into your ear. Eventually, you start mixing up what's real and what's not. That's context poisoning.

In Mirror VS terms, context poisoning happens when the AI's working memory (the conversation history) gets corrupted by bad data, leading to progressively worse outputs, weird tool choices, and decisions that make you question reality.

## Symptoms of Context Poisoning

How to tell if your Mirror VS session is suffering from a case of the junk-contexts:

| Symptom                     | What It Looks Like                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **Degraded Output Quality** | The AI starts producing code that looks like it was written by a sleep-deprived octopus |
| **Tool Misalignment**       | It reaches for `write_to_file` when `apply_diff` was clearly the right call             |
| **Orchestration Failures**  | Delegated subtasks come back with results that have nothing to do with what you asked   |
| **Repetition Loops**        | The AI keeps re-reading the same files or re-running the same commands                  |
| **Hallucinated Context**    | It starts referencing files, variables, or requirements that never existed              |

If your AI assistant suddenly starts acting like it's been replaced by a glitchy version of itself, context poisoning is the likely culprit.

## Common Causes

### 1. Hallucination Spiral

The AI makes a mistake. That mistake gets added to the conversation history. The AI reads its own mistake and builds on it. Congratulations — you've created a self-reinforcing loop of wrongness.

### 2. Code Comment Contamination

You left a comment like `// TODO: fix this terrible hack` in your code. The AI reads it and decides your whole codebase is a disaster zone that needs rewriting. Be careful what you write in comments — Mirror VS is paying attention.

### 3. Contaminated Input

Pasting large amounts of irrelevant or misleading content into the chat can clog the AI's context with noise, making it harder to find the signal. It's like trying to have a focused conversation in the middle of a heavy metal concert.

### 4. Context Window Overflow

When the conversation gets too long, the context window starts acting like a crowded elevator — everyone's squished together, things get uncomfortable, and the AI starts making poor decisions because it can't see the full picture anymore.

## Can a "Wake-Up Prompt" Resolve Context Poisoning?

Short answer: **No, not reliably.**

The "wake-up prompt" (sending messages like "remember you're an expert coding assistant" or "focus on the actual task") sounds like a good idea. It's not.

Here's why: these prompts get appended to an already-poisoned context. You're essentially adding a fresh coat of paint to a structurally compromised building. The bad data is still there, lurking in the history, ready to influence future responses.

Research and internal testing shows wake-up prompts provide at most a **temporary improvement** that degrades rapidly. They're a band-aid on a bullet wound.

## Effective Recovery Strategies

### Hard Reset (The Nuclear Option)

1. **Start a new task** — this clears the conversation history
2. **Review checkpoint files** — restore from a known-good state
3. **Re-provide context** — but only what's necessary, not the firehose

A hard reset is the only guaranteed fix. It's like rebooting your computer when things get weird — sure, you lose your session, but at least the weird noises stop.

### Minimize Data Dumps

When providing context to Mirror VS, be surgical. Ask yourself:

- Does the AI need the entire file, or just the relevant function?
- Does it need the whole conversation history, or just the current task?
- Does it need your entire `node_modules` directory? (Spoiler: no. Never no.)

### Validate Tool Output

Keep an eye on what the AI is doing. If it starts making changes you didn't ask for, or editing files that aren't relevant, that's your cue to intervene early before the poisoning spreads.

## Addressing a Common Question: The "Magic Bullet" Prompt

> "But what if I write a really good prompt that fixes everything?"

We admire the optimism. But context poisoning isn't a prompt problem — it's a data integrity problem. No amount of clever phrasing will fix corrupted context any more than a sternly worded letter will fix a leaky roof.

The fix is always the same: **clear the slate and start fresh**. It's not glamorous, but it works. And after a few rounds of context poisoning, you'll learn to appreciate the clean feeling of a brand-new, untainted conversation.
