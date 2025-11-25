import React, { useState, useRef } from "react";
import TranscriptDisplay from "./TranscriptDisplay";
import Waveform from "./Waveform";

export default function LiveTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  const startRecording = async () => {
    try {
      setError(null);
      setStatus("Requesting microphone access...");

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      streamRef.current = stream;

      // Create MediaRecorder to capture audio
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setStatus("Processing recording...");
        setLoading(true);

        try {
          // Create audio blob
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType,
          });

          console.log(
            `📼 Recorded ${audioBlob.size} bytes (${(audioBlob.size / 1024 / 1024).toFixed(2)} MB)`
          );

          // Create form data
          const formData = new FormData();
          formData.append("file", audioBlob, `recording-${Date.now()}.webm`);
          formData.append("merge_speakers", "true");

          // Upload to transcription endpoint
          console.log("📤 Uploading to /transcribe...");
          const response = await fetch("/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.error) {
            throw new Error(data.error);
          }

          console.log("✅ Transcription received:", data);

          // Add transcripts
          if (data.speakers && data.speakers.length > 0) {
            const newTranscripts = data.speakers.map((speaker, idx) => ({
              id: Date.now() + idx,
              speaker: speaker.speaker || "Speaker",
              text: speaker.text || "",
              timestamp: speaker.start_time || null,
              end: speaker.end_time || null,
            }));

            setTranscripts((prev) => [...prev, ...newTranscripts]);
            setStatus(`Added ${newTranscripts.length} transcript segments`);
          } else {
            setStatus("No speech detected");
          }

          setTimeout(() => setStatus("Ready"), 3000);
        } catch (err) {
          console.error("❌ Transcription error:", err);
          setError(err.message || "Failed to transcribe");
          setStatus("Error");
        } finally {
          setLoading(false);
        }
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setStatus("🔴 Recording... Click Stop when done");

      console.log("✅ Recording started");
    } catch (err) {
      console.error("❌ Failed to start recording:", err);
      setError(err.message || "Failed to access microphone");
      setStatus("Error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log("⏹️ Stopping recording...");
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  };

  const clearTranscripts = () => {
    setTranscripts([]);
    setStatus("Ready");
  };

  return (
    <div className="feature-section">
      <div className="section-header">
        <h2>🎙️ Live Recording Transcription</h2>
        <p>Record audio from your microphone and get instant transcription with speaker diarization</p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="controls">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={isRecording ? "btn-stop" : "btn-primary"}
          disabled={loading}
        >
          {isRecording ? "⏹️ Stop & Transcribe" : "🎙️ Start Recording"}
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
      </div>

      <Waveform isActive={isRecording} />

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Transcribing with speaker diarization...</p>
        </div>
      )}

      <TranscriptDisplay
        transcripts={transcripts}
        title="Live Transcript"
        emptyMessage="Click 'Start Recording', speak, then click 'Stop & Transcribe'..."
      />

      {/* Recording Tips */}
      {!isRecording && transcripts.length === 0 && (
        <div className="tips-box">
          <h4>💡 Tips for Best Results</h4>
          <ul>
            <li>Speak clearly and at normal volume</li>
            <li>Record at least 3-5 seconds of speech</li>
            <li>Minimize background noise</li>
            <li>Click "Stop & Transcribe" when done speaking</li>
          </ul>
        </div>
      )}
    </div>
  );
}