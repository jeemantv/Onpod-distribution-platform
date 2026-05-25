// Browser-side frame extractor. Pulls N evenly-spaced frames from a video
// URL via <video> + canvas. Returns base64 JPEGs (no `data:` prefix).
//
// Sampling avoids the first/last 5% to skip intros/outros.

// 6 frames × ~1280×720 JPEGs at q=0.85 used to land ~4-5 MB of JSON which
// is right at Vercel's serverless body limit. Cap at 960 wide / q=0.75 so
// vertical videos (where height is the long side) still fit comfortably.
const FRAME_WIDTH = 960;
const JPEG_QUALITY = 0.75;
const FRAME_MAX_DIM = 1280;

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
  // Constrain BOTH dimensions — for vertical 9:16 videos the long axis
  // would otherwise blow up to 2280px and push the JSON payload past
  // Vercel's body limit even after JPEG compression.
  let cw = FRAME_WIDTH;
  let ch = Math.round(cw * aspect);
  if (ch > FRAME_MAX_DIM) {
    ch = FRAME_MAX_DIM;
    cw = Math.round(ch / aspect);
  }
  canvas.width = cw;
  canvas.height = ch;
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
