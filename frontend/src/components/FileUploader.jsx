import React, { useState } from "react";

export default function FileUploader() {
  const [result, setResult] = useState(null);

  const upload = async (e) => {
    const file = e.target.files[0];
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/transcribe", { method: "POST", body: fd });
    setResult(await res.json());
  };

  return (
    <div>
      <h3>Upload audio/video</h3>
      <input type="file" onChange={upload} />

      {result && (
        <div className="results">
          <h4>Full Transcription</h4>
          <pre>{result.text}</pre>

          <h4>Summary</h4>
          <pre>{result.summary}</pre>
        </div>
      )}
    </div>
  );
}