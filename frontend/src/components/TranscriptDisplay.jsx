import React, { useEffect, useRef } from "react";

const SPEAKER_COLORS = [
  "#4ea8de", // Blue
  "#9d4edd", // Purple
  "#faa307", // Orange
  "#38b000", // Green
  "#e63946", // Red
  "#06ffa5", // Cyan
];

function formatTimestamp(seconds) {
  if (!seconds && seconds !== 0) return null;
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function groupConsecutiveSpeakers(transcripts) {
  if (!transcripts || transcripts.length === 0) return [];
  
  const grouped = [];
  let current = {
    speaker: transcripts[0].speaker,
    text: transcripts[0].text,
    start_time: transcripts[0].timestamp || transcripts[0].start_time,
    end_time: transcripts[0].end || transcripts[0].end_time,
    segments: [transcripts[0]]
  };
  
  for (let i = 1; i < transcripts.length; i++) {
    const item = transcripts[i];
    
    // If same speaker, merge
    if (item.speaker === current.speaker) {
      current.text += " " + item.text;
      current.end_time = item.end || item.end_time;
      current.segments.push(item);
    } else {
      // Different speaker, save current and start new
      grouped.push(current);
      current = {
        speaker: item.speaker,
        text: item.text,
        start_time: item.timestamp || item.start_time,
        end_time: item.end || item.end_time,
        segments: [item]
      };
    }
  }
  
  // Don't forget the last group
  grouped.push(current);
  
  return grouped;
}

export default function TranscriptDisplay({ transcripts, title, emptyMessage }) {
  const containerRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcripts]);

  const getSpeakerColor = (speaker) => {
    const hash = speaker.split("").reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
  };

  if (!transcripts || transcripts.length === 0) {
    return (
      <div className="transcript-container">
        {title && <h3>{title}</h3>}
        <div className="transcript-box empty">
          <p>{emptyMessage || "No transcripts yet..."}</p>
        </div>
      </div>
    );
  }

  // Group consecutive segments from same speaker
  const groupedTranscripts = groupConsecutiveSpeakers(transcripts);

  return (
    <div className="transcript-container">
      {title && <h3>{title}</h3>}
      <div className="transcript-box" ref={containerRef}>
        {groupedTranscripts.map((item, idx) => {
          const color = getSpeakerColor(item.speaker);
          const timeRange = formatTimestamp(item.start_time);
          
          return (
            <div
              key={idx}
              className="transcript-bubble"
              style={{ borderLeftColor: color }}
            >
              <div className="bubble-header">
                <span className="speaker-name" style={{ color }}>
                  {item.speaker}
                </span>
                {timeRange && (
                  <span className="timestamp">{timeRange}</span>
                )}
              </div>
              <div className="bubble-text">{item.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}