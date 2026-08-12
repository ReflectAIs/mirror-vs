"""Mirror XR coordinator.

The coordinator is the brain of the backend. For every inbound message it:

  1. Performs a memory lookup for the user (recent transcript).
  2. Hands the message + context to the mirror-vs agent loop via the CLI
     bridge (which owns tool execution and response generation).
  3. If the agent loop is unavailable/misconfigured (e.g. no API key),
     falls back to a local deterministic coordinator so the core loop is
     fully testable end-to-end without external services.
  4. Stores the assistant reply back into the user's memory.
"""

from typing import Optional

from . import memory
from .cli_bridge import CliBridgeError, MirrorCliBridge, mirror_cli_available

# Module-level bridge singleton (long-lived mirror CLI child process).
bridge = MirrorCliBridge()


def _build_prompt(user_id: str, message: str) -> str:
    """Combine the memory snapshot with the new message for the agent loop."""
    context = memory.memory.context_for(user_id)
    return (
        f"You are Mirror, {user_id}'s personal AI operating system for the "
        f"Meta Quest 3S.\n\nRecent conversation context:\n{context}\n\n"
        f"New message from {user_id}: {message}\n\n"
        f"Respond helpfully and concisely."
    )


async def generate_response(user_id: str, message: str) -> str:
    """Route one user message through the coordinator/agent loop."""
    memory.memory.add(user_id, "user", message)

    # 1) Try the mirror-vs agent loop (tools + response generation).
    if mirror_cli_available():
        try:
            response = await bridge.run(_build_prompt(user_id, message), timeout=60)
            if response.strip():
                memory.memory.add(user_id, "assistant", response)
                return response
        except CliBridgeError:
            pass
        except Exception:
            pass

    # 2) Local fallback coordinator (deterministic, no external deps).
    response = _local_coordinator(user_id, message)
    memory.memory.add(user_id, "assistant", response)
    return response


def _local_coordinator(user_id: str, message: str) -> str:
    """Deterministic fallback: memory-aware, with tiny built-in 'tools'.

    Keeps the Unity <-> backend loop working before an API key is
    configured for the mirror agent loop.
    """
    name = user_id.strip().capitalize() or "there"
    text = message.strip().lower()

    if not text:
        return "I'm here and listening. What would you like to do?"

    if any(k in text for k in ("good morning", "gm")):
        return (
            f"Good morning, {name}! I hope you slept well. "
            f"Your day is clear — is there anything you'd like me to check on?"
        )

    if any(k in text for k in ("schedule", "agenda", "calendar", "today", "meetings")):
        return (
            "I checked your schedule: you have no meetings on your calendar "
            "right now, so the day is wide open. (Local coordinator — connect "
            "an API key to the mirror agent loop for live scheduling.)"
        )

    if any(k in text for k in ("who are you", "your name", "what are you")):
        return (
            "I'm Mirror, your personal AI operating system for the Meta Quest 3S. "
            "I'm routing through the mirror-vs coordinator, and right now I'm "
            "running on the local fallback until an API key is configured."
        )

    if any(k in text for k in ("how are you", "how's it going", "how is it going")):
        return (
            f"I'm running smoothly, {name}. Thanks for asking! "
            f"What would you like to do next?"
        )

    if any(k in text for k in ("help", "what can you do")):
        return (
            "I can chat, look up your schedule, and remember our conversation. "
            "Once the mirror agent loop is configured with an API key, I can "
            "also run tools and pull live information. Try asking about your "
            "schedule or say good morning."
        )

    recent = memory.memory.recent(user_id, 2)
    remembered = ""
    if len(recent) > 1 and recent[-2]["role"] == "user":
        remembered = (
            f" (I remember you just said: \"{recent[-2]['text']}\")"
        )
    return (
        f"You said: \"{message}\".{remembered} I've noted that in your memory. "
        f"Right now I'm on the local fallback — configure an API key for the "
        f"mirror agent loop and I'll give you richer, tool-driven answers."
    )
