import React from "react";

const COLORS = ["#4ea8de", "#9d4edd", "#faa307", "#38b000"];

export default function TranscriptChat({ chunks }) {
  return (
    <div className="chat-box">
      {chunks.map((c, idx) => {
        if (!c.delta || !c.delta.transcript) return null;

        const speaker = c.delta.speaker || "Unknown";
        const color = COLORS[speaker.charCodeAt(0) % COLORS.length];

        return (
          <div key={idx} className="bubble" style={{ borderColor: color }}>
            <div className="speaker" style={{ color }}>
              {speaker}
            </div>
            <div className="text">{c.delta.transcript}</div>
          </div>
        );
      })}
    </div>
  );
}