import { useRef, useEffect } from 'preact/hooks';
import { TimePoint } from '@lib/types';

interface CanvasPlotterProps {
  data: TimePoint[];
  forecasts: { t: number; values: number[] }[];
  currentTime: number;
  width: number;
  height: number;
  timeWindow: number; // seconds to show
  playbackSpeed: number;
}

export function CanvasPlotter({ 
  data, 
  forecasts, 
  currentTime, 
  width, 
  height, 
  timeWindow,
  playbackSpeed 
}: CanvasPlotterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Set up coordinate system
    const padding = 40;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    // Time bounds
    const endTime = currentTime;
    const startTime = endTime - timeWindow;

    // Get data range for Y scaling
    const visibleData = data.filter(d => d.t >= startTime && d.t <= endTime);
    if (visibleData.length === 0) return;

    const yValues = visibleData.map(d => d.x);
    const yMin = Math.min(...yValues) - 0.5;
    const yMax = Math.max(...yValues) + 0.5;
    const yRange = yMax - yMin;

    // Coordinate transformations
    const timeToX = (t: number) => padding + ((t - startTime) / timeWindow) * plotWidth;
    const valueToY = (value: number) => padding + plotHeight - ((value - yMin) / yRange) * plotHeight;

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Vertical grid lines (time)
    const timeStep = timeWindow / 10;
    for (let i = 0; i <= 10; i++) {
      const t = startTime + i * timeStep;
      const x = timeToX(t);
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
    }

    // Horizontal grid lines (value)
    const valueStep = yRange / 6;
    for (let i = 0; i <= 6; i++) {
      const value = yMin + i * valueStep;
      const y = valueToY(value);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw main signal
    if (visibleData.length > 1) {
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      visibleData.forEach((point, index) => {
        const x = timeToX(point.t);
        const y = valueToY(point.x);
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    }

    // Draw forecasts
    forecasts.forEach(forecast => {
      if (forecast.t < startTime || forecast.t > endTime) return;
      
      const startX = timeToX(forecast.t);
      const startY = valueToY(
        visibleData.find(d => Math.abs(d.t - forecast.t) < 0.1)?.x ?? 0
      );

      ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(startX, startY);

      forecast.values.forEach((value, index) => {
        const futureT = forecast.t + (index + 1) * 0.02; // assuming 20ms steps
        const x = timeToX(futureT);
        const y = valueToY(value);
        ctx.lineTo(x, y);
      });

      ctx.stroke();
    });

    // Draw current time indicator
    const currentX = timeToX(currentTime);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(currentX, padding);
    ctx.lineTo(currentX, height - padding);
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#ccc';
    ctx.font = '12px monospace';
    
    // Y-axis labels
    for (let i = 0; i <= 6; i++) {
      const value = yMin + i * valueStep;
      const y = valueToY(value);
      ctx.fillText(value.toFixed(2), 5, y + 4);
    }

    // Time labels
    for (let i = 0; i <= 10; i += 2) {
      const t = startTime + i * timeStep;
      const x = timeToX(t);
      ctx.fillText(t.toFixed(1) + 's', x - 15, height - 10);
    }

    // Speed indicator
    ctx.fillStyle = '#ff6600';
    ctx.font = '14px monospace';
    ctx.fillText(`${playbackSpeed}x`, width - 50, 25);

  }, [data, forecasts, currentTime, width, height, timeWindow, playbackSpeed]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        border: '1px solid #333',
        backgroundColor: '#1a1a1a'
      }}
    />
  );
}