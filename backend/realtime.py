import asyncio
import json
import base64
from fastapi import WebSocket
from openai import AsyncOpenAI
from starlette.websockets import WebSocketDisconnect

MODEL = "gpt-4o-realtime-preview-2024-12-17"


async def handle_realtime_websocket(ws: WebSocket):
    """
    Handle WebSocket connection for realtime transcription only
    """
    await ws.accept()
    print("✅ WebSocket connection accepted")

    client = AsyncOpenAI()
    
    try:
        print(f"🔗 Connecting to OpenAI Realtime API with model: {MODEL}")
        
        async with client.beta.realtime.connect(model=MODEL) as connection:
            print("✅ Connected to OpenAI Realtime API")
            
            # Configure session for transcription
            print("⚙️  Configuring session...")
            
            await connection.session.update(
                session={
                    "modalities": ["text"],  # Text only, no audio output
                    "instructions": "You are a transcription service. Do not respond.",
                    "input_audio_format": "pcm16",
                    "input_audio_transcription": {
                        "model": "whisper-1"
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500
                        # Remove create_response - let it default to true
                    }
                }
            )
            
            print("✅ Session configured")

            async def browser_to_openai():
                """Receive audio from browser and send to OpenAI"""
                chunk_count = 0
                try:
                    while True:
                        audio_bytes = await ws.receive_bytes()
                        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                        await connection.input_audio_buffer.append(audio=audio_base64)
                        
                        chunk_count += 1
                        if chunk_count % 100 == 0:
                            print(f"📤 Sent {chunk_count} audio chunks")
                        
                except WebSocketDisconnect:
                    print("🔌 Browser disconnected")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"❌ Browser error: {e}")

            async def openai_to_browser():
                """Receive events from OpenAI and forward to browser"""
                try:
                    async for event in connection:
                        event_type = event.type
                        
                        # Log all events for debugging
                        print(f"📨 Event: {event_type}")
                        
                        # Special handling for user transcripts
                        if event_type == "conversation.item.created":
                            item = event.item
                            print(f"   Item type: {item.type}, role: {item.role if hasattr(item, 'role') else 'N/A'}")
                            
                            if item.type == "message" and item.role == "user":
                                if item.content:
                                    for idx, content in enumerate(item.content):
                                        print(f"   Content[{idx}] type: {content.type}")
                                        if hasattr(content, 'transcript'):
                                            print(f"   ✅ TRANSCRIPT: {content.transcript}")
                        
                        # Send to browser (we'll filter assistant messages there)
                        try:
                            event_dict = event.model_dump()
                            event_json = json.dumps(event_dict)
                            await ws.send_text(event_json)
                        except Exception as e:
                            print(f"⚠️  Serialize error: {e}")
                            
                except WebSocketDisconnect:
                    print("🔌 Disconnected")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"❌ OpenAI error: {e}")
                    import traceback
                    traceback.print_exc()

            # Run both tasks
            print("🔄 Starting streaming...")
            tasks = [
                asyncio.create_task(browser_to_openai()),
                asyncio.create_task(openai_to_browser())
            ]
            
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED
            )
            
            print("✅ Streaming ended")
            
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except WebSocketDisconnect:
        print("🔌 Disconnected")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        print("🔌 Closing")
        try:
            await ws.close()
        except:
            pass