import React, { useState } from "react";
import WebRTCButton from "./components/WebRTCButton";
import Waveform from "./components/Waveform";
import TranscriptChat from "./components/TranscriptChat";
import FileUploader from "./components/FileUploader";

export default function App() {
  const [chunks, setChunks] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  return (
    <div className="app-container">
      <h1>Speech-to-Text (OpenAI Realtime)</h1>

      <WebRTCButton
        onTranscription={(event) =>
          setChunks((prev) => [...prev, event])
        }
        onStreamingState={setIsStreaming}
      />

      <Waveform isStreaming={isStreaming} />

      <TranscriptChat chunks={chunks} />

      <FileUploader />
    </div>
  );
}