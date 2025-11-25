import React from "react";

export default function Tabs({ active, onChange }) {
  const tabs = [
    { id: "live", label: "🎙️ Live Streaming", icon: "🔴" },
    { id: "file", label: "📁 File Upload", icon: "📎" },
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