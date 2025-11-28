import React, { useState } from "react";
import Tabs from "./components/Tabs";
import LiveStreamingTranscription from "./components/LiveStreamingTranscription";
import RecordTranscription from "./components/RecordTranscription";
import FileTranscription from "./components/FileTranscription";
import "./styles.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("stream");

  return (
    <div className="app-container">
      <header>
        <h1>🎙️ Speech-to-Text Platform</h1>
        <p className="subtitle">
          Real-time transcription • Speaker diarization • AI summaries
        </p>
      </header>

      <Tabs active={activeTab} onChange={setActiveTab} />

      <div className="tab-content">
        {activeTab === "stream" && <LiveStreamingTranscription />}
        {activeTab === "record" && <RecordTranscription />}
        {activeTab === "file" && <FileTranscription />}
      </div>

      <footer>
        <p>Powered by OpenAI GPT-4o Realtime API</p>
      </footer>
    </div>
  );
}