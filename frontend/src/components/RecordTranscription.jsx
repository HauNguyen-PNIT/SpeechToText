import React, { useState, useRef } from "react";
import TranscriptDisplay from "./TranscriptDisplay";
import Waveform from "./Waveform";

export default function RecordTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const recordingStartTimeRef = useRef(null);

  const startRecording = async () => {
    try {
      setError(null);
      setStatus("Requesting microphone access...");
      setRecordingDuration(0);
      
      // Clear previous chunks
      audioChunksRef.current = [];

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      streamRef.current = stream;
      console.log("✅ Microphone stream obtained");

      // Prefer WAV if supported, fallback to WebM
      let mimeType = "audio/webm";
      let extension = "webm";
      
      if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
        extension = "wav";
      } else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
        extension = "webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
        extension = "mp4";
      }

      console.log(`🎤 Using MIME type: ${mimeType}`);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        console.log(`📦 ondataavailable triggered, size: ${event.data.size}`);
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`✅ Chunk added, total chunks: ${audioChunksRef.current.length}, total size: ${audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0)}`);
        }
      };

      mediaRecorder.onstart = () => {
        console.log("✅ MediaRecorder started");
        recordingStartTimeRef.current = Date.now();
      };

      mediaRecorder.onstop = async () => {
        const actualDuration = recordingStartTimeRef.current 
          ? (Date.now() - recordingStartTimeRef.current) / 1000 
          : recordingDuration;
        
        console.log(`⏹️ MediaRecorder stopped`);
        console.log(`⏱️ Duration: ${actualDuration.toFixed(2)}s (timer: ${recordingDuration}s)`);
        console.log(`📦 Total chunks: ${audioChunksRef.current.length}`);
        
        setStatus("Processing recording...");
        setLoading(true);
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Wait a bit for any pending chunks
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log(`📦 After wait, total chunks: ${audioChunksRef.current.length}`);

        try {
          if (audioChunksRef.current.length === 0) {
            throw new Error("No audio data was recorded. Please try again.");
          }

          // Create audio blob
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType,
          });

          console.log(
            `📼 Created blob: ${audioBlob.size} bytes (${(audioBlob.size / 1024 / 1024).toFixed(2)} MB)`
          );

          // Validate recording
          if (audioBlob.size < 1000) {
            throw new Error("Recording failed - audio data is too small. Please speak louder or try again.");
          }

          if (actualDuration < 0.5) {
            throw new Error("Recording is too short. Please record for at least 2 seconds.");
          }

          // Create form data
          const formData = new FormData();
          formData.append("file", audioBlob, `recording-${Date.now()}.${extension}`);
          formData.append("merge_speakers", "true");

          // Upload to transcription endpoint
          console.log("📤 Uploading to /transcribe...");
          const response = await fetch("/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.error) {
            throw new Error(data.error);
          }

          console.log("✅ Transcription received:", data);

          if (data.speakers && data.speakers.length > 0) {
            const newTranscripts = data.speakers.map((speaker, idx) => ({
              id: Date.now() + idx,
              speaker: speaker.speaker || "Speaker",
              text: speaker.text || "",
              timestamp: speaker.start_time || null,
              end: speaker.end_time || null,
            }));

            setTranscripts((prev) => [...prev, ...newTranscripts]);
            setStatus(`✅ Added ${newTranscripts.length} transcript segments`);
          } else if (data.text) {
            setTranscripts((prev) => [
              ...prev,
              {
                id: Date.now(),
                speaker: "Speaker",
                text: data.text,
                timestamp: null,
              },
            ]);
            setStatus("✅ Transcription complete");
          } else {
            setStatus("⚠️ No speech detected");
          }

          setTimeout(() => setStatus("Ready"), 3000);
        } catch (err) {
          console.error("❌ Transcription error:", err);
          setError(err.message || "Failed to transcribe");
          setStatus("Error");
        } finally {
          setLoading(false);
          // Clear chunks for next recording
          audioChunksRef.current = [];
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("❌ MediaRecorder error:", event.error);
        setError(`Recording error: ${event.error}`);
      };

      // Start recording with timeslice
      console.log("▶️ Starting MediaRecorder...");
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setStatus("🔴 Recording... Click Stop when done");

      // Start duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      console.log("✅ Recording initialized successfully");
    } catch (err) {
      console.error("❌ Failed to start recording:", err);
      setError(err.message || "Failed to access microphone");
      setStatus("Error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      const actualDuration = recordingStartTimeRef.current 
        ? (Date.now() - recordingStartTimeRef.current) / 1000 
        : recordingDuration;
      
      console.log(`🛑 Stopping recording... Duration: ${actualDuration.toFixed(2)}s`);
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const clearTranscripts = () => {
    setTranscripts([]);
    setStatus("Ready");
    setError(null);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="feature-section">
      <div className="section-header">
        <h2>🎤 Record & Transcribe</h2>
        <p>Record audio from your microphone, then get transcription with speaker diarization</p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="controls">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={isRecording ? "btn-stop" : "btn-primary"}
          disabled={loading}
        >
          {isRecording ? "⏹️ Stop & Transcribe" : "🎤 Start Recording"}
        </button>

        {transcripts.length > 0 && !isRecording && (
          <button onClick={clearTranscripts} className="btn-secondary">
            🗑️ Clear
          </button>
        )}

        <div className={`status-badge ${isRecording ? "active" : ""}`}>
          {isRecording && <span className="pulse-dot"></span>}
          {status}
        </div>

        {isRecording && (
          <div className="status-badge">
            ⏱️ {formatDuration(recordingDuration)}
          </div>
        )}
      </div>

      {isRecording && recordingDuration < 2 && (
        <div className="info-banner">
          <span>💡 Keep recording for at least 2-3 seconds for best results</span>
        </div>
      )}

      {/* Force re-render waveform with key */}
      <Waveform 
        key={isRecording ? 'recording' : 'stopped'}
        isActive={isRecording} 
        stream={streamRef.current} 
      />

      {/* Debug panel */}
      {process.env.NODE_ENV !== 'production' && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#1a1a1a',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          color: '#00ff00'
        }}>
          <div>🔍 Debug Info:</div>
          <div>• isRecording: {String(isRecording)}</div>
          <div>• streamRef.current: {String(!!streamRef.current)}</div>
          <div>• stream active: {streamRef.current?.active ? 'true' : 'false'}</div>
          <div>• stream tracks: {streamRef.current?.getTracks().length || 0}</div>
          <div>• recordingDuration: {recordingDuration}s</div>
          <div>• chunks collected: {audioChunksRef.current.length}</div>
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Transcribing with speaker diarization...</p>
          <p className="hint">Recorded {formatDuration(recordingDuration)} of audio</p>
        </div>
      )}

      <TranscriptDisplay
        transcripts={transcripts}
        title="Recorded Transcript"
        emptyMessage="Click 'Start Recording', speak for at least 2 seconds, then click 'Stop & Transcribe'..."
      />

      {!isRecording && transcripts.length === 0 && (
        <div className="tips-box">
          <h4>💡 Tips for Best Results</h4>
          <ul>
            <li>Speak clearly and at normal volume</li>
            <li>Record at least 2-3 seconds of speech</li>
            <li>Minimize background noise</li>
            <li>Wait to see the timer counting before stopping</li>
            <li>WebM recordings are automatically converted to WAV</li>
          </ul>
        </div>
      )}
    </div>
  );
}