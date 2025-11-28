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
            
            # Configure session for transcription ONLY
            print("⚙️  Configuring session for transcription-only mode...")
            
            await connection.session.update(
                session={
                    "modalities": ["text"],  # Text only, no audio output
                    "instructions": "You are a transcription service. Only transcribe what the user says. Do not respond or engage in conversation.",
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
                        "silence_duration_ms": 500,
                        "create_response": False  # KEY: Don't auto-respond
                    }
                }
            )
            
            print("✅ Session configured for transcription-only")

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
                            print(f"📤 Sent {chunk_count} audio chunks to OpenAI")
                        
                except WebSocketDisconnect:
                    print("🔌 Browser disconnected")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"❌ Browser to OpenAI error: {e}")

            async def openai_to_browser():
                """Receive events from OpenAI and forward transcriptions to browser"""
                try:
                    async for event in connection:
                        event_type = event.type
                        
                        # Filter: Only send transcription events to frontend
                        if event_type in [
                            "conversation.item.input_audio_transcription.delta",
                            "conversation.item.input_audio_transcription.completed",
                            "input_audio_buffer.speech_started",
                            "input_audio_buffer.speech_stopped",
                            "session.created",
                            "session.updated",
                            "error"
                        ]:
                            # Log transcription events
                            if "transcription" in event_type:
                                if event_type.endswith(".delta"):
                                    print(f"📝 Transcript delta: {event.delta if hasattr(event, 'delta') else 'N/A'}")
                                elif event_type.endswith(".completed"):
                                    print(f"✅ Transcript completed: {event.transcript if hasattr(event, 'transcript') else 'N/A'}")
                            
                            # Send to browser
                            try:
                                event_dict = event.model_dump()
                                event_json = json.dumps(event_dict)
                                await ws.send_text(event_json)
                            except Exception as e:
                                print(f"⚠️  Serialize error for {event_type}: {e}")
                        
                        else:
                            # Log but don't send (assistant responses, etc.)
                            if event_type not in ["response.done", "response.created"]:
                                print(f"🚫 Filtered event: {event_type}")
                            
                except WebSocketDisconnect:
                    print("🔌 Browser disconnected (OpenAI stream)")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"❌ OpenAI to browser error: {e}")
                    import traceback
                    traceback.print_exc()

            # Run both tasks concurrently
            print("🔄 Starting bidirectional streaming...")
            tasks = [
                asyncio.create_task(browser_to_openai()),
                asyncio.create_task(openai_to_browser())
            ]
            
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED
            )
            
            print("✅ Streaming ended (one task completed)")
            
            # Cancel remaining tasks
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except WebSocketDisconnect:
        print("🔌 Client disconnected")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        print("🧹 Cleaning up WebSocket connection")
        try:
            await ws.close()
        except:
            pass