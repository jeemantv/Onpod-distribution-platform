"use client";

// Zoom + position adjustment for a single image. Output is the visible
// area at 1280×720 (matches typical Bannerbear image layers).
//
// Controls:
//   - Drag the canvas to pan
//   - Wheel or slider to zoom
//   - "Fit" sizes the image to cover the canvas with the original center
//   - Transparency is preserved if the source is a PNG; JPEG inputs
//     produce JPEG output. No mode toggle to confuse the user.

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  imageUrl: string;
  aspect?: number;
  contextImageUrl?: string;
  contextLabel?: string;
  onCancel: () => void;
  onApply: (payload: { base64: string; mime: string }) => void;
}

export function CropZoom({
  open,
  imageUrl,
  aspect = 16 / 9,
  contextImageUrl,
  contextLabel,
  onCancel,
  onApply,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [isPngSource, setIsPngSource] = useState(false);
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  }>({ dragging: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  // Larger canvas so users can zoom WAY out and still capture the full
  // image — Bannerbear downsamples anyway, and bigger inputs mean less
  // accidental cropping when the user is unsure of the framing.
  const W = 2048;
  const H = Math.round(W / aspect);

  function fitContainScale(img: HTMLImageElement): number {
    const sx = W / img.width;
    const sy = H / img.height;
    return Math.min(sx, sy);
  }

  // Fit-cover: image fills the canvas, may overflow. Matches what
  // Bannerbear's image layer typically displays, so the user starts
  // at the framing closest to the rendered result.
  function fitCoverScale(img: HTMLImageElement): number {
    const sx = W / img.width;
    const sy = H / img.height;
    return Math.max(sx, sy);
  }

  function applyFit() {
    const img = imgRef.current;
    if (!img) return;
    setScale(fitCoverScale(img));
    setPan({ x: 0, y: 0 });
  }

  function applyFitWhole() {
    const img = imgRef.current;
    if (!img) return;
    setScale(fitContainScale(img));
    setPan({ x: 0, y: 0 });
  }

  // Load image once per URL — and reset zoom + pan to "fit cover" so the
  // user's starting point is the same shot they were just looking at.
  useEffect(() => {
    if (!open || !imageUrl) return;
    setLoaded(false);
    setIsPngSource(
      imageUrl.includes(".png") || imageUrl.includes("image/png"),
    );
    const img = new Image();
    img.crossOrigin = "anonymous";
    function done(loaded: HTMLImageElement) {
      imgRef.current = loaded;
      setScale(fitCoverScale(loaded));
      setPan({ x: 0, y: 0 });
      setLoaded(true);
    }
    img.onload = () => done(img);
    img.onerror = () => {
      fetch(imageUrl, { cache: "reload" })
        .then((r) => r.blob())
        .then((b) => {
          const url = URL.createObjectURL(b);
          const im2 = new Image();
          im2.onload = () => {
            done(im2);
            URL.revokeObjectURL(url);
          };
          im2.src = url;
        })
        .catch(() => setLoaded(false));
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, open]);

  // Re-draw on any state change. Also overlays a rule-of-thirds grid
  // to help with subject placement (faces usually look best on the
  // intersection points).
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const cx = W / 2 + pan.x - drawW / 2;
    const cy = H / 2 + pan.y - drawH / 2;
    ctx.drawImage(img, cx, cy, drawW, drawH);

    // Rule-of-thirds grid
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const x = (W * i) / 3;
      const y = (H * i) / 3;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();
  }, [scale, pan, loaded, W, H]);

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
    const rect = canvasRef.current?.getBoundingClientRect();
    const ratio = rect ? W / rect.width : 1;
    setPan({
      x: dragRef.current.baseX + dx * ratio,
      y: dragRef.current.baseY + dy * ratio,
    });
  }
  function endDrag() {
    dragRef.current.dragging = false;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setScale((prev) => Math.max(0.1, Math.min(6, prev + prev * delta)));
  }

  function apply() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mime = isPngSource ? "image/png" : "image/jpeg";
    const data =
      mime === "image/png"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", 0.92);
    const b64 = data.split(",")[1] ?? "";
    onApply({ base64: b64, mime });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-bg-elev border border-border rounded-[16px] w-full max-w-4xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold mb-2">
          Adjust {contextLabel ? <span className="text-text-muted font-normal">· {contextLabel}</span> : null}
        </h3>
        <p className="text-[12px] text-text-muted mb-3">
          Drag to move · scroll or use the slider to zoom · Fit to recenter.
        </p>

        {contextImageUrl ? (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">
                Current thumbnail
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={contextImageUrl}
                alt=""
                className="rounded-[8px] border border-border w-full"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">
                {contextLabel ? `New crop for ${contextLabel}` : "New crop"}
              </div>
              <canvas
                ref={canvasRef}
                onMouseDown={startDrag}
                onMouseMove={moveDrag}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onWheel={onWheel}
                className="w-full rounded-[8px] border border-border cursor-grab active:cursor-grabbing"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)",
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
                  backgroundColor: "#0a0a0b",
                }}
              />
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseDown={startDrag}
            onMouseMove={moveDrag}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onWheel={onWheel}
            className="w-full rounded-[10px] border border-border cursor-grab active:cursor-grabbing"
            style={{
              backgroundImage:
                "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
              backgroundColor: "#0a0a0b",
            }}
          />
        )}

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-[11px] text-text-muted flex-1 min-w-[200px]">
            Zoom
            <input
              type="range"
              min={0.1}
              max={6}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full"
            />
          </label>
          <button
            onClick={applyFit}
            title="Fit the image to fill the frame"
            className="px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px]"
          >
            Fit (cover)
          </button>
          <button
            onClick={applyFitWhole}
            title="Show the whole image, may leave empty space"
            className="px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px]"
          >
            Fit (whole)
          </button>
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
            disabled={!loaded}
            className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
