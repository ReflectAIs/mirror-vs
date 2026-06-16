
# Security Policy 🔒

## Supported Versions

We release security patches for the latest stable version of Mirror VS. If you discover a vulnerability, we encourage you to report it immediately.

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | ✅ Active support |
| < 0.2.0 | ❌ No longer supported |

## Reporting a Vulnerability

**Do NOT open a public issue** to report a security vulnerability.

Instead, please report it via one of these channels:

1. **GitHub Security Advisories**: Use the [Private Vulnerability Reporting](https://github.com/DipeshMajithia/mirror-vs/security/advisories/new) feature on GitHub.
2. **Email**: If you cannot use GitHub's advisory system, email the maintainer directly at the address listed on the repository's public profile.

### What to Include

Please include as much of the following as possible:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Affected version(s)
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 5 business days
- **Expected Fix**: Within 30 days, depending on severity

We will coordinate the disclosure timeline with you and publish a security advisory once the fix is released.

## Security Best Practices for Users

### API Keys & Secrets

Mirror VS stores all API keys and credentials in VS Code's built-in [SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage), which integrates with your operating system's credential manager:

- **Windows**: Windows Credential Manager
- **macOS**: Keychain Access
- **Linux**: libsecret (GNOME Keyring / KDE Wallet)

This means:
- API keys are **never committed to git**
- API keys are **never written to plaintext files**
- API keys are **encrypted at rest** by your OS

### Terminal Commands

Mirror VS includes a built-in **terminal safety system** that:
- Detects potentially dangerous commands (e.g., `rm -rf`, `sudo`, destructive git operations)
- Requires explicit **human confirmation** before executing such commands
- Maintains a safety score for each terminal session

You can further restrict terminal access by enabling **Guide-Only Mode** in settings.

### Git-Powered Rollback

Every file operation creates an automatic git checkpoint snapshot, enabling:
- Full diff review before accepting changes
- Instant rollback of any AI-generated file edits
- Visual gutter markers (yellow/green/red) showing changed lines

### Network Security

- **Local Models**: When using Ollama, all processing stays on your machine — no code is sent to the cloud.
- **Cloud Providers**: When using DeepSeek, OpenRouter, LiteLLM, or Gemini, code is transmitted to the selected API endpoint over HTTPS.
- **MCP Servers**: Model Context Protocol servers run locally and communicate with the extension over local IPC.

## Dependency Verification

All npm dependencies are pinned with exact versions in `package-lock.json`. CI includes automated security audit scanning.

To run a security audit locally:

```bash
npm audit
```

## Responsible Disclosure

We follow [GitHub's coordinated disclosure guidelines](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/about-coordinated-disclosure-of-security-vulnerabilities). We request that you:

1. Give us reasonable time to investigate and fix the issue.
2. Do not exploit or abuse the vulnerability.
3. Do not disclose the vulnerability publicly until we confirm it's safe.

We appreciate your help in keeping Mirror VS and its users safe! ❤️
