---
description: Enable interactive communication in Mirror VS with the ask_followup_question tool for gathering clarification and user preferences.
keywords:
    - ask_followup_question
    - user interaction
    - interactive communication
    - Mirror VS tools
    - clarification
    - user feedback
---

# ask_followup_question

The `ask_followup_question` tool is how Mirror VS says "hey, I need a little more info before I can do this right." It's the AI's way of asking for clarification instead of guessing — which, trust us, you prefer.

---

## Parameters

- `question` (required): The specific question to ask
- `follow_up` (optional): 2-4 suggested answers within `<suggest>` tags to guide your response

---

## What It Does

Creates an interactive question-and-answer moment between Mirror VS and you. When the AI hits something ambiguous or needs a decision, it uses this tool to ask, complete with suggested answers you can click with one tap.

---

## When Is It Used?

- When critical information is missing from your request
- When Mirror VS needs to choose between valid approaches
- When preferences are needed to proceed
- When encountering ambiguity that needs resolution
- When more context would improve the solution

---

## Key Features

- Structured information gathering without breaking workflow
- Suggested answers reduce typing and guide responses
- Preserves conversation history across interactions
- Supports responses with images and code snippets
- Available in all modes — it's always there when needed
- Wraps responses in `<answer>` tags for clarity
- Resets consecutive error counter on success

---

## Limitations

- One question per use — no survey marathons
- Can't enforce structured responses (you can still answer freely)
- Overuse can make conversations feel fragmented
- Suggestions must be complete — no fill-in-the-blank

---

## How It Works

1. **Validates** the question and optional suggestions
2. **Transforms** XML into JSON for UI display
3. **Shows** selectable suggestion buttons in the interface
4. **Captures** your response (text + any images)
5. **Wraps** it in `<answer>` tags and returns to the AI
6. **Continues** the task with your new information

---

## Usage Examples

Asking about styling preferences:

```xml
<ask_followup_question>
<question>Which styling approach would you prefer?</question>
<follow_up>
<suggest>Bootstrap for rapid development</suggest>
<suggest>Tailwind CSS for utility-first flexibility</suggest>
<suggest>Vanilla CSS for complete control</suggest>
</follow_up>
</ask_followup_question>
```

Asking about authentication:

```xml
<ask_followup_question>
<question>How should we handle user authentication?</question>
<follow_up>
<suggest>Email/password with account verification</suggest>
<suggest>Social login (Google, GitHub, etc.)</suggest>
<suggest>Both email/password and social login</suggest>
</follow_up>
</ask_followup_question>
```
