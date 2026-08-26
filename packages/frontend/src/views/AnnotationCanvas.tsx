/**
 * AnnotationCanvas: overlay drawing tool for screenshots.
 * Supports: arrows, rectangles, freehand, and text annotations.
 * Uses HTML5 Canvas composited on top of the captured screenshot.
 */
import { useRef, useState, useEffect, useCallback } from "react";

export type AnnotationTool = "arrow" | "rect" | "freehand" | "text";

export interface AnnotationCanvasProps {
  /** Base64 data URL of the screenshot to annotate */
  imageDataUrl: string;
  width: number;
  height: number;
  /** Called when user confirms the annotated image */
  onConfirm: (annotatedDataUrl: string) => void;
  onCancel: () => void;
}

interface Point { x: number; y: number }

export function AnnotationCanvas({ imageDataUrl, width, height, onConfirm, onCancel }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<AnnotationTool>("arrow");
  const [color, setColor] = useState("#ef4444");
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [paths, setPaths] = useState<Point[]>([]);
  const [annotations, setAnnotations] = useState<Array<{ type: AnnotationTool; data: unknown; color: string }>>([]);
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<Point | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Scale canvas to fit in viewport while maintaining aspect ratio
  const maxWidth = Math.min(width, 900);
  const scale = maxWidth / width;
  const displayWidth = Math.round(width * scale);
  const displayHeight = Math.round(height * scale);

  // Load the base image
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; redraw(); };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !imgRef.current) return;

    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.drawImage(imgRef.current, 0, 0, displayWidth, displayHeight);

    // Draw saved annotations
    for (const ann of annotations) {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = 3;

      if (ann.type === "rect") {
        const { start, end } = ann.data as { start: Point; end: Point };
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      } else if (ann.type === "arrow") {
        const { start, end } = ann.data as { start: Point; end: Point };
        drawArrow(ctx, start, end);
      } else if (ann.type === "freehand") {
        const points = ann.data as Point[];
        if (points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      } else if (ann.type === "text") {
        const { pos, text } = ann.data as { pos: Point; text: string };
        ctx.font = "bold 16px sans-serif";
        // Background for readability
        const metrics = ctx.measureText(text);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(pos.x - 2, pos.y - 16, metrics.width + 4, 20);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, pos.x, pos.y);
      }
    }
  }, [annotations, displayWidth, displayHeight]);

  useEffect(() => { redraw(); }, [redraw]);

  function getPos(e: React.MouseEvent): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    const pos = getPos(e);
    if (tool === "text") {
      setTextPos(pos);
      return;
    }
    setDrawing(true);
    setStartPoint(pos);
    if (tool === "freehand") setPaths([pos]);
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drawing) return;
    const pos = getPos(e);

    if (tool === "freehand") {
      setPaths((prev) => [...prev, pos]);
      // Live preview
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && paths.length > 0) {
        redraw();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(paths[0].x, paths[0].y);
        for (const p of paths) ctx.lineTo(p.x, p.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    } else if (startPoint) {
      // Live preview for rect/arrow
      redraw();
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        if (tool === "rect") {
          ctx.strokeRect(startPoint.x, startPoint.y, pos.x - startPoint.x, pos.y - startPoint.y);
        } else if (tool === "arrow") {
          drawArrow(ctx, startPoint, pos);
        }
      }
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    if (!drawing) return;
    setDrawing(false);
    const end = getPos(e);

    if (tool === "freehand") {
      setAnnotations((prev) => [...prev, { type: "freehand", data: [...paths, end], color }]);
      setPaths([]);
    } else if (startPoint) {
      setAnnotations((prev) => [...prev, { type: tool, data: { start: startPoint, end }, color }]);
    }
    setStartPoint(null);
  }

  function addText() {
    if (!textInput.trim() || !textPos) return;
    setAnnotations((prev) => [...prev, { type: "text", data: { pos: textPos, text: textInput }, color }]);
    setTextInput("");
    setTextPos(null);
    redraw();
  }

  function undo() {
    setAnnotations((prev) => prev.slice(0, -1));
  }

  function confirm() {
    // Render at full resolution for the final output
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = width;
    fullCanvas.height = height;
    const ctx = fullCanvas.getContext("2d")!;
    const fullScale = width / displayWidth;

    ctx.drawImage(imgRef.current!, 0, 0, width, height);

    for (const ann of annotations) {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = 3 * fullScale;

      if (ann.type === "rect") {
        const { start, end } = ann.data as { start: Point; end: Point };
        ctx.strokeRect(start.x * fullScale, start.y * fullScale, (end.x - start.x) * fullScale, (end.y - start.y) * fullScale);
      } else if (ann.type === "arrow") {
        const { start, end } = ann.data as { start: Point; end: Point };
        drawArrow(ctx, { x: start.x * fullScale, y: start.y * fullScale }, { x: end.x * fullScale, y: end.y * fullScale });
      } else if (ann.type === "freehand") {
        const points = ann.data as Point[];
        if (points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(points[0].x * fullScale, points[0].y * fullScale);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * fullScale, points[i].y * fullScale);
        ctx.stroke();
      } else if (ann.type === "text") {
        const { pos, text } = ann.data as { pos: Point; text: string };
        ctx.font = `bold ${16 * fullScale}px sans-serif`;
        const metrics = ctx.measureText(text);
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(pos.x * fullScale - 2, pos.y * fullScale - 16 * fullScale, metrics.width + 4, 20 * fullScale);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, pos.x * fullScale, pos.y * fullScale);
      }
    }

    onConfirm(fullCanvas.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-[960px] w-full overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-medium text-gray-700 mr-2">Annotate:</span>
          {(["arrow", "rect", "freehand", "text"] as AnnotationTool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`px-3 py-1.5 text-xs rounded-md border transition ${
                tool === t ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {t === "arrow" ? "↗ Arrow" : t === "rect" ? "▢ Rectangle" : t === "freehand" ? "✏ Draw" : "T Text"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            <button onClick={undo} disabled={annotations.length === 0} className="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700 disabled:opacity-30">
              ↩ Undo
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="p-4 bg-gray-100 flex justify-center overflow-auto max-h-[60vh]">
          <canvas
            ref={canvasRef}
            width={displayWidth}
            height={displayHeight}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            className="cursor-crosshair border border-gray-300 rounded shadow-sm"
          />
        </div>

        {/* Text input (shows when text tool + clicked) */}
        {tool === "text" && textPos && (
          <div className="px-4 py-2 border-t border-gray-200 flex gap-2">
            <input
              autoFocus
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addText()}
              placeholder="Type annotation text..."
              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <button onClick={addText} className="px-3 py-1.5 bg-primary text-white text-sm rounded-lg">Add</button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <span className="text-xs text-gray-400">{annotations.length} annotation{annotations.length !== 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Skip annotations
            </button>
            <button onClick={confirm} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover">
              Confirm & Use
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Draw an arrow from start to end with a filled arrowhead. */
function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point) {
  const headLen = 15;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}
