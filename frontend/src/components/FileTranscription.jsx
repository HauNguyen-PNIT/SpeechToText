import React, { useState } from "react";
import TranscriptDisplay from "./TranscriptDisplay";

export default function FileTranscription() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [useAdvanced, setUseAdvanced] = useState(false);
  const [speakerNames, setSpeakerNames] = useState("");
  const [mergeSpeakers, setMergeSpeakers] = useState(true);
  const [identificationMode, setIdentificationMode] = useState("rename");
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [fileMapping, setFileMapping] = useState([]); // NEW: Track file-to-speaker mapping

  // Smart filename matching
  const matchFilesToSpeakers = (files, names) => {
    const matched = [];
    const unmatchedFiles = [];
    
    // Try to match each name to a file
    names.forEach(name => {
      const nameLower = name.toLowerCase().trim();
      
      // Find file that contains the speaker name
      const matchedFile = files.find(file => {
        const fileNameLower = file.name.toLowerCase();
        // Remove extension and check if it contains the name
        const fileBaseName = fileNameLower.replace(/\.(mp3|wav|m4a|webm|ogg)$/, '');
        return fileBaseName.includes(nameLower) || nameLower.includes(fileBaseName);
      });
      
      if (matchedFile) {
        matched.push({
          speaker: name,
          file: matchedFile,
          matched: true
        });
        // Remove from files array to avoid duplicate matching
        files = files.filter(f => f !== matchedFile);
      } else {
        matched.push({
          speaker: name,
          file: null,
          matched: false
        });
      }
    });
    
    // Add any unmatched files at the end
    files.forEach(file => {
      unmatchedFiles.push({
        speaker: null,
        file: file,
        matched: false
      });
    });
    
    return { matched, unmatchedFiles };
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("merge_speakers", mergeSpeakers.toString());

      let endpoint = "/transcribe";
      
      if (useAdvanced && speakerNames) {
        endpoint = "/transcribe/advanced";
        formData.append("speaker_names", speakerNames);
        formData.append("identification_mode", identificationMode);
        
        console.log("🎯 Using identification mode:", identificationMode);
        
        // Add reference files in the correct order (matched to speaker names)
        if (identificationMode === "reference" && fileMapping.length > 0) {
          const orderedFiles = fileMapping
            .filter(m => m.matched && m.file)
            .map(m => m.file);
          
          if (orderedFiles.length > 0) {
            orderedFiles.forEach((refFile) => {
              formData.append("reference_files", refFile);
            });
            console.log("📎 Attached reference files in order:", orderedFiles.map(f => f.name));
          }
        }
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
        speakerCount: new Set(transcripts.map(t => t.speaker)).size,
        identificationMode: data.identification_mode,
        speakerMapping: data.speaker_mapping,
      });

    } catch (err) {
      console.error("❌ Upload error:", err);
      setError(err.message || "Failed to process file");
    } finally {
      setLoading(false);
    }
  };

  const handleReferenceFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    const names = speakerNames.split(",").map(s => s.trim()).filter(Boolean);
    
    if (files.length > 0 && names.length > 0) {
      // Smart matching
      const { matched, unmatchedFiles } = matchFilesToSpeakers(files, names);
      setFileMapping(matched);
      
      console.log("🎯 File matching results:");
      matched.forEach(m => {
        if (m.matched) {
          console.log(`  ✅ ${m.file.name} → ${m.speaker}`);
        } else {
          console.log(`  ❌ No file found for ${m.speaker}`);
        }
      });
      
      if (unmatchedFiles.length > 0) {
        console.log(`  ⚠️  Unmatched files:`, unmatchedFiles.map(u => u.file.name));
      }
    } else {
      setReferenceFiles(files);
      setFileMapping([]);
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

  const speakerNamesArray = speakerNames
    ? speakerNames.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  const allMatched = fileMapping.length > 0 && fileMapping.every(m => m.matched);
  const someMatched = fileMapping.length > 0 && fileMapping.some(m => m.matched);
  const matchedCount = fileMapping.filter(m => m.matched).length;

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
            onChange={(e) => {
              setUseAdvanced(e.target.checked);
              if (!e.target.checked) {
                setSpeakerNames("");
                setReferenceFiles([]);
                setFileMapping([]);
                setIdentificationMode("rename");
              }
            }}
          />
          <span>Enable speaker identification</span>
        </label>

        {useAdvanced && (
          <div className="speaker-identification-section">
            <div className="form-group">
              <label htmlFor="speaker-names">
                <strong>Speaker Names (comma-separated):</strong>
              </label>
              <input
                id="speaker-names"
                type="text"
                placeholder="e.g., Alice, Bob, Charlie"
                value={speakerNames}
                onChange={(e) => {
                  setSpeakerNames(e.target.value);
                  // Re-match files if names change
                  if (referenceFiles.length > 0) {
                    const names = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                    const { matched } = matchFilesToSpeakers([...referenceFiles], names);
                    setFileMapping(matched);
                  }
                }}
                className="text-input"
              />
              <p className="hint">
                💡 Enter speaker names - files will be automatically matched by name
              </p>
            </div>

            {speakerNames && (
              <div className="identification-mode-section">
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.75rem" }}>
                  Choose Identification Method:
                </label>
                
                <div className="mode-options">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="identification_mode"
                      value="rename"
                      checked={identificationMode === "rename"}
                      onChange={(e) => setIdentificationMode(e.target.value)}
                    />
                    <div className="radio-content">
                      <strong>📝 Simple Rename</strong>
                      <p className="hint">
                        Rename detected speakers in order<br />
                        (Speaker 1 → {speakerNamesArray[0] || "Alice"}, 
                        Speaker 2 → {speakerNamesArray[1] || "Bob"}, etc.)
                      </p>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="identification_mode"
                      value="reference"
                      checked={identificationMode === "reference"}
                      onChange={(e) => setIdentificationMode(e.target.value)}
                    />
                    <div className="radio-content">
                      <strong>🎤 Voice-Based Identification</strong>
                      <p className="hint">
                        Upload voice samples - files will be matched by name<br />
                        (e.g., "bob.mp3" → Bob, "alice.wav" → Alice)
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {identificationMode === "reference" && speakerNames && (
              <div className="reference-files-section">
                <label htmlFor="reference-files">
                  <strong>Upload Voice Reference Samples:</strong>
                </label>
                <input
                  id="reference-files"
                  type="file"
                  accept="audio/*"
                  multiple
                  className="file-input"
                  onChange={handleReferenceFilesChange}
                />
                
                {fileMapping.length > 0 && (
                  <div className="selected-files-list">
                    <strong>
                      File Mapping ({matchedCount}/{speakerNamesArray.length} matched):
                    </strong>
                    <ul>
                      {fileMapping.map((mapping, idx) => (
                        <li key={idx} style={{
                          opacity: mapping.matched ? 1 : 0.5
                        }}>
                          <span className="file-name">
                            {mapping.matched ? "✅" : "❌"} {mapping.speaker}
                          </span>
                          <span className="file-mapping">
                            {mapping.file ? mapping.file.name : "No file matched"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {someMatched && !allMatched && (
                  <div className="warning-box">
                    ⚠️ <strong>Partial match!</strong><br />
                    Some speakers don't have matching files. Make sure your filenames contain the speaker names
                    (e.g., "bob.mp3" for Bob, "alice_voice.wav" for Alice).
                  </div>
                )}
                
                {allMatched && fileMapping.length > 0 && (
                  <div className="info-box">
                    ✅ <strong>All speakers matched!</strong> Files will be uploaded in the correct order.
                  </div>
                )}
                
                <div className="info-box">
                  <strong>💡 Smart filename matching:</strong>
                  <ul>
                    <li>Upload files with names like <code>bob.mp3</code>, <code>alice.wav</code>, etc.</li>
                    <li>Files are automatically matched to speaker names (case-insensitive)</li>
                    <li>Each sample should be 5-30 seconds of clear speech</li>
                    <li>Partial matches work too: <code>bob_voice.mp3</code> matches "Bob"</li>
                  </ul>
                </div>
              </div>
            )}
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
          {identificationMode === "reference" && (
            <p className="hint">Using voice-based identification - this may take longer...</p>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="results-container">
          {result.identificationMode && (
            <div className="info-banner">
              <div>
                <strong>
                  {result.identificationMode === "rename" 
                    ? "📝 Simple Rename Mode" 
                    : "🎤 Voice-Based Identification"}
                </strong>
                {result.speakerMapping && (
                  <p className="hint">
                    Mapping: {Object.entries(result.speakerMapping)
                      .map(([k, v]) => `${k} → ${v}`)
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          )}

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