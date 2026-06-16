
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

1. Check the [roadmap](ROADMAP.md) and [existing feature requests](https://github.com/DipeshMajithia/mirror-vs/issues).
2. Use the **Feature Request** issue template.
3. Describe the use case, proposed solution, and any alternatives considered.

### Requesting a Provider or Model 🧠

- **New provider**: Use the [Provider Request](https://github.com/DipeshMajithia/mirror-vs/issues/new?template=provider_request.yml) template.
- **New model**: Use the [Model Request](https://github.com/DipeshMajithia/mirror-vs/issues/new?template=model_request.yml) template.

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

# Build the extension
npm run build

# Start the dev watcher (auto-rebuilds on save)
npm run watch

# Open in VS Code and press F5 to launch Extension Development Host
code .
```

#### Build Commands

| Command | Description |
| :--- | :--- |
| `npm run build` | Full production build via esbuild |
| `npm run watch` | Watch mode — rebuilds on file changes |
| `npm run compile` | TypeScript type-check (no emit) |
| `npm run lint` | Run ESLint |
| `npm run format:check` | Check Prettier formatting |
| `npm run format` | Auto-fix formatting with Prettier |
| `npm run test` | Run all tests (vitest) |
| `npm run check` | Run lint + format:check + tests together |

> **Note for Windows users**: If you see `spawnSync npm.cmd EINVAL`, ensure `npm` is available from your PATH and use PowerShell or Git Bash — CMD may have compatibility issues with certain scripts.

#### Branching Strategy

1. Fork the repository.
2. Create a feature branch from `main`:
   - `feat/your-feature-name` — new features
   - `fix/your-bug-fix` — bug fixes
   - `docs/your-doc-change` — documentation
   - `refactor/your-refactor` — refactoring
   - `test/your-test` — test additions
3. Make your changes.
4. Run checks: `npm run check`
5. Commit using [conventional commits](https://www.conventionalcommits.org/):
   - `feat: add multi-model chat`
   - `fix: resolve crash on empty input`
   - `docs: update README screenshots`
   - `refactor: extract tool registry`
   - `test: add agent-parser tests`
6. Push and open a pull request against `main`.
7. Ensure the PR description clearly describes the problem and solution.

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
├── .github/            # GitHub templates, workflows, configs
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
