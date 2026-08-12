"""Pydantic schemas for the Mirror XR chat protocol.

These mirror the exact JSON contract shared with the Unity client:

Inbound (Unity -> Mirror):
    {"user_id": "dipesh", "message": "Good morning Mirror", "timestamp": "2026-08-08T08:14:00Z"}

Outbound (Mirror -> Unity):
    {"sender": "Mirror", "response": "...", "action": "display_text", "timestamp": "2026-08-08T08:14:02Z"}
"""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


def utc_now_iso() -> str:
    """ISO-8601 timestamp with Z suffix (UTC), matching the Unity contract."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class InboundMessage(BaseModel):
    """A message sent from Unity to the backend over /ws/chat."""

    user_id: str = Field(..., description="Unique identifier for the user")
    message: str = Field(..., description="Text message from the user/Unity")
    timestamp: Optional[str] = Field(None, description="Optional ISO-8601 timestamp")


class OutboundMessage(BaseModel):
    """A JSON response sent back from Mirror to Unity."""

    sender: str = Field(default="Mirror", description="Always 'Mirror'")
    response: str = Field(..., description="The text response to display")
    action: str = Field(default="display_text", description="How Unity should render the response")
    timestamp: str = Field(default_factory=utc_now_iso, description="ISO-8601 timestamp")


class OutboundError(BaseModel):
    """A structured error pushed to the Unity client."""

    sender: str = Field(default="Mirror")
    response: str = Field(..., description="Human-readable error message")
    action: str = Field(default="display_text")
    error: str = Field(..., description="Machine-readable error code")
    timestamp: str = Field(default_factory=utc_now_iso)
