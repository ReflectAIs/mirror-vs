# Mirror XR Backend

FastAPI WebSocket server that bridges **Unity (Meta Quest 3S)** and the
**mirror-vs** coordinator/agent loop. Receives JSON from Unity over
`/ws/chat`, routes each message through memory lookup → agent loop (tool
execution + response generation), and streams JSON responses back.

## Quick start (macOS)

```bash
cd mirror-vs/server
./run.sh --setup   # creates .venv and installs dependencies (one time)
./run.sh           # starts uvicorn on 0.0.0.0:8000
```

Or without the script:

```bash
cd mirror-vs/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The server listens on `0.0.0.0` so a Quest on the same Wi-Fi can reach it via
your Mac's LAN IP (find it with `ipconfig getifaddr en0`). In Unity, set the
`serverUrl` to `ws://<YOUR-MAC-LAN-IP>:8000/ws/chat` when testing on-device,
or `ws://127.0.0.1:8000/ws/chat` in the Editor.

## Protocol

**Inbound (Unity → Mirror):**

```json
{ "user_id": "dipesh", "message": "Good morning Mirror", "timestamp": "2026-08-08T08:14:00Z" }
```

**Outbound (Mirror → Unity):**

```json
{
	"sender": "Mirror",
	"response": "Good morning, Dipesh! ...",
	"action": "display_text",
	"timestamp": "2026-08-08T08:14:02Z"
}
```

## Architecture

```
Unity (Meta Quest 3S)
   │  WebSocket JSON
   ▼
server/app/main.py          /ws/chat endpoint (accept, parse, reply)
   ▼
server/app/coordinator.py   1) memory lookup  2) agent loop  3) store reply
   │
   ├─► server/app/cli_bridge.py  ──►  mirror CLI (stdin-stream NDJSON)
   │        spawns: mirror --print --output-format stream-json \
   │                      --stdin-prompt-stream --signal-only-exit
   │        commands: start / message / cancel / ping / shutdown
   │        events:   assistant / control / result / error / ...
   │
   └─► server/app/coordinator.py  local fallback (deterministic, no API key)
```

- `schemas.py` — Pydantic models for the exact inbound/outbound JSON contract.
- `memory.py` — per-user rolling transcript (memory lookup; swap for a DB later).
- `cli_bridge.py` — persistent child process speaking the mirror-vs
  stdin-stream protocol; hands messages to the real agent loop.
- `coordinator.py` — routes through the agent loop, falls back to a local
  deterministic coordinator so the loop works end-to-end before an API key is
  configured.

## Using the real mirror-vs agent loop

The backend prefers the `mirror` CLI agent loop whenever it is on `PATH` and
configured. To enable it:

```bash
# point the backend at a specific build (optional; defaults to `mirror`)
export MIRROR_CLI="/path/to/mirror"

# configure an API key for the agent loop (e.g. OpenRouter / Anthropic)
# per the mirror-vs docs; then the CLI bridge handles tools + generation.
```

Until then, every message is answered by the local fallback coordinator, so
the Unity ↔ backend loop is fully testable immediately.

## Testing the endpoint without Unity

```bash
python - <<'PY'
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://127.0.0.1:8000/ws/chat") as ws:
        await ws.send(json.dumps({"user_id": "dipesh", "message": "Good morning Mirror"}))
        print(await ws.recv())

asyncio.run(main())
PY
```

## Layout

```
server/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app + /ws/chat
│   ├── schemas.py       # inbound/outbound models
│   ├── memory.py        # per-user memory store
│   ├── cli_bridge.py    # mirror CLI stdin-stream bridge
│   └── coordinator.py   # coordinator + local fallback
├── requirements.txt
├── run.sh               # macOS setup/run script
└── README.md
```
