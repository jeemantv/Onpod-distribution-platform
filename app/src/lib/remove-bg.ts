// Cut the foreground subjects (people) out of an image and return a
// transparent PNG of just them. Used to layer the people back on TOP of a
// titled thumbnail so the title reads as sitting BEHIND their heads.
//
// Uses remove.bg with a direct binary upload (image_file) so we don't need to
// round-trip the frame through B2 first.

export async function removeBackgroundBuffer(input: Buffer): Promise<Buffer> {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) throw new Error("REMOVE_BG_API_KEY not set");

  const form = new FormData();
  form.append("image_file", new Blob([new Uint8Array(input)], { type: "image/jpeg" }), "frame.jpg");
  form.append("size", "auto");
  form.append("format", "png");

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": key },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`remove.bg ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
