---
description: Learn how to effectively communicate with Mirror VS using natural language. Best practices for typing requests, examples, and common pitfalls to avoid.
keywords:
    - Mirror VS requests
    - natural language AI
    - typing commands
    - AI communication
    - request examples
    - best practices
---

# Typing Your Requests

Here's the best part about Mirror VS: **you don't need to learn a language to talk to it.** No special syntax. No cryptic commands. No arcane incantations. Just type what you want in plain English (or your language of choice), as if you were asking a colleague for help.

<img src="/img/typing-your-requests/naturally.gif" alt="Example of typing a request in Mirror VS" width="600" />

---

## Effective Request Strategies

Being clear about what you want gets you better results. It's the same with humans, really.

| Strategy             | Implementation                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------ |
| **Be specific**      | "Fix the bug in `calculateTotal` that returns incorrect results" instead of "Fix the code" |
| **Provide context**  | Use @ [Context Mentions](/basic-usage/context-mentions) for file and code references       |
| **Break down tasks** | Submit complex tasks in smaller manageable steps                                           |
| **Include examples** | Provide sample code when you need specific formatting or style                             |

---

## Example Requests

Here are some real-world requests that actually work:

```
create a new file named `utils.py` and add a function called `add` that takes two numbers as arguments and returns their sum
```

```
in the file @src/components/Button.tsx, change the color of the button to blue
```

```
find all instances of the variable `oldValue` in @/src/App.js and replace them with `newValue`
```

```
run the command `npm install` in the terminal
```

```
explain the function `calculateTotal` in @/src/utils.ts
```

```
@problems address all detected problems
```

See? You just... type stuff. It's almost disappointingly simple.

---

## Common Pitfalls to Avoid

| DON'T                           | DO                                        |
| ------------------------------- | ----------------------------------------- |
| Vague requests                  | Specify exactly what needs to be done     |
| Assuming context                | Explicitly reference files and functions  |
| Excessive technical jargon      | Use clear, straightforward language       |
| Multiple unrelated tasks        | Submit one focused request at a time      |
| Proceeding without confirmation | Check the code to make sure it's complete |
