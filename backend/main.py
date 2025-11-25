import os
from fastapi import FastAPI, WebSocket, UploadFile
from fastapi.responses import FileResponse
from openai import OpenAI
from .assistant_realtime import handle_realtime

app = FastAPI()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)


# ---- Realtime Streaming WebSocket ----
@app.websocket("/ws/realtime")
async def ws_realtime(ws: WebSocket):
    await handle_realtime(ws, OPENAI_API_KEY)


# ---- Upload transcription (audio/video) ----
@app.post("/transcribe")
async def transcribe(file: UploadFile):
    audio_bytes = await file.read()

    transcript = client.audio.transcriptions.create(
        model="gpt-4o-realtime-2024-12-17",
        file=(file.filename, audio_bytes),
        diarization=True,
        response_format="verbose_json"
    )

    summary = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Summarize this text."},
            {"role": "user", "content": transcript.text}
        ]
    )

    return {
        "transcript": transcript,
        "summary": summary.choices[0].message["content"]
    }


# ---- Serve frontend ----
@app.get("/{path:path}")
async def serve_frontend(path: str):
    root = os.path.join(os.path.dirname(__file__), "static")

    file_path = os.path.join(root, path)

    if path == "" or not os.path.exists(file_path):
        return FileResponse(os.path.join(root, "index.html"))
    return FileResponse(file_path)
