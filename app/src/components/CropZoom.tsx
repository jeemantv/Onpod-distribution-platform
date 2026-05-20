"use client";

// Modal for adjusting a frame before it goes into a Bannerbear template.
// User pans + zooms a source image inside a 1280x720 canvas; clicking
// "Use this crop" hands back a base64 JPEG of the visible area.

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  imageUrl: string;
  aspect?: number; // width/height, default 16/9
  onCancel: () => void;
  onApply: (base64Jpeg: string) => void;
}

export function CropZoom({ open, imageUrl, aspect = 16 / 9, onCancel, onApply }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bg, setBg] = useState("#0a0a0b");
  const [loaded, setLoaded] = useState(false);
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });

  const W = 1280;
  const H = Math.round(W / aspect);

  // Load image once per URL
  useEffect(() => {
    if (!open || !imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      // Initial scale: cover the canvas
      const sx = W / img.width;
      const sy = H / img.height;
      const init = Math.max(sx, sy);
      setScale(init);
      setPan({ x: 0, y: 0 });
      setLoaded(true);
    };
    img.onerror = () => {
      // Fallback: try fetch+blob to bypass CORS-cache issues
      fetch(imageUrl, { cache: "reload" })
        .then((r) => r.blob())
        .then((b) => {
          const url = URL.createObjectURL(b);
          const img2 = new Image();
          img2.onload = () => {
            imgRef.current = img2;
            const sx = W / img2.width;
            const sy = H / img2.height;
            setScale(Math.max(sx, sy));
            setPan({ x: 0, y: 0 });
            setLoaded(true);
            URL.revokeObjectURL(url);
          };
          img2.src = url;
        })
        .catch(() => setLoaded(false));
    };
    img.src = imageUrl;
    setLoaded(false);
  }, [imageUrl, open, W, H]);

  // Re-draw on any change
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const cx = W / 2 + pan.x - drawW / 2;
    const cy = H / 2 + pan.y - drawH / 2;
    ctx.drawImage(img, cx, cy, drawW, drawH);
  }, [scale, pan, bg, loaded, W, H]);

  function startDrag(e: React.MouseEvent) {
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: pan.x,
      baseY: pan.y,
    };
  }
  function moveDrag(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    // Scale mouse delta to canvas pixels (the canvas is rendered at half size in CSS)
    const rect = canvasRef.current?.getBoundingClientRect();
    const ratio = rect ? W / rect.width : 1;
    setPan({ x: dragRef.current.baseX + dx * ratio, y: dragRef.current.baseY + dy * ratio });
  }
  function endDrag() {
    dragRef.current.dragging = false;
  }

  function apply() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL("image/jpeg", 0.92);
    const b64 = data.split(",")[1] ?? "";
    onApply(b64);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg-elev border border-border rounded-[16px] w-full max-w-3xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold mb-2">Adjust crop</h3>
        <p className="text-[12px] text-text-muted mb-3">
          Drag to pan, slider to zoom. Output is locked at {W}×{H}.
        </p>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrag}
          onMouseMove={moveDrag}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          className="w-full rounded-[10px] border border-border cursor-grab active:cursor-grabbing"
        />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-[11px] text-text-muted">
            Zoom
            <input
              type="range"
              min={0.2}
              max={4}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="text-[11px] text-text-muted">
            Background (for transparent PNGs)
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              className="mt-1 h-9 w-20 bg-bg-elev-2 border border-border rounded-[8px]"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                const img = imgRef.current;
                if (!img) return;
                const sx = W / img.width;
                const sy = H / img.height;
                setScale(Math.max(sx, sy));
                setPan({ x: 0, y: 0 });
              }}
              className="px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px]"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
          >
            Use this crop
          </button>
        </div>
      </div>
    </div>
  );
}
