import os
import base64
import tempfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, WebSocket, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydub import AudioSegment

# Fix imports to work when run as module
try:
    # When run as `uvicorn backend.server:app`
    from backend.openai_client import get_client
    from backend.realtime import handle_realtime_websocket
except ImportError:
    # When run as `python server.py` or `uvicorn server:app`
    from openai_client import get_client
    from realtime import handle_realtime_websocket

app = FastAPI()

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supported formats
SUPPORTED_FORMATS = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".mpeg": "audio/mpeg",
    ".mpga": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".webm": "audio/webm"
}


def convert_to_wav(input_path: str) -> str:
    """
    Convert audio file to WAV format
    Returns path to WAV file
    """
    try:
        print(f"🔄 Converting {Path(input_path).suffix} to WAV...")
        
        # Load audio file
        audio = AudioSegment.from_file(input_path)
        
        # Create WAV output path
        wav_path = input_path.rsplit('.', 1)[0] + '_converted.wav'
        
        # Export as WAV with standard settings
        audio.export(
            wav_path,
            format="wav",
            parameters=["-ar", "16000", "-ac", "1"]  # 16kHz, mono
        )
        
        print(f"✅ Converted to: {wav_path}")
        return wav_path
    
    except Exception as e:
        print(f"⚠️  Conversion failed: {e}")
        return input_path


def merge_similar_speakers(speakers):
    """
    Merge speakers that are likely the same person
    Uses simple heuristics - in production, use voice embeddings
    """
    if not speakers or len(speakers) <= 1:
        return speakers
    
    # Get unique speakers
    unique_speakers = list(set([s["speaker"] for s in speakers]))
    
    # If only 2 speakers and they alternate frequently, likely one person
    if len(unique_speakers) == 2:
        # Count speaker changes
        changes = 0
        for i in range(1, len(speakers)):
            if speakers[i]["speaker"] != speakers[i-1]["speaker"]:
                changes += 1
        
        # If changes > 40% of segments, likely over-segmentation
        if changes > len(speakers) * 0.4:
            print(f"⚠️  Detected likely over-segmentation ({changes} changes in {len(speakers)} segments)")
            print(f"🔀 Merging speakers {unique_speakers[0]} and {unique_speakers[1]} into Speaker 1")
            
            # Merge all into Speaker 1
            for segment in speakers:
                segment["speaker"] = "Speaker 1"
    
    # If 3+ speakers with very short segments, also likely over-segmentation
    elif len(unique_speakers) >= 3:
        avg_duration = sum([s["end_time"] - s["start_time"] for s in speakers if s["end_time"] and s["start_time"]]) / len(speakers)
        if avg_duration < 3:  # Average segment < 3 seconds
            print(f"⚠️  Detected {len(unique_speakers)} speakers with very short segments (avg {avg_duration:.1f}s)")
            print(f"🔀 This might be a single speaker - consider using merge_speakers=false if this is a conversation")
    
    return speakers


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    merge_speakers: str = Form("true")
):
    """
    Basic transcription with automatic speaker diarization
    """
    temp_path = None
    converted_path = None
    
    try:
        client = get_client()
        
        # Convert string to boolean
        should_merge = merge_speakers.lower() == "true"

        # Validate file extension
        suffix = Path(file.filename).suffix.lower()
        if suffix not in SUPPORTED_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format: {suffix}. Supported: {', '.join(SUPPORTED_FORMATS.keys())}"
            )

        # Read file content
        content = await file.read()
        file_size_mb = len(content) / (1024 * 1024)
        
        print(f"📁 Uploading: {file.filename} ({file_size_mb:.2f} MB)")
        print(f"📋 Content-Type: {file.content_type}")
        print(f"📋 File extension: {suffix}")
        print(f"🔀 Merge speakers: {should_merge}")

        # Validate file size
        if file_size_mb < 0.001:  # Less than 1KB
            raise HTTPException(
                status_code=400,
                detail="File is too small or empty. Please record at least 1 second of audio."
            )

        if file_size_mb > 25:
            raise HTTPException(
                status_code=400,
                detail=f"File too large: {file_size_mb:.2f} MB (max 25 MB)"
            )

        # Save to temporary file with correct extension
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            temp_path = tmp.name

        print(f"💾 Saved to: {temp_path}")

        # Convert MP3 or WebM to WAV (OpenAI has issues with these formats)
        if suffix in [".mp3", ".webm"]:
            converted_path = convert_to_wav(temp_path)
            if converted_path != temp_path:
                # Use converted file
                final_path = converted_path
                mime_type = "audio/wav"
                final_filename = Path(file.filename).stem + ".wav"
            else:
                final_path = temp_path
                mime_type = SUPPORTED_FORMATS[suffix]
                final_filename = file.filename
        else:
            final_path = temp_path
            mime_type = SUPPORTED_FORMATS.get(suffix, file.content_type or "audio/mpeg")
            final_filename = file.filename
        
        # Verify converted file exists and has content
        if not os.path.exists(final_path):
            raise HTTPException(
                status_code=500,
                detail="Failed to process audio file"
            )
        
        converted_size = os.path.getsize(final_path)
        print(f"📊 Final file size: {converted_size / 1024:.2f} KB")
        
        if converted_size < 1000:  # Less than 1KB
            raise HTTPException(
                status_code=400,
                detail="Processed audio file is too small. Please record longer audio."
            )
        
        # Open and send to OpenAI with explicit MIME type
        with open(final_path, "rb") as audio_file:
            print(f"🚀 Sending to OpenAI (MIME: {mime_type})...")
            
            transcription = client.audio.transcriptions.create(
                model="gpt-4o-transcribe-diarize",
                file=(final_filename, audio_file, mime_type),
                response_format="diarized_json",
                chunking_strategy="auto"
            )

        print(f"✅ Transcription completed: {len(transcription.text)} chars")

        # Extract speakers from segments
        speakers = []
        for segment in transcription.segments:
            speakers.append({
                "speaker": segment.speaker,
                "text": segment.text,
                "start_time": segment.start,
                "end_time": segment.end
            })
        
        # Apply speaker merging if requested
        if should_merge:
            speakers = merge_similar_speakers(speakers)
        
        unique_speakers = list(set([s["speaker"] for s in speakers]))
        print(f"👥 Final speaker count: {len(unique_speakers)} ({', '.join(unique_speakers)})")

        # Generate summary
        summary_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": f"Provide a concise summary of this transcription:\n\n{transcription.text}"
            }]
        )

        return {
            "text": transcription.text,
            "speakers": speakers,
            "words": [],
            "summary": summary_response.choices[0].message.content,
            "duration": getattr(transcription, 'duration', None),
            "identified_speakers": unique_speakers
        }

    except HTTPException:
        raise
    
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Transcription error: {error_msg}")
        import traceback
        traceback.print_exc()
        
        # Return more helpful error
        if "corrupted or unsupported" in error_msg:
            return {
                "error": "The audio file format is not supported or corrupted. Try recording for at least 2-3 seconds.",
                "text": "",
                "speakers": [],
                "words": [],
                "summary": ""
            }
        
        return {
            "error": error_msg,
            "text": "",
            "speakers": [],
            "words": [],
            "summary": "Error processing file"
        }
    
    finally:
        # Cleanup temporary files
        for path in [temp_path, converted_path]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                    print(f"🗑️  Cleaned up: {path}")
                except Exception as e:
                    print(f"⚠️  Failed to delete temp file: {e}")


@app.post("/transcribe/advanced")
async def transcribe_advanced(
    file: UploadFile = File(...),
    speaker_names: str = Form(None),
    merge_speakers: str = Form("true"),
    identification_mode: str = Form("rename"),  # NEW: "rename" or "reference"
    reference_files: list[UploadFile] = File(None)
):
    """
    Advanced transcription with two speaker identification modes:
    1. "rename": Simply rename detected speakers (Speaker 1 -> Alice)
    2. "reference": Use voice samples to identify speakers by voice
    """
    temp_path = None
    converted_path = None
    ref_paths = []
    
    try:
        client = get_client()
        
        # Convert string to boolean
        should_merge = merge_speakers.lower() == "true"
        
        # Validate main file
        suffix = Path(file.filename).suffix.lower()
        if suffix not in SUPPORTED_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format: {suffix}"
            )
        
        # Save main file
        content = await file.read()
        file_size_mb = len(content) / (1024 * 1024)
        
        print(f"📁 Uploading: {file.filename} ({file_size_mb:.2f} MB)")
        print(f"🔀 Merge speakers: {should_merge}")
        print(f"🎯 Identification mode: {identification_mode}")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            temp_path = tmp.name
        
        # Convert MP3 to WAV if needed
        if suffix == ".mp3":
            converted_path = convert_to_wav(temp_path)
            if converted_path != temp_path:
                final_path = converted_path
                mime_type = "audio/wav"
                final_filename = Path(file.filename).stem + ".wav"
            else:
                final_path = temp_path
                mime_type = SUPPORTED_FORMATS[suffix]
                final_filename = file.filename
        else:
            final_path = temp_path
            mime_type = SUPPORTED_FORMATS.get(suffix, file.content_type or "audio/mpeg")
            final_filename = file.filename
        
        # Parse speaker names
        names = []
        if speaker_names:
            names = [name.strip() for name in speaker_names.split(",") if name.strip()]
            print(f"👤 Speaker names provided: {names}")
        
        extra_body = {}
        
        # MODE 2: Reference-based identification
        if identification_mode == "reference" and reference_files and any(ref.filename for ref in reference_files):
            valid_refs = [ref for ref in reference_files if ref.filename]
            
            if not names:
                raise HTTPException(
                    status_code=400,
                    detail="Speaker names are required when using reference files"
                )
            
            if len(valid_refs) != len(names):
                raise HTTPException(
                    status_code=400,
                    detail=f"Mismatch: {len(names)} names but {len(valid_refs)} reference files. Must match exactly."
                )
            
            references = []
            
            for idx, ref_file in enumerate(valid_refs):
                ref_suffix = Path(ref_file.filename).suffix.lower()
                
                # Save reference file
                with tempfile.NamedTemporaryFile(delete=False, suffix=ref_suffix) as ref_tmp:
                    ref_content = await ref_file.read()
                    ref_tmp.write(ref_content)
                    ref_path = ref_tmp.name
                    ref_paths.append(ref_path)
                
                # Convert to data URL
                ref_mime = SUPPORTED_FORMATS.get(ref_suffix, "audio/wav")
                with open(ref_path, "rb") as f:
                    data_url = f"data:{ref_mime};base64," + base64.b64encode(f.read()).decode("utf-8")
                    references.append(data_url)
                
                print(f"🎤 Reference {idx+1}: {ref_file.filename} → {names[idx]}")
            
            extra_body["known_speaker_references"] = references
            extra_body["known_speaker_names"] = names
            print(f"✅ Using voice-based identification for: {names}")
        
        # MODE 1 or no identification: Just transcribe
        # (Names will be applied post-processing if mode is "rename")
        
        # Transcribe with diarization
        with open(final_path, "rb") as audio_file:
            print(f"🚀 Sending to OpenAI...")
            
            transcription = client.audio.transcriptions.create(
                model="gpt-4o-transcribe-diarize",
                file=(final_filename, audio_file, mime_type),
                response_format="diarized_json",
                chunking_strategy="auto",
                extra_body=extra_body if extra_body else None
            )

        print(f"✅ Transcription completed: {len(transcription.text)} chars")

        # Extract speakers from segments
        speakers = []
        for segment in transcription.segments:
            speakers.append({
                "speaker": segment.speaker,
                "text": segment.text,
                "start_time": segment.start,
                "end_time": segment.end
            })
        
        # Apply speaker merging if requested
        if should_merge:
            speakers = merge_similar_speakers(speakers)
        
        # Get detected speakers
        detected_speakers = sorted(list(set([s["speaker"] for s in speakers])))
        print(f"👥 Detected speakers: {detected_speakers}")
        
        # MODE 1: Rename speakers post-processing
        if identification_mode == "rename" and names:
            print(f"📝 Applying rename mode...")
            
            # Create mapping: Speaker 1 -> Alice, Speaker 2 -> Bob, etc.
            speaker_mapping = {}
            for idx, detected in enumerate(detected_speakers):
                if idx < len(names):
                    speaker_mapping[detected] = names[idx]
                    print(f"   {detected} → {names[idx]}")
                else:
                    speaker_mapping[detected] = detected  # Keep original if not enough names
                    print(f"   {detected} → {detected} (no name provided)")
            
            # Apply mapping
            for segment in speakers:
                segment["speaker"] = speaker_mapping.get(segment["speaker"], segment["speaker"])
            
            identified_speakers = [speaker_mapping.get(s, s) for s in detected_speakers]
        else:
            identified_speakers = detected_speakers
        
        print(f"👥 Final speakers: {identified_speakers}")

        # Generate summary
        speaker_list = ", ".join(identified_speakers)
        summary_prompt = f"Summarize this conversation"
        if len(identified_speakers) > 1:
            summary_prompt += f" between {speaker_list}"
        summary_prompt += f":\n\n{transcription.text}"
        
        summary_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": summary_prompt
            }]
        )

        return {
            "text": transcription.text,
            "speakers": speakers,
            "words": [],
            "summary": summary_response.choices[0].message.content,
            "identified_speakers": identified_speakers,
            "identification_mode": identification_mode,
            "speaker_mapping": speaker_mapping if identification_mode == "rename" and names else None
        }

    except HTTPException:
        raise
    
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error: {error_msg}")
        import traceback
        traceback.print_exc()
        
        # Provide helpful error messages
        if "same number of items" in error_msg:
            return {
                "error": "The number of speaker names must match the number of reference files exactly.",
                "text": "",
                "speakers": [],
                "words": [],
                "summary": ""
            }
        
        if "Mismatch" in error_msg:
            return {"error": error_msg}
        
        return {
            "error": error_msg,
            "text": "",
            "speakers": [],
            "words": [],
            "summary": ""
        }
    
    finally:
        # Cleanup temporary files
        for path in [temp_path, converted_path] + ref_paths:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception as e:
                    print(f"⚠️  Failed to delete temp file: {e}")


@app.get("/health")
async def health():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "openai_configured": bool(os.getenv("OPENAI_API_KEY"))
    }


@app.websocket("/ws/realtime")
async def ws_realtime(ws: WebSocket):
    """
    WebRTC realtime transcription endpoint
    """
    print("🔌 WebSocket connection attempt...")
    await handle_realtime_websocket(ws)


# Startup: Mount static files carefully
@app.on_event("startup")
async def startup():
    """
    Configure static file serving
    """
    static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
    static_dir = os.path.abspath(static_dir)
    
    if not os.path.exists(static_dir):
        print(f"⚠️  Static directory not found: {static_dir}")
        return
    
    print(f"✅ Static directory found: {static_dir}")
    
    # Mount static files for everything except API routes
    # API routes are already registered above, so they take precedence
    try:
        app.mount(
            "/",
            StaticFiles(directory=static_dir, html=True),
            name="static"
        )
        print("✅ Static files mounted successfully")
    except Exception as e:
        print(f"⚠️  Failed to mount static files: {e}")


if __name__ == "__main__":
    import uvicorn
    # Use standard to get WebSocket support
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ws="websockets"  # Explicitly use websockets
    )