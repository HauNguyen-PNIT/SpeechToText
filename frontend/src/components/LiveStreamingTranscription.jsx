import React, { useState, useRef, useEffect } from "react";
import TranscriptDisplay from "./TranscriptDisplay";
import Waveform from "./Waveform";

export default function LiveStreamingTranscription() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("Ready");

  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);

  const startStreaming = async () => {
    try {
      setError(null);
      setStatus("Connecting to server...");

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      streamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect to WebSocket
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/realtime`;
      
      console.log("🔌 Connecting to:", wsUrl);
      
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setStatus("🔴 Live - Speaking...");
        setIsStreaming(true);
      };

      ws.onerror = (err) => {
        console.error("❌ WebSocket error:", err);
        setError("Failed to connect to server");
        setStatus("Error");
        stopStreaming();
      };

      ws.onclose = () => {
        console.log("🔌 WebSocket closed");
        if (isStreaming) {
          setStatus("Disconnected");
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📨 Received:", data);

          // Handle different OpenAI Realtime API event types
          if (data.type === "conversation.item.input_audio_transcription.delta") {
            // Partial transcription (accumulate)
            setPartialTranscript((prev) => prev + (data.delta || ""));
            console.log("📝 Partial:", data.delta);
          } 
          else if (data.type === "conversation.item.input_audio_transcription.completed") {
            // Completed transcription
            const finalText = data.transcript || "";
            console.log("✅ Completed transcript:", finalText);
            
            if (finalText) {
              const newTranscript = {
                id: data.item_id || Date.now(),
                speaker: "You",
                text: finalText,
                timestamp: new Date().toLocaleTimeString(),
              };
              setTranscripts((prev) => [...prev, newTranscript]);
              setPartialTranscript(""); // Clear partial
            }
          }
          else if (data.type === "response.text.delta") {
            // AI response partial
            setPartialTranscript((prev) => prev + (data.delta || ""));
          }
          else if (data.type === "response.text.done") {
            // AI response completed
            const finalText = data.text || "";
            if (finalText) {
              const newTranscript = {
                id: data.response_id || Date.now(),
                speaker: "Assistant",
                text: finalText,
                timestamp: new Date().toLocaleTimeString(),
              };
              setTranscripts((prev) => [...prev, newTranscript]);
              setPartialTranscript(""); // Clear partial
            }
          }
          else if (data.type === "response.audio_transcript.delta") {
            // AI audio response transcript delta
            setPartialTranscript((prev) => prev + (data.delta || ""));
          }
          else if (data.type === "response.audio_transcript.done") {
            // AI audio response transcript completed
            const finalText = data.transcript || "";
            if (finalText) {
              const newTranscript = {
                id: data.item_id || Date.now(),
                speaker: "Assistant",
                text: finalText,
                timestamp: new Date().toLocaleTimeString(),
              };
              setTranscripts((prev) => [...prev, newTranscript]);
              setPartialTranscript("");
            }
          }
          else if (data.type === "error") {
            console.error("Server error:", data.message);
            setError(data.message);
          }
          else if (data.type === "session.created" || data.type === "session.updated") {
            console.log("✅ Session ready");
          }
        } catch (err) {
          console.error("❌ Failed to parse message:", err);
        }
      };

      // Process audio and send to server
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const float32 = e.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array (PCM16)
          const pcm16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          
          // Send as binary
          ws.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log("✅ Streaming started");
    } catch (err) {
      console.error("❌ Failed to start streaming:", err);
      setError(err.message || "Failed to access microphone");
      setStatus("Error");
    }
  };

  const stopStreaming = () => {
    console.log("⏹️ Stopping stream...");

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsStreaming(false);
    setPartialTranscript("");
    setStatus("Stopped");
  };

  const clearTranscripts = () => {
    setTranscripts([]);
    setPartialTranscript("");
    setStatus("Ready");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopStreaming();
      }
    };
  }, []);

  // Combine completed transcripts with partial
  const displayTranscripts = [...transcripts];
  if (partialTranscript && isStreaming) {
    displayTranscripts.push({
      id: "partial",
      speaker: "Speaking...",
      text: partialTranscript + " ⏳",
      timestamp: "now",
      isPartial: true,
    });
  }

  return (
    <div className="feature-section">
      <div className="section-header">
        <h2>🔴 Live Streaming Transcription</h2>
        <p>Real-time continuous transcription with WebSocket streaming</p>
      </div>

      {error && <div className="error-banner">⚠️ {error}</div>}

      <div className="controls">
        <button
          onClick={isStreaming ? stopStreaming : startStreaming}
          className={isStreaming ? "btn-stop" : "btn-primary"}
        >
          {isStreaming ? "⏹️ Stop Streaming" : "🔴 Start Live Stream"}
        </button>

        {transcripts.length > 0 && !isStreaming && (
          <button onClick={clearTranscripts} className="btn-secondary">
            🗑️ Clear
          </button>
        )}

        <div className={`status-badge ${isStreaming ? "active" : ""}`}>
          {isStreaming && <span className="pulse-dot"></span>}
          {status}
        </div>
      </div>

      <Waveform 
        key={isStreaming ? 'streaming' : 'stopped'}
        isActive={isStreaming} 
        stream={streamRef.current} 
      />

      <TranscriptDisplay
        transcripts={displayTranscripts}
        title="Live Stream Transcript"
        emptyMessage="Click 'Start Live Stream' to begin real-time transcription..."
      />

      {!isStreaming && transcripts.length === 0 && (
        <div className="tips-box">
          <h4>💡 Real-Time Streaming</h4>
          <ul>
            <li>Transcription happens continuously as you speak</li>
            <li>No need to stop - just start talking</li>
            <li>Partial results show in real-time (marked with ⏳)</li>
            <li>Best for conversations and long recordings</li>
            <li>The AI may respond to what you say</li>
          </ul>
        </div>
      )}
    </div>
  );
}