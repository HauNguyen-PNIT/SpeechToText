import React, { useState } from "react";
import TranscriptDisplay from "./TranscriptDisplay";

export default function FileTranscription() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [useAdvanced, setUseAdvanced] = useState(false);
  const [speakerNames, setSpeakerNames] = useState("");
  const [mergeSpeakers, setMergeSpeakers] = useState(true); // NEW

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("merge_speakers", mergeSpeakers.toString()); // NEW

      let endpoint = "/transcribe";
      if (useAdvanced && speakerNames) {
        endpoint = "/transcribe/advanced";
        formData.append("speaker_names", speakerNames);
      }

      const response = await fetch(endpoint, {
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

      const transcripts = data.speakers?.map((speaker, idx) => ({
        id: idx,
        speaker: speaker.speaker || `Speaker ${idx + 1}`,
        text: speaker.text || "",
        timestamp: speaker.start_time || null,
        end: speaker.end_time || null,
      })) || [];

      setResult({
        transcripts,
        summary: data.summary,
        fullText: data.text,
        duration: data.duration,
        identifiedSpeakers: data.identified_speakers,
        speakerCount: new Set(transcripts.map(t => t.speaker)).size, // NEW
      });

    } catch (err) {
      console.error("❌ Upload error:", err);
      setError(err.message || "Failed to process file");
    } finally {
      setLoading(false);
    }
  };

  const mergeAllSpeakers = () => {
    if (!result) return;
    
    const merged = result.transcripts.map(t => ({
      ...t,
      speaker: "Speaker 1"
    }));
    
    setResult({
      ...result,
      transcripts: merged,
      speakerCount: 1
    });
  };

  return (
    <div className="feature-section">
      <div className="section-header">
        <h2>📁 File Upload Transcription</h2>
        <p>Upload audio or video files for transcription with speaker diarization</p>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Advanced Options */}
      <div className="advanced-options">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={mergeSpeakers}
            onChange={(e) => setMergeSpeakers(e.target.checked)}
          />
          <span>Auto-merge similar speakers (recommended for single-speaker audio)</span>
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={useAdvanced}
            onChange={(e) => setUseAdvanced(e.target.checked)}
          />
          <span>Enable speaker identification</span>
        </label>

        {useAdvanced && (
          <div className="speaker-names-input">
            <label>
              Known Speaker Names (comma-separated):
              <input
                type="text"
                placeholder="e.g., Alice, Bob"
                value={speakerNames}
                onChange={(e) => setSpeakerNames(e.target.value)}
                className="text-input"
              />
            </label>
            
            <div className="warning-box">
              ⚠️ <strong>Important:</strong> To use speaker names, you must also upload
              a voice reference file for each speaker (short audio clip of them speaking).
            </div>
            
            <label>
              Speaker Voice References (optional):
              <input
                type="file"
                accept="audio/*"
                multiple
                className="file-input"
                onChange={(e) => {
                  // Handle reference files
                  console.log("Reference files:", e.target.files);
                }}
              />
            </label>
            
            <p className="hint">
              💡 Upload one short audio file per speaker in the same order as names above.
              Example: If you enter "Alice, Bob", upload Alice's voice first, then Bob's.
            </p>
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div className="upload-zone">
        <label htmlFor="file-upload" className="upload-label">
          <div className="upload-icon">📎</div>
          <div>
            <strong>Choose a file</strong> or drag and drop
          </div>
          <div className="upload-hint">
            Supports: MP3, WAV, MP4, M4A, WebM (max 25MB)
          </div>
        </label>
        <input
          id="file-upload"
          type="file"
          accept="audio/*,video/*"
          onChange={handleFileUpload}
          disabled={loading}
        />
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Processing your file with AI diarization...</p>
          <p className="hint">This may take 30-60 seconds for longer files</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="results-container">
          {/* Speaker Count Warning */}
          {result.speakerCount > 1 && (
            <div className="info-banner">
              <div>
                <strong>🎤 Detected {result.speakerCount} speakers</strong>
                {result.speakerCount === 2 && (
                  <p className="hint">
                    If this is a single-speaker recording, click below to merge:
                  </p>
                )}
              </div>
              {result.speakerCount === 2 && (
                <button onClick={mergeAllSpeakers} className="btn-secondary">
                  🔀 Merge into one speaker
                </button>
              )}
            </div>
          )}

          {result.identifiedSpeakers && (
            <div className="info-banner">
              <strong>Identified Speakers:</strong>{" "}
              {result.identifiedSpeakers.join(", ")}
            </div>
          )}

          <TranscriptDisplay
            transcripts={result.transcripts}
            title="Transcription with Speaker Diarization"
          />

          {result.summary && (
            <div className="summary-card">
              <h3>📝 AI Summary</h3>
              <p>{result.summary}</p>
            </div>
          )}

          <details className="full-transcript">
            <summary>📄 Full Text Transcript</summary>
            <pre>{result.fullText}</pre>
          </details>

          {result.duration && (
            <div className="metadata">
              <span>⏱️ Duration: {result.duration.toFixed(2)}s</span>
              <span>👥 Speakers: {result.speakerCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}