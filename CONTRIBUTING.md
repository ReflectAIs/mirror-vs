
# Contributing to Mirror VS 🤝

Thank you for your interest in contributing! Mirror VS is an open-source AI-powered coding assistant for Visual Studio Code.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs 🐛

1. Search [existing issues](https://github.com/DipeshMajithia/mirror-vs/issues) to avoid duplicates.
2. Use the **Bug Report** issue template.
3. Include:
   - VS Code version
   - Extension version
   - OS details
   - Steps to reproduce
   - Expected vs actual behavior
   - Any relevant logs or screenshots

### Suggesting Features 💡

1. Check the [roadmap](README.md#-roadmap) and [existing feature requests](https://github.com/DipeshMajithia/mirror-vs/issues).
2. Use the **Feature Request** issue template.
3. Describe the use case, proposed solution, and any alternatives considered.

### Making Code Changes 🛠️

#### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.x
- [npm](https://www.npmjs.com/) >= 9.x
- [Visual Studio Code](https://code.visualstudio.com/) >= 1.80.0

#### Development Setup

```bash
# Clone the repository
git clone https://github.com/DipeshMajithia/mirror-vs.git
cd mirror-vs

# Install dependencies
npm install

# Start the dev watcher (auto-rebuilds on save)
npm run watch

# Open in VS Code and press F5 to launch Extension Development Host
code .
```

#### Branching Strategy

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes.
4. Run checks: `npm run check` (lint + format + tests)
5. Commit using [conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
6. Push and open a pull request against `main`.

#### Code Quality Standards

- **TypeScript**: All code must pass `npm run compile` without type errors.
- **Linting**: Run `npm run lint` — no errors allowed (warnings are OK within limits).
- **Formatting**: Run `npm run format` or `npm run format:check` to ensure consistent formatting.
- **Tests**: Add tests for new features and bug fixes. Run `npm run test` to verify.
- **Comments**: Use JSDoc-style comments for exported functions and complex logic.

#### Project Structure

```
mirror-vs/
├── src/
│   ├── agent/          # Agent logic, tools, prompts, and orchestration
│   ├── services/       # Core services (API, storage, MCP, etc.)
│   ├── providers/      # LLM provider implementations
│   ├── webview/        # Sidebar UI (HTML/CSS/JS)
│   │   └── sidebar/    # Sidebar source parts (10 JS modules)
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Shared utilities
├── media/              # Static assets
├── resources/          # Extension icons
└── scratch/            # Temporary workspace files
```

When modifying sidebar UI, **edit the source files in `src/webview/sidebar/`** and then rebuild — never edit the compiled `src/webview/sidebar.js` directly.

### Pull Request Checklist

- [ ] Code compiles without errors (`npm run compile`)
- [ ] Linting passes (`npm run lint`)
- [ ] Formatting is correct (`npm run format:check`)
- [ ] Tests pass (`npm run test`)
- [ ] New tests are added for new functionality
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventional commit style
- [ ] PR description clearly describes the problem and solution

## Style Guide

- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes
- **Semicolons**: Always
- **Trailing commas**: Yes
- **Formatting**: Use Prettier (`.prettierrc` is configured)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

