import React, { useEffect, useRef } from "react";

export default function Waveform({ isStreaming }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isStreaming) return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const buffer = new Uint8Array(analyser.fftSize);

      const draw = () => {
        requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(buffer);

        ctx.fillStyle = "var(--bg)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2;
        ctx.strokeStyle = "var(--fg)";
        ctx.beginPath();

        const slice = canvas.width / buffer.length;
        let x = 0;

        buffer.forEach((v) => {
          const y = (v / 255) * canvas.height;
          ctx.lineTo(x, y);
          x += slice;
        });

        ctx.stroke();
      };
      draw();
    });
  }, [isStreaming]);

  return (
    <canvas ref={canvasRef} width={600} height={150} className="waveform" />
  );
}