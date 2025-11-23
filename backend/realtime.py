import asyncio
from fastapi import WebSocket
from openai import AsyncOpenAI

MODEL = "gpt-4o-realtime-2024-12-17"


async def handle_realtime_websocket(ws: WebSocket):
    await ws.accept()

    client = AsyncOpenAI()

    # Connect to OpenAI Realtime API
    rt = await client.realtime.connect(model=MODEL)

    async def from_browser():
        """Receive audio frames or control events from browser."""
        async for message in ws.iter_bytes():
            await rt.send(message)

    async def to_browser():
        """Send transcription events to browser."""
        async for event in rt:
            await ws.send_bytes(event)

    # Run bidirectional streaming
    await asyncio.gather(from_browser(), to_browser())