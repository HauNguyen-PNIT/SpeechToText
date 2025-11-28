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
  
  // Handle string timestamps (like "now" or "10:30:45")
  if (typeof seconds === "string") return seconds;
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function groupConsecutiveSpeakers(transcripts) {
  if (!transcripts || transcripts.length === 0) return [];
  
  const grouped = [];
  let current = {
    id: transcripts[0].id,
    speaker: transcripts[0].speaker,
    text: transcripts[0].text,
    start_time: transcripts[0].timestamp || transcripts[0].start_time,
    end_time: transcripts[0].end || transcripts[0].end_time,
    isPartial: transcripts[0].isPartial || false,
    segments: [transcripts[0]]
  };
  
  for (let i = 1; i < transcripts.length; i++) {
    const item = transcripts[i];
    
    // Don't merge if this is a partial transcript (real-time)
    if (item.isPartial) {
      if (current.segments.length > 0) {
        grouped.push(current);
      }
      grouped.push({
        id: item.id,
        speaker: item.speaker,
        text: item.text,
        start_time: item.timestamp || item.start_time,
        end_time: item.end || item.end_time,
        isPartial: true,
        segments: [item]
      });
      continue;
    }
    
    // If same speaker and not partial, merge
    if (item.speaker === current.speaker && !current.isPartial) {
      current.text += " " + item.text;
      current.end_time = item.end || item.end_time;
      current.segments.push(item);
    } else {
      // Different speaker, save current and start new
      grouped.push(current);
      current = {
        id: item.id,
        speaker: item.speaker,
        text: item.text,
        start_time: item.timestamp || item.start_time,
        end_time: item.end || item.end_time,
        isPartial: item.isPartial || false,
        segments: [item]
      };
    }
  }
  
  // Don't forget the last group
  if (current.segments.length > 0) {
    grouped.push(current);
  }
  
  return grouped;
}

export default function TranscriptDisplay({ 
  transcripts, 
  title = "Transcript", 
  emptyMessage = "No transcripts yet...",
  autoScroll = true 
}) {
  const containerRef = useRef(null);

  // Auto-scroll to bottom when new transcripts arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcripts, autoScroll]);

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
          <p>{emptyMessage}</p>
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
              key={item.id || idx}
              className={`transcript-bubble ${item.isPartial ? "partial" : ""}`}
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