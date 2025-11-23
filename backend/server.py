import os
import uvicorn
from fastapi import FastAPI, UploadFile, File, WebSocket
from openai_client import get_client
from realtime import handle_realtime_websocket
from fastapi.staticfiles import StaticFiles

app = FastAPI()


# ----------------------------
# Upload audio/video → text + summary
# ----------------------------
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    client = get_client()

    transcription = client.audio.transcriptions.create(
        file=(file.filename, file.file, file.content_type),
        model="gpt-4o-mini-transcribe",
        diarization=True,
        timestamp_granularity="word"
    )

    summary = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": f"Summarize this transcription: {transcription.text}"
        }]
    )

    return {
        "text": transcription.text,
        "speakers": transcription.speakers,
        "words": transcription.words,
        "summary": summary.choices[0].message["content"]
    }


# ----------------------------
# WebRTC Realtime WS endpoint
# ----------------------------
@app.websocket("/ws/realtime")
async def ws_realtime(ws: WebSocket):
    await handle_realtime_websocket(ws)


# ----------------------------
# Serve frontend (built)
# ----------------------------
# Detect if running in Docker (static folder exists)
STATIC_PATH = "static"

if os.path.isdir(STATIC_PATH):
    # Running inside Docker container
    app.mount("/", StaticFiles(directory=STATIC_PATH, html=True), name="static")
else:
    # Running locally in development
    app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
