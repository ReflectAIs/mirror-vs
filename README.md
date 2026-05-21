# Mirror VS

Mirror VS is a premium, highly capable, and fully autonomous **AI coding assistant** integrated directly into the Visual Studio Code sidebar activity bar. Powered by local **Ollama** models or **DeepSeek's API**, Mirror VS allows you to paired-program, refactor, search, and run workspace actions using simple natural language.

---

## 🌟 Features

### 1. Unified Multimodal Chat Sidebar
- **Sleek modern UI** following premium IDE guidelines with custom dark modes, harmonized accent tones, and glassmorphism micro-animations.
- **Live Streamed Responses**: Direct, fast streaming of text and code token-by-token.
- **Visual Assets & Screen Captures**: Displays captured browser screenshots inline in the chat history.

### 2. Double-Agent LLM Providers
- **Local Ollama Support**: Run private, fast models locally (e.g., `llama3`, `qwen2.5-coder`, `mistral`, `deepseek-r1`) without sending your code to the cloud. Includes an auto-refreshing model finder.
- **DeepSeek API Support**: Connect to highly affordable, high-intelligence models (`deepseek-chat`, `deepseek-coder`) for complex programming tasks.

### 3. Fully Autonomous Workspace Tools
Mirror VS executes a multi-turn, goal-driven loop using high-precision XML tags to perform actions directly on your system:
- 📂 **High-Precision File Editing**: Create files or perform precise, Git-safe, diff-based line edits (`patch_file`) rather than full-file rewrites.
- 💻 **Smart Terminal Controller**: Execute commands, start development servers in the background, send interactive keystrokes (like `Ctrl+C` to kill processes), or manage terminal instances.
- 🌐 **Real-time Web Browser Integration**: Navigates URLs, clicks buttons, inputs text, returns DOM layouts, and captures screenshots automatically to verify server states or debug UI builds.
- 🔍 **Grep Code Search**: Recursively scan your workspace for variables, patterns, and methods.

### 4. Git-Protected Review & Revert System
- Every file operation creates a **git baseline snapshot** on your behalf.
- View changes in diff view gutter colors (yellow, green, red).
- Instantly accept, compare (`diffReview`), or rollback edits (`revertCheckpoint`) directly from the extension to avoid breaking code.

### 5. Smart Workspace Contexts
- **Active File Context**: Automatically detects the active file and highlights it in the sidebar.
- **Multi-File Autocomplete**: Reference multiple files in the workspace (using `@` autocomplete tag) to supply rich context to your assistant.
- **Context Optimizing Guardrails**: When history grows long, Mirror VS compresses older conversational turns via automated LLM summarization, maintaining rapid speed and low token overhead.

---

## 🚀 Quick Start

### 1. Prerequisites

You need one or both of the following backends to power Mirror VS:

*   **Ollama (Fully Local & Private)**:
    1. Download and install from [ollama.com](https://ollama.com).
    2. Start the Ollama server on your machine.
    3. Pull your preferred coding model using your terminal:
       ```bash
       ollama pull qwen2.5-coder:7b
       # Alternatively, for reasoning/agentic work:
       ollama pull deepseek-r1:8b
       # Or the default standard model:
       ollama pull llama3
       ```
*   **DeepSeek API (High Intelligence Cloud)**:
    1. Create an account on the [DeepSeek Platform](https://platform.deepseek.com).
    2. Generate an API Key under the API Keys tab.

### 2. Launch & Configuration

1. Launch **Visual Studio Code**.
2. Click the **Mirror VS logo** in the Activity Bar on the far left side of the window.
3. Open the **Settings Drawer** (represented by the gear icon ⚙️ in the top-right header of the Mirror VS sidebar).
4. Configure your preferred settings:
   - **Provider**: Choose `ollama` or `deepseek`.
   - **Ollama Host**: Defaults to `http://localhost:11434`. (Ensure Ollama is running!)
   - **Ollama Model**: Type the exact name of the model you pulled (e.g., `qwen2.5-coder:7b` or `llama3`).
   - **DeepSeek Key**: Securely input your DeepSeek API Key.

---

## 🔒 Security & Privacy Guarantees

Mirror VS is built with security first in mind:
- **Local Isolation**: If you use the Ollama provider, **100% of your source code and prompt conversations remain entirely local** on your machine. No telemetry or telemetry-adjacent data is sent to external servers.
- **Encrypted Secret Storage**: When using DeepSeek, your API Key is stored safely using VS Code's native [SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage). This securely hooks into your operating system's credential manager (Windows Credential Manager, macOS Keychain, or Linux libsecret), meaning your secrets are never saved in cleartext or in workspace settings files.
- **Git Sandboxing**: Every autonomous tool execution creates a temporary snapshot using git commits, allowing you to compare and revert changes cleanly with absolute peace of mind.

---

## 💻 Local Development & Contributing

Want to tweak Mirror VS, build new tools, or contribute? Setup is incredibly easy:

1. Clone the repository:
   ```bash
   git clone https://github.com/DipeshMajithia/mirror-vs.git
   cd mirror-vs
   ```
2. Install all development and runtime dependencies:
   ```bash
   npm install
   ```
3. Compile the extension and start the watcher:
   ```bash
   npm run watch
   ```
4. Press `F5` inside VS Code to launch the **Extension Development Host**. A new VS Code workspace will open with your local dev build of Mirror VS fully active!

---

## ⚙️ Configuration Settings

Customize Mirror VS's behavior inside your VS Code `settings.json` or through the interactive Settings Panel:

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `mirror-vs.defaultProvider` | `string` | `"ollama"` | Active LLM Provider (`"ollama"` or `"deepseek"`). |
| `mirror-vs.ollamaHost` | `string` | `"http://localhost:11434"` | Base URL of your running Ollama server. |
| `mirror-vs.defaultOllamaModel` | `string` | `"llama3"` | Default local Ollama model. |
| `mirror-vs.defaultDeepSeekModel` | `string` | `"deepseek-chat"` | Default DeepSeek API model. |
| `mirror-vs.maxTurnsBeforeSummarize` | `number` | `16` | Max turn count before conversation context is compressed. |
| `mirror-vs.turnsToRetain` | `number` | `6` | Number of recent turns to retain as active context after compression. |

---

## 🛠️ Commands

You can run these commands from the VS Code **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Focus Mirror VS Sidebar` (`mirror-vs.focusSidebar`) - Open and focus the assistant sidebar.
- `Clear Active Chat Session` (`mirror-vs.clearChat`) - Clear all current messages.
- `Compare Changes` (`mirror-vs.diffReview`) - Compare agent modifications against git baseline.
- `Accept Changes` (`mirror-vs.acceptReview`) - Accept all active agent edits.
- `Reject Changes` (`mirror-vs.rejectReview`) - Roll back and reject modifications.

---

## 🛡️ License

This extension is licensed under the [MIT License](LICENSE).
