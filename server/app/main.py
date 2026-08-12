"""Mirror XR Backend — FastAPI application.

Exposes a WebSocket endpoint at /ws/chat that receives JSON messages from
Unity, routes them through the mirror-vs coordinator/agent loop, and sends
JSON responses back.

Run (from this directory):
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""

import json
import logging
from typing import Any, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from . import coordinator
from .schemas import InboundMessage, OutboundError, OutboundMessage

logger = logging.getLogger("mirror_xr")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Mirror XR Backend",
    description="WebSocket bridge between Unity (Meta Quest 3S) and the mirror-vs agent loop.",
    version="0.1.0",
)


@app.get("/")
async def root() -> Dict[str, Any]:
    return {
        "service": "Mirror XR Backend",
        "status": "running",
        "websocket": "ws://<host>:8000/ws/chat",
    }


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket) -> None:
    """Accept JSON lines/messages, route through the coordinator, reply as JSON."""
    await websocket.accept()
    logger.info("Unity client connected to /ws/chat")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
                inbound = InboundMessage(**payload)
            except Exception as exc:  # noqa: BLE001 - surface malformed input to client
                logger.warning("Malformed inbound message: %s", exc)
                await websocket.send_json(
                    OutboundError(
                        response="I couldn't parse that message.",
                        error="invalid_message",
                    ).model_dump()
                )
                continue

            logger.info("[%s] %s", inbound.user_id, inbound.message)
            response_text = await coordinator.generate_response(
                inbound.user_id, inbound.message
            )
            reply = OutboundMessage(response=response_text).model_dump()
            logger.info("[%s -> Mirror] %s", inbound.user_id, response_text)
            await websocket.send_json(reply)
    except WebSocketDisconnect:
        logger.info("Unity client disconnected from /ws/chat")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    try:
        await coordinator.bridge.stop()
    except Exception:  # noqa: BLE001 - never block shutdown
        pass
