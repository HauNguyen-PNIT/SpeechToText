import React from "react";

export default function Tabs({ active, onChange }) {
  const tabs = [
    { id: "stream", label: "Live Streaming", icon: "🔴" },
    { id: "record", label: "Record & Transcribe", icon: "🎤" },
    { id: "file", label: "File Upload", icon: "📁" },
  ];

  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${active === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}