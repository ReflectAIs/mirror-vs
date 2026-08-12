"""Mirror XR Backend.

FastAPI WebSocket server that receives JSON messages from Unity,
routes them through the mirror-vs coordinator/agent loop, and
streams JSON responses back.
"""
