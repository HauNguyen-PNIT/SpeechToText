import React, { useEffect, useRef, useState } from "react";

export default function Waveform({ isActive, stream }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log(`🎨 Waveform effect triggered - isActive: ${isActive}, hasStream: ${!!stream}`);
    
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log("❌ Canvas ref is null");
      return;
    }

    const ctx = canvas.getContext("2d");

    // Get computed CSS colors
    const computedStyle = getComputedStyle(document.documentElement);
    const surfaceColor = computedStyle.getPropertyValue('--surface').trim() || '#1a1a2e';
    const accentColor = computedStyle.getPropertyValue('--accent').trim() || '#4ea8de';
    const borderColor = computedStyle.getPropertyValue('--border').trim() || '#333';
    
    console.log("🎨 Colors:", { surfaceColor, accentColor, borderColor });

    // Function to draw inactive/flat line
    const drawInactive = () => {
      ctx.fillStyle = surfaceColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      console.log("📊 Drew inactive waveform");
    };

    // Clean up function
    const cleanup = () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
        console.log("🧹 Animation frame cancelled");
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => {
          console.log("⚠️ Error closing audio context:", err);
        });
        audioContextRef.current = null;
        console.log("🧹 Audio context closed");
      }
      analyserRef.current = null;
    };

    // If not active or no stream, show inactive state
    if (!isActive || !stream) {
      console.log("⏸️ Waveform inactive - cleaning up and drawing flat line");
      cleanup();
      drawInactive();
      return;
    }

    console.log("🎨 Initializing waveform visualization...");
    setError(null);

    try {
      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        throw new Error("Web Audio API not supported");
      }
      
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      console.log("✅ AudioContext created, state:", audioCtx.state);

      // Create analyser
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      console.log("✅ Analyser created, fftSize:", analyser.fftSize);

      // Clone the stream
      const clonedStream = stream.clone();
      console.log("✅ Stream cloned for waveform");

      // Connect cloned stream to analyser
      try {
        const source = audioCtx.createMediaStreamSource(clonedStream);
        source.connect(analyser);
        console.log("✅ Cloned stream connected to analyser");
      } catch (err) {
        throw new Error(`Failed to connect stream: ${err.message}`);
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      console.log("✅ Buffer created, length:", bufferLength);

      let frameCount = 0;
      console.log("✅ Starting animation loop...");

      // Animation loop
      const draw = () => {
        if (!isActive) {
          console.log("⏹️ Animation stopped (not active)");
          return;
        }

        animationRef.current = requestAnimationFrame(draw);

        // Get waveform data
        analyser.getByteTimeDomainData(dataArray);

        // Log every 60 frames (once per second at 60fps)
        if (frameCount % 60 === 0) {
          const sampleValues = Array.from(dataArray.slice(0, 10));
          const avgValue = sampleValues.reduce((a, b) => a + b, 0) / sampleValues.length;
          const minValue = Math.min(...dataArray);
          const maxValue = Math.max(...dataArray);
          console.log(`📊 Frame ${frameCount}, avg: ${avgValue.toFixed(1)}, range: ${minValue}-${maxValue}, samples:`, sampleValues);
        }
        frameCount++;

        // Background - use actual color
        ctx.fillStyle = surfaceColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Waveform line - use actual accent color
        ctx.lineWidth = 3;
        ctx.strokeStyle = accentColor;
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      };

      draw();
      console.log("✅ Waveform animation started successfully");

    } catch (err) {
      console.error("❌ Waveform initialization error:", err);
      setError(err.message);
      drawInactive();
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      console.log("🧹 Waveform cleanup - unmounting or dependencies changed");
      cleanup();
    };
  }, [isActive, stream]);

  return (
    <div className="waveform-container">
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={120} 
        className="waveform"
        style={{ border: '2px solid red' }} // Temporary debug
      />
      {!isActive && !error && (
        <div className="waveform-placeholder">
          🎤 Microphone inactive
        </div>
      )}
      {error && (
        <div className="waveform-error">
          ⚠️ Visualization error: {error}
        </div>
      )}
    </div>
  );
}