import asyncio
import json
import base64
from fastapi import WebSocket
from openai import AsyncOpenAI
from starlette.websockets import WebSocketDisconnect

MODEL = "gpt-4o-realtime-preview-2024-12-17"


async def handle_realtime_websocket(ws: WebSocket):
    """
    Handle WebSocket connection for realtime transcription
    """
    await ws.accept()
    print("✅ WebSocket connection accepted")

    client = AsyncOpenAI()
    
    try:
        print(f"🔗 Connecting to OpenAI Realtime API with model: {MODEL}")
        
        # Use async context manager
        async with client.beta.realtime.connect(model=MODEL) as connection:
            print("✅ Connected to OpenAI Realtime API")
            
            # Configure session with transcription enabled
            print("⚙️  Configuring session for transcription...")
            
            await connection.session.update(
                session={
                    "modalities": ["text", "audio"],
                    "instructions": "You are a helpful transcription assistant. Transcribe all speech accurately.",
                    "voice": "alloy",
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "input_audio_transcription": {
                        "model": "whisper-1"
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500
                    }
                }
            )
            
            print("✅ Session configured with Whisper transcription enabled")

            async def browser_to_openai():
                """Receive audio from browser and send to OpenAI"""
                chunk_count = 0
                try:
                    while True:
                        # Receive PCM16 audio data from browser (as bytes)
                        audio_bytes = await ws.receive_bytes()
                        
                        # Convert bytes to base64 string (required by OpenAI API)
                        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                        
                        # Send to OpenAI
                        await connection.input_audio_buffer.append(audio=audio_base64)
                        
                        chunk_count += 1
                        if chunk_count % 100 == 0:
                            print(f"📤 Sent {chunk_count} audio chunks to OpenAI")
                        
                except WebSocketDisconnect:
                    print("🔌 Browser disconnected")
                except asyncio.CancelledError:
                    print("🛑 Browser → OpenAI task cancelled")
                except Exception as e:
                    print(f"❌ Error receiving from browser: {e}")
                    import traceback
                    traceback.print_exc()

            async def openai_to_browser():
                """Receive events from OpenAI and send to browser"""
                try:
                    async for event in connection:
                        event_type = event.type
                        
                        # Log important events
                        if event_type in [
                            "session.created",
                            "session.updated",
                            "input_audio_buffer.speech_started",
                            "input_audio_buffer.speech_stopped",
                            "input_audio_buffer.committed",
                            "conversation.item.created",
                            "response.audio_transcript.done",
                            "error"
                        ]:
                            print(f"📨 OpenAI event: {event_type}")
                        
                        # Log session updates
                        if event_type == "session.updated":
                            session = event.session
                            transcription_enabled = session.input_audio_transcription is not None
                            print(f"   ℹ️  Transcription enabled: {transcription_enabled}")
                        
                        # Special handling for conversation items
                        if event_type == "conversation.item.created":
                            item = event.item
                            if item and item.type == "message":
                                print(f"💬 Message from: {item.role}")
                                if item.content:
                                    for content in item.content:
                                        print(f"   📄 Content type: {content.type}")
                                        if hasattr(content, 'transcript') and content.transcript:
                                            print(f"   📝 Transcript: {content.transcript}")
                        
                        # Log transcript completion
                        if event_type == "response.audio_transcript.done":
                            if hasattr(event, 'transcript'):
                                print(f"✅ Full transcript: {event.transcript}")
                        
                        # Serialize and send to browser
                        try:
                            event_dict = event.model_dump()
                            event_json = json.dumps(event_dict)
                            await ws.send_text(event_json)
                        except Exception as serialize_error:
                            print(f"⚠️  Failed to serialize event {event_type}: {serialize_error}")
                            
                except WebSocketDisconnect:
                    print("🔌 Browser disconnected while receiving from OpenAI")
                except asyncio.CancelledError:
                    print("🛑 OpenAI → Browser task cancelled")
                except Exception as e:
                    print(f"❌ Error sending to browser: {e}")
                    import traceback
                    traceback.print_exc()

            # Run both tasks concurrently
            print("🔄 Starting bidirectional streaming...")
            tasks = [
                asyncio.create_task(browser_to_openai()),
                asyncio.create_task(openai_to_browser())
            ]
            
            # Wait for any task to complete
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED
            )
            
            print("✅ Streaming ended gracefully")
            
            # Cancel remaining tasks
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except WebSocketDisconnect:
        print("🔌 WebSocket disconnected by client")
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Realtime API error: {error_msg}")
        import traceback
        traceback.print_exc()
        
        # Send error to browser
        try:
            error_payload = json.dumps({
                "type": "error",
                "error": {"message": error_msg}
            })
            await ws.send_text(error_payload)
        except Exception as send_error:
            print(f"⚠️  Failed to send error to browser: {send_error}")
    
    finally:
        print("🔌 Closing WebSocket connection")
        try:
            await ws.close()
        except Exception as close_error:
            print(f"⚠️  Error closing WebSocket: {close_error}")