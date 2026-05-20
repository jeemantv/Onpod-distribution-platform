// Browser-side frame extractor. Pulls N evenly-spaced frames from a video
// URL via <video> + canvas. Returns base64 JPEGs (no `data:` prefix).
//
// Sampling avoids the first/last 5% to skip intros/outros.

const FRAME_WIDTH = 1280;
const JPEG_QUALITY = 0.85;

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    function done() {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      resolve();
    }
    function fail() {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      reject(new Error(`seek failed @ ${t}`));
    }
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = t;
  });
}

export async function extractFrames(
  videoUrl: string,
  count: number,
): Promise<string[]> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("video load failed"));
  });

  const duration = video.duration;
  if (!isFinite(duration) || duration < 0.1) {
    throw new Error("video duration is 0");
  }

  const canvas = document.createElement("canvas");
  const aspect = video.videoHeight / Math.max(1, video.videoWidth);
  canvas.width = FRAME_WIDTH;
  canvas.height = Math.round(FRAME_WIDTH * aspect);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration * (0.05 + (0.9 * i) / Math.max(1, count - 1));
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const b64 = dataUrl.split(",")[1] ?? "";
    frames.push(b64);
  }
  return frames;
}
