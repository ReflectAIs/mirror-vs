# Prompt Engineering Tips

## Talk to Your AI Like a Human

Mirror VS is smart, but it's not a mind reader (that feature is coming in v2.0). The quality of what you get out depends heavily on what you put in. Here's how to craft prompts that get results.

## General Principles

### 1. Be Clear, Not Clever

You don't need to write poetry. You need to write instructions.

| Instead of This                                                                                                        | Try This                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| "Would you perhaps be so kind as to potentially consider the possibility of making the button slightly more blue-ish?" | "Change the button color to `#007bff`"                                      |
| "I was wondering if we could maybe optimize the loop a tiny bit if it's not too much trouble?"                         | "Optimize this loop. It's O(n²) and the production dataset has 500K items." |

Mirror VS respects politeness, but it responds better to clarity. Save the pleasantries for your human colleagues.

### 2. Provide Context, But Not _All_ the Context

Good prompt: "Here's the `UserService` class. Add validation to the `createUser` method that checks for duplicate emails."

Bad prompt: "Here's my entire 50,000-line codebase. Fix everything that's wrong with it."

Use [`@context mentions`](/basic-usage/context-mentions) to point Mirror VS at exactly the relevant files. If the AI needs to see three functions, mention three functions — not the entire module.

### 3. Break Down Complex Tasks

Mirror VS is better at completing ten small tasks perfectly than one massive task poorly.

Instead of:

```
Build me a full-stack e-commerce platform with user auth,
product management, shopping cart, payment processing,
and admin dashboard.
```

Try:

1. "Set up the project structure with Next.js and Prisma"
2. "Create the User model and authentication endpoints"
3. "Build the product listing API route"
4. "Implement the shopping cart functionality"
5. "Add Stripe payment integration"
6. "Create the admin dashboard layout"

Each step builds on the previous one, and Mirror VS can maintain focus throughout.

### 4. Give Examples

Sometimes showing is better than telling. If you want Mirror VS to follow a specific pattern, show it an example:

```
I need another function like this one, but for blog posts:

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

Create: function validatePost(post: BlogPost): ValidationResult
```

Mirror VS is great at pattern matching. Give it a pattern, and it'll run with it.

## Thinking vs. Doing

By default, Mirror VS thinks before it acts. This is usually a good thing — you want the AI to plan the architecture before writing 500 lines of code.

But sometimes you just need a quick answer:

- **Thinking mode**: "Should I use Redux or Zustand for this project?" — Let it reason
- **Doing mode**: "Add loading states to these three components" — Just execute

Mirror VS handles this automatically based on the [mode](/basic-usage/using-modes) you're in. Architect and Ask modes are more thoughtful. Code mode is more action-oriented.

## Using Custom Instructions

[Custom instructions](/features/custom-instructions) let you set persistent rules that apply to every task. This is where you define:

- Coding style preferences (tabs vs spaces — we're not judging, but tabs are correct)
- Project conventions
- Frameworks and libraries you prefer
- Things Mirror VS should always (or never) do

For example:

```markdown
# Always

- Use TypeScript strict mode
- Write unit tests for new functions
- Follow the existing project structure

# Never

- Use `any` type
- Modify configuration files without asking
- Delete code without explaining why
```

These instructions get injected into every prompt, so you don't have to repeat yourself. It's like having a permanent sticky note on Mirror VS's forehead.

## Handling Ambiguity

When Mirror VS encounters an ambiguous request, it does something smart: it asks for clarification. This isn't a bug — it's a feature. Would you rather the AI guess wrong and write 200 lines of code you didn't want?

If you want to reduce ambiguity:

- **Specify the output format**: "Return the result as JSON, not markdown"
- **Set boundaries**: "Only modify files in the `/src` directory"
- **Define success criteria**: "The function should pass these five test cases"

## Providing Feedback

Mirror VS learns from feedback within a conversation. If it does something wrong, tell it:

- "That's not what I meant. The `save` function should return the ID, not the whole object."
- "Close, but use `map` instead of `forEach` here."
- "Perfect, now do the same thing for the `delete` endpoint."

Constructive feedback works better than vague complaints. Mirror VS has feelings too. (Not really. It's ones and zeros. But still.)

## Examples

### Good Prompt

```
I'm working on a NestJS project with Prisma ORM.
I need to add a `findByEmail` method to the `UserService`.

Here's the current service: @UserService
Here's the Prisma schema: @schema.prisma

The method should:
1. Accept an email string
2. Query the database for a user with that email
3. Throw `NotFoundException` if not found
4. Return the user without the password field

Here's an existing method for reference: @existing-method
```

Why this works: context, specificity, examples, clear requirements.

### Bad Prompt

```
Add user search or something idk
```

Why this doesn't work: literally everything about it.

### Great Prompt

```
Fix this bug:

@buggy-component.tsx

The issue: When the user types in the search field,
the dropdown shows results from the previous search
for ~300ms before updating. This is a race condition.

The fix should:
1. Cancel the previous request when a new one starts
2. Show a loading state in the dropdown
3. Handle the edge case where results arrive out of order

Use AbortController for cancellation.
```

This prompt gives Mirror VS: the buggy code, a clear description of the problem, specific requirements for the fix, and even suggests the approach. The AI will thank you (metaphorically) and deliver better code.
