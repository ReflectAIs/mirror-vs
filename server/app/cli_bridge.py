"""Bridge between the Mirror XR backend and the mirror-vs CLI agent loop.

The mirror-vs CLI exposes a persistent, line-delimited (NDJSON) stdin-stream
protocol (see apps/cli/src/commands/cli/stdin-stream.ts):

  Input commands (one JSON object per line on stdin):
    {"command": "start",   "requestId": "...", "prompt": "..."}
    {"command": "message", "requestId": "...", "prompt": "..."}
    {"command": "cancel",  "requestId": "..."}
    {"command": "ping",    "requestId": "..."}
    {"command": "shutdown","requestId": "..."}

  Output events (one JSON object per line on stdout):
    system | control | queue | assistant | user | tool_use | tool_result
    thinking | error | result

The `result` event is the final output and carries `content` (the assembled
agent response). Assistant deltas are also accumulated as a fallback.

We spawn:
    mirror --print --output-format stream-json \
           --stdin-prompt-stream --signal-only-exit

This hands the message to the mirror-vs coordinator/agent loop, which owns
memory, tool execution, and response generation. If the CLI is missing,
misconfigured (e.g. no API key), or times out, callers should fall back to
the local coordinator.
"""

import asyncio
import json
import os
import shutil
import uuid
from typing import Any, Dict, List, Optional

COMMAND = os.environ.get("MIRROR_CLI", "mirror")


class CliBridgeError(RuntimeError):
    """Raised when the mirror CLI agent loop cannot produce a response."""


def mirror_cli_available() -> bool:
    """True if a `mirror` (or MIRROR_CLI) executable is on PATH."""
    return shutil.which(COMMAND) is not None


class MirrorCliBridge:
    """A single long-lived child process speaking the stdin-stream protocol."""

    def __init__(self, cli: str = COMMAND) -> None:
        self._cli = cli
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._events: List[Dict[str, Any]] = []
        # Once the child dies or a run times out, mark it unusable so
        # subsequent messages fail fast instead of stalling the loop.
        self._unusable = False

    async def start(self) -> None:
        if self._proc is not None:
            return
        self._proc = await asyncio.create_subprocess_exec(
            self._cli,
            "--print",
            "--output-format",
            "stream-json",
            "--stdin-prompt-stream",
            "--signal-only-exit",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        self._reader_task = asyncio.create_task(self._read_stdout())

    async def stop(self) -> None:
        if self._proc is None:
            return
        try:
            await self._send({"command": "shutdown", "requestId": uuid.uuid4().hex})
        except Exception:
            pass
        try:
            self._proc.terminate()
            await asyncio.wait_for(self._proc.wait(), timeout=3)
        except Exception:
            try:
                self._proc.kill()
            except Exception:
                pass
        self._proc = None

    async def _read_stdout(self) -> None:
        """Continuously read NDJSON events from the child's stdout."""
        assert self._proc is not None
        buffer = ""
        while True:
            line = await self._proc.stdout.readline()
            if not line:
                break
            buffer += line.decode("utf-8", errors="replace")
            while "\n" in buffer:
                raw, buffer = buffer.split("\n", 1)
                if not raw.strip():
                    continue
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                self._events.append(event)

    async def _send(self, payload: Dict[str, Any]) -> None:
        if self._proc is None or self._proc.stdin is None:
            raise CliBridgeError("mirror CLI bridge is not running")
        self._proc.stdin.write((json.dumps(payload) + "\n").encode("utf-8"))
        await self._proc.stdin.drain()

    async def run(self, prompt: str, timeout: float = 90.0) -> str:
        """Send a `start` command and wait for the agent's assembled response."""
        if self._unusable:
            raise CliBridgeError("mirror CLI bridge is unavailable (previous failure)")

        await self.start()
        request_id = uuid.uuid4().hex
        marker = len(self._events)
        await self._send(
            {"command": "start", "requestId": request_id, "prompt": prompt}
        )

        deltas: List[str] = []
        result_content: Optional[str] = None
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout

        while loop.time() < deadline:
            # Fail fast if the child died without producing a response.
            if self._proc is not None and self._proc.returncode is not None:
                self._unusable = True
                raise CliBridgeError(
                    f"mirror CLI exited early (code {self._proc.returncode}) "
                    "- is an API key configured?"
                )

            new_events = self._events[marker:]
            marker = len(self._events)
            for event in new_events:
                etype = event.get("type")
                if etype == "assistant":
                    content = event.get("content")
                    if content:
                        if event.get("done"):
                            # Full message text on the final assistant event.
                            return content
                        deltas.append(content)
                elif etype == "result":
                    result_content = event.get("content")
                elif etype == "control":
                    # ack / done / error bookkeeping; fall through on error
                    if event.get("subtype") == "error":
                        raise CliBridgeError(
                            event.get("content") or "mirror agent reported an error"
                        )
            if result_content:
                return result_content
            await asyncio.sleep(0.05)

        self._unusable = True
        if deltas:
            return "".join(deltas)
        raise CliBridgeError(
            "timed out waiting for the mirror agent loop "
            "(is an API key configured for `mirror`?)"
        )


# Module-level singleton.
bridge = MirrorCliBridge()
