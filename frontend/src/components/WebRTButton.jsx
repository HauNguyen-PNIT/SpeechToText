import React, { useRef, useState } from "react";

export default function WebRTCButton({ onTranscription, onStreamingState }) {
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);

  const start = async () => {
    onStreamingState(true);
    setActive(true);

    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(streamRef.current);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    wsRef.current = new WebSocket("ws://localhost:8000/ws/realtime");
    wsRef.current.binaryType = "arraybuffer";

    processor.onaudioprocess = (e) => {
      if (wsRef.current.readyState === 1) {
        const float32 = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++)
          pcm16[i] = float32[i] * 32767;
        wsRef.current.send(pcm16.buffer);
      }
    };

    wsRef.current.onmessage = (msg) => {
      try {
        const json = JSON.parse(new TextDecoder().decode(msg.data));
        if (json.type === "transcript.partial" || json.type === "transcript.completed") {
          onTranscription(json);
        }
      } catch {}
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  };

  const stop = () => {
    onStreamingState(false);
    setActive(false);
    wsRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  return (
    <button onClick={active ? stop : start}>
      {active ? "Stop Streaming" : "Start Streaming"}
    </button>
  );
}