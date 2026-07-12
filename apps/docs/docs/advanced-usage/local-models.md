# Using Local Models

## Why Go Local?

Three reasons: **privacy**, **offline capability**, and **cost**.

- **Privacy**: Your code never leaves your machine. Not a single line touches the internet. If you're working on something that makes legal teams nervous, this is your jam.
- **Offline**: No internet? No problem. Local models work on a plane, in a cabin, or in that underground bunker you've been prepping.
- **Cost**: No per-token fees. Once you've bought the hardware, every request is free. Well, free except for the electricity bill, but we're not counting that.

The trade-off? Local models are generally smaller and less capable than cloud-based ones. They're like bringing a pocket knife to a lightsaber fight — still useful, but don't expect to cut through starship hulls.

## Supported Local Model Providers

Mirror VS supports two local model providers out of the box:

### Ollama

[Ollama](https://ollama.ai) is the most popular way to run local models. It's straightforward, well-supported, and works on macOS, Linux, and Windows.

Popular models for coding with Ollama:

| Model               | Size   | Coding Ability | Hardware Needed |
| ------------------- | ------ | -------------- | --------------- |
| CodeLlama 7B        | ~4GB   | Decent         | 8GB+ RAM        |
| CodeLlama 13B       | ~7.5GB | Good           | 16GB+ RAM       |
| CodeLlama 34B       | ~19GB  | Very Good      | 32GB+ RAM       |
| DeepSeek Coder 6.7B | ~4GB   | Good           | 8GB+ RAM        |
| Mistral 7B          | ~4GB   | Solid          | 8GB+ RAM        |

### LM Studio

[LM Studio](https://lmstudio.ai) offers a more visual interface for managing and running models. It's great if you prefer clicking buttons to typing commands.

Both providers work the same way in Mirror VS: you select them as your API provider, point them at the local server, and you're off to the races. The models run on your machine, Mirror VS talks to them through a local API, and your data never leaves home.

## Setting Up Local Models

### Ollama Setup

```bash
# Install Ollama (macOS / Linux)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a coding model
ollama pull codellama:7b

# Run the server
ollama serve
```

Once Ollama is running, configure Mirror VS:

1. Open **Settings** → **API Provider**
2. Select **Ollama**
3. The base URL defaults to `http://localhost:11434`
4. Select your model from the dropdown
5. Start coding

### LM Studio Setup

1. Download and install from [lmstudio.ai](https://lmstudio.ai)
2. Load a model
3. Start the local inference server (typically on port 1234)
4. In Mirror VS, select **LM Studio** as your provider
5. Set the base URL to `http://localhost:1234/v1`
6. You're in business

## Tips for Local Model Success

- **Start small**: Begin with a 7B parameter model. If it feels too dumb, scale up. Your GPU will tell you when you've gone too far.
- **Be patient**: Local models are slower than cloud APIs. A simple code generation that takes 2 seconds on Claude might take 30 seconds locally. Grab a coffee. Or a really small coffee.
- **Keep tasks focused**: Local models have smaller context windows and less reasoning power. Break your requests into smaller chunks. Think of it as feeding a squirrel — one nut at a time.
- **Monitor your resources**: Running a 34B model on 16GB of RAM is technically possible, but your computer might start sounding like a jet engine.

## Troubleshooting

| Problem            | Likely Cause                   | Solution                                    |
| ------------------ | ------------------------------ | ------------------------------------------- |
| Connection refused | Ollama/LM Studio isn't running | Start the server first                      |
| Slow responses     | Model too large for hardware   | Try a smaller model                         |
| Garbled output     | Wrong model format             | Download the correct quantization           |
| Out of memory      | Model exceeds RAM/VRAM         | Try a 4-bit quantized version               |
| "Model not found"  | Model name mismatch            | Double-check spelling in Mirror VS settings |

## The Bottom Line

Local models give you privacy and freedom at the cost of power and speed. They're perfect for prototyping, working offline, or handling sensitive code. For heavy lifting, you'll probably still want a cloud model. But having both options in Mirror VS means you can choose the right tool for each job — and isn't that the dream?
