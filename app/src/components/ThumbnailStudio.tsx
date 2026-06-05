"use client";

// Simplified thumbnail flow:
//   1. Click "Pick from podcast" — detects up to 4 people, cuts each
//      out with remove.bg. Each person becomes ONE card in the strip;
//      flip + remove-bg act in place (no duplicate cards).
//   2. Choose a card, drop into Bannerbear template, render.
//   3. Post-render: Adjust (re-crops the source frame + re-renders),
//      Enhance (Gemini on the rendered output), Save to YouTube.

import { useEffect, useMemo, useRef, useState } from "react";
import { extractFrames } from "@/lib/frame-extract";
import { CropZoom } from "./CropZoom";
import {
  fileToBase64,
  flipImageHorizontal,
  cropBase64Region,
  shrinkImageForUpload,
} from "@/lib/image-ops";

// res.json() throws when the server returns plain text (e.g. Vercel's
// "Request Entity Too Large" gate before the route runs). Decode safely
// and surface the readable body when JSON parsing fails.
async function readJsonOrText(res: Response): Promise<{ json: Record<string, unknown> | null; text: string }> {
  const text = await res.text();
  try {
    return { json: text ? JSON.parse(text) : null, text };
  } catch {
    return { json: null, text };
  }
}

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
  url: string;
}

interface Template {
  uid: string;
  name: string;
  preview_url?: string;
  available_modifications?: { name: string; type: string }[];
}

interface PersonCard {
  id: string;
  url: string;
  // The full, unmodified source URL — Adjust always reopens against this
  // so the user never loses pixels by re-cropping the previously-cropped
  // image. Flip and Remove BG do replace `url`, but only after producing
  // a NEW source from the original (so the strip thumbnail follows the
  // latest version while Adjust still has the full image to work with).
  originalUrl: string;
  label: string;
  transparent: boolean;
}

const FRAME_COUNT = 6;

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

function isImageField(name: string): boolean {
  return /(image|photo|avatar|logo|picture|pic|background|container)/i.test(name);
}

function bust(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_r=${Date.now()}`;
}

export function ThumbnailStudio({
  files,
  defaultTitle = "",
  defaultSubtitle = "",
  focusFileId,
}: {
  files: FileRow[];
  defaultTitle?: string;
  defaultSubtitle?: string;
  focusFileId?: string;
}) {
  const videoFiles = useMemo(
    () => files.filter((f) => isVideo(f.filename)),
    [files],
  );

  const [sourceFileId, setSourceFileId] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [cards, setCards] = useState<PersonCard[]>([]);
  const [activeCardId, setActiveCardId] = useState<string>("");
  const [stage, setStage] = useState<
    | "idle"
    | "extracting"
    | "finding"
    | "removing-bg"
    | "flipping"
    | "uploading"
    | "rendering"
    | "re-cropping"
    | "enhancing-final"
    | "suggesting"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  // AI thumbnail suggestions (video frames + episode transcript → Gemini).
  const [suggestions, setSuggestions] = useState<
    { label: string; url: string; reason: string; headline?: string }[]
  >([]);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  // When enabled, "Pick from podcast" removes the background on each
  // detected person. Turn off when the template already has its own
  // backdrop and you want the original frame intact.
  // BG removal is now an explicit per-card action ("Remove BG" button)
  // instead of a global checkbox. Initial extraction always keeps the
  // raw frame so users can decide per face.
  const autoRemoveBg = false;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  // Tracks WHICH card is assigned to each image layer (by card id).
  // Layers track the card, not the URL, so when a card's URL changes
  // (flip / bg removal / re-crop) only the assigned layer updates.
  const [layerCard, setLayerCard] = useState<Record<string, string>>({});
  const [aiSuggested, setAiSuggested] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [adjustLayer, setAdjustLayer] = useState<string | null>(null);
  const [slotAspect, setSlotAspect] = useState<number | undefined>(undefined);
  const slotDimsCache = useRef<Map<string, number>>(new Map());

  const activeCard = cards.find((c) => c.id === activeCardId);
  const activeUrl = activeCard?.url ?? "";

  useEffect(() => {
    if (videoFiles.length > 0 && !sourceFileId) {
      setSourceFileId(videoFiles[0].fileId);
      setSourceUrl(videoFiles[0].url);
    }
  }, [videoFiles, sourceFileId]);

  useEffect(() => {
    if (!focusFileId) return;
    const row = videoFiles.find((v) => v.fileId === focusFileId);
    if (!row) return;
    setSourceFileId(row.fileId);
    setSourceUrl(row.url);
    setCards([]);
    setActiveCardId("");
    setAiSuggested(false);
    setResult(null);
    setLayerCard({});
  }, [focusFileId, videoFiles]);

  // Whenever a card's URL changes (in-place flip / bg removal / re-crop),
  // update only the layers that have that card assigned.
  useEffect(() => {
    if (Object.keys(layerCard).length === 0) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const [layer, cardId] of Object.entries(layerCard)) {
        const c = cards.find((card) => card.id === cardId);
        if (c) next[layer] = c.url;
      }
      return next;
    });
  }, [cards, layerCard]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai/bannerbear/templates");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setTemplatesError(data.message || `Templates ${res.status}`);
          return;
        }
        const data = await res.json();
        setTemplates(data.templates ?? []);
      } catch (err) {
        setTemplatesError((err as Error).message);
      }
    })();
  }, []);

  const tmpl = templates.find((t) => t.uid === selectedTemplate);

  useEffect(() => {
    if (!tmpl) return;
    const next: Record<string, string> = {};
    for (const m of tmpl.available_modifications ?? []) {
      if (isImageField(m.name)) {
        next[m.name] = "";
        continue;
      }
      if (m.type === "text" && /title/i.test(m.name) && defaultTitle) {
        next[m.name] = defaultTitle;
      } else if (
        m.type === "text" &&
        /subtitle|host|guest/i.test(m.name) &&
        defaultSubtitle
      ) {
        next[m.name] = defaultSubtitle;
      } else {
        next[m.name] = "";
      }
    }
    setValues(next);
    setLayerCard({});
    setResult(null);
    setSavedAt(null);
  }, [tmpl, defaultTitle, defaultSubtitle]);

  useEffect(() => {
    if (!sourceFileId || aiSuggested) return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/transcribe/${sourceFileId}/status?include=data`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.ai?.title && tmpl) {
          const titleField = tmpl.available_modifications?.find(
            (m) => m.type === "text" && /title/i.test(m.name),
          );
          if (titleField) {
            setValues((prev) =>
              prev[titleField.name]
                ? prev
                : { ...prev, [titleField.name]: data.ai.title },
            );
          }
        }
        setAiSuggested(true);
      } catch {
        /* ignore */
      }
    })();
  }, [sourceFileId, aiSuggested, tmpl]);

  async function pickFromPodcast() {
    if (!sourceFileId || !sourceUrl) return;
    setError(null);
    setCards([]);
    setActiveCardId("");
    setStage("extracting");
    try {
      const raw = await extractFrames(sourceUrl, FRAME_COUNT);
      setStage("finding");
      const visionRes = await fetch("/api/ai/find-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: sourceFileId, framesBase64: raw }),
      });
      const { json: visionData, text: visionText } = await readJsonOrText(visionRes);
      if (!visionRes.ok) {
        const msg =
          (visionData && (visionData.message as string | undefined)) ||
          (visionRes.status === 413
            ? "Frames are too large for upload. The video resolution is too high — try a shorter clip."
            : `Find people failed (${visionRes.status})`) ||
          visionText.slice(0, 200);
        setError(msg);
        setStage("idle");
        return;
      }
      if (!visionData) {
        setError("Unexpected response from find-people");
        setStage("idle");
        return;
      }
      const people = (visionData.people ?? []) as Array<{
        frameIndex: number;
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
      }>;
      if (people.length === 0) {
        setError("No people detected. Try uploading an image instead.");
        setStage("idle");
        return;
      }

      setStage(autoRemoveBg ? "removing-bg" : "extracting");
      const next: PersonCard[] = [];
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        const frameB64 = raw[p.frameIndex];
        if (!frameB64) continue;
        const cropped = await cropBase64Region(frameB64, p, 0.12);
        const upRes = await fetch("/api/ai/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: sourceFileId,
            imageBase64: cropped,
            label: `person-${i + 1}-raw-${Date.now()}`,
            mimeType: "image/jpeg",
          }),
        });
        const upData = await upRes.json();
        if (!upRes.ok) continue;
        const idStr = `p${i + 1}-${Date.now()}`;

        const rawUrl = bust(upData.url);
        if (!autoRemoveBg) {
          next.push({
            id: idStr,
            url: rawUrl,
            originalUrl: rawUrl,
            label: p.label || `Person ${i + 1}`,
            transparent: false,
          });
          continue;
        }

        const rbRes = await fetch("/api/ai/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: sourceFileId,
            imageUrl: upData.url,
            label: `person-${i + 1}-${Date.now()}`,
          }),
        });
        const rbData = await rbRes.json();
        if (rbRes.ok) {
          next.push({
            id: idStr,
            url: bust(rbData.url),
            originalUrl: bust(rbData.url),
            label: p.label || `Person ${i + 1}`,
            transparent: true,
          });
        } else {
          next.push({
            id: idStr,
            url: rawUrl,
            originalUrl: rawUrl,
            label: p.label || `Person ${i + 1}`,
            transparent: false,
          });
        }
      }
      if (next.length === 0) {
        setError("Detected people but cutout failed for all of them.");
        setStage("idle");
        return;
      }
      setCards(next);
      setActiveCardId(next[0].id);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  // AI suggestions: send the podcast frames + transcript to Gemini and get
  // back the 3 best ready-to-use thumbnail frames, each with a headline idea.
  async function suggestThumbnails() {
    if (!sourceFileId || !sourceUrl) return;
    setError(null);
    setSuggestions([]);
    setStage("suggesting");
    try {
      const raw = await extractFrames(sourceUrl, FRAME_COUNT);
      const res = await fetch("/api/ai/thumbnails-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: sourceFileId, framesBase64: raw }),
      });
      const { json, text } = await readJsonOrText(res);
      if (!res.ok) {
        setError(
          ((json?.message as string | undefined) ||
            (res.status === 413
              ? "Frames are too large for upload. The video resolution is too high — try a shorter clip."
              : text.slice(0, 200))) ||
            `Suggest failed (${res.status})`,
        );
        setStage("idle");
        return;
      }
      const thumbs = ((json?.thumbnails ?? []) as typeof suggestions);
      if (thumbs.length === 0) {
        setError("Gemini returned no suggestions. Try again.");
        setStage("idle");
        return;
      }
      setSuggestions(thumbs);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  // Save one suggested frame straight to the file's cover (.cover.jpg) so the
  // YouTube modal picks it up — same endpoint the rendered flow uses.
  async function useSuggestionAsCover(url: string) {
    if (!sourceFileId) return;
    setError(null);
    setStage("suggesting");
    try {
      const up = await fetch("/api/ai/save-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: sourceFileId, sourceUrl: url, label: "cover" }),
      });
      if (!up.ok) {
        const d = (await up.json().catch(() => ({}))) as { message?: string };
        setError(d.message || `Save failed (${up.status})`);
        setStage("idle");
        return;
      }
      setSavedAt(Date.now());
      window.dispatchEvent(new CustomEvent("onpod:thumbnail-saved"));
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function flipActive() {
    if (!activeCard || !sourceFileId) return;
    setStage("flipping");
    setError(null);
    try {
      // Keep alpha only if the source already had it (PNG with bg removed).
      // Otherwise output JPEG so the flipped payload stays well under
      // Vercel's 4.5 MB body limit.
      const hasAlpha = activeCard.transparent || activeCard.url.includes(".png");
      const { base64, mime } = await flipImageHorizontal(activeCard.url, {
        keepAlpha: hasAlpha,
      });
      const res = await fetch("/api/ai/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageBase64: base64,
          label: `flipped-${activeCard.id}-${Date.now()}`,
          mimeType: mime,
        }),
      });
      const { json: data, text } = await readJsonOrText(res);
      if (!res.ok) {
        const msg =
          (data && (data.message as string | undefined)) ||
          (res.status === 413 ? "Flipped image too large; try a smaller source." : `Flip failed (${res.status})`) ||
          text.slice(0, 200);
        setError(msg);
        setStage("idle");
        return;
      }
      const url = data?.url as string | undefined;
      if (!url) {
        setError("Flip upload returned no URL.");
        setStage("idle");
        return;
      }
      // Replace the active card in place, don't append
      setCards((prev) =>
        prev.map((c) =>
          c.id === activeCard.id
            ? {
                ...c,
                url: bust(url),
                originalUrl: bust(url),
                transparent: hasAlpha,
              }
            : c,
        ),
      );
      // layerCard useEffect re-pushes the new URL into any assigned layer
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function removeBgActive() {
    if (!activeCard || !sourceFileId) return;
    if (activeCard.transparent) {
      setError("This image is already a cutout.");
      return;
    }
    setStage("removing-bg");
    setError(null);
    try {
      const res = await fetch("/api/ai/remove-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageUrl: activeCard.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Remove-bg failed");
        setStage("idle");
        return;
      }
      setCards((prev) =>
        prev.map((c) =>
          c.id === activeCard.id
            ? { ...c, url: bust(data.url), transparent: true }
            : c,
        ),
      );
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || !sourceFileId) return;
    setStage("uploading");
    setError(null);
    try {
      const next: PersonCard[] = [];
      for (const f of Array.from(fileList)) {
        // Shrink before upload — large camera shots routinely exceed
        // Vercel's serverless body limit and were failing with a plain
        // text "Request Entity Too Large" the client couldn't parse.
        const { base64, mime } = await shrinkImageForUpload(f);
        const res = await fetch("/api/ai/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: sourceFileId,
            imageBase64: base64,
            label: `upload-${Date.now()}`,
            mimeType: mime,
          }),
        });
        const { json: data, text } = await readJsonOrText(res);
        if (!res.ok) {
          const msg =
            (data && (data.message as string | undefined)) ||
            (res.status === 413 ? "Image is still too large after compression. Try a smaller file." : `Upload failed (${res.status})`) ||
            text.slice(0, 200);
          throw new Error(msg);
        }
        const url = data?.url as string | undefined;
        if (!url) throw new Error("Upload succeeded but no URL was returned.");
        next.push({
          id: `up-${Date.now()}-${f.name.slice(0, 6)}`,
          url: bust(url),
          originalUrl: bust(url),
          label: f.name.slice(0, 24),
          transparent: mime.includes("png"),
        });
      }
      setCards((prev) => [...next, ...prev]);
      if (next[0]) setActiveCardId(next[0].id);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function render() {
    if (!tmpl || !sourceFileId) return;
    setStage("rendering");
    setError(null);
    setResult(null);
    setSavedAt(null);
    try {
      const modifications = Object.entries(values)
        .filter(([, v]) => v && v.trim().length > 0)
        .map(([name, v]) =>
          isImageField(name) ? { name, image_url: v } : { name, text: v },
        );
      const res = await fetch("/api/ai/bannerbear/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          templateId: tmpl.uid,
          modifications,
          slug: tmpl.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Render failed (${res.status})`);
        setStage("idle");
        return;
      }
      setResult({ url: bust(data.url) });
      window.dispatchEvent(new CustomEvent("onpod:thumbnail-saved"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStage("idle");
    }
  }

  // After render: re-crop the chosen card (whichever was selected for
  // adjustment), then re-render the template with the new image.
  async function applyAdjust(payload: { base64: string; mime: string }) {
    // Determine which card we're adjusting: either the one assigned to
    // the layer the user picked, or the active card if none specified.
    const targetCardId = adjustLayer
      ? layerCard[adjustLayer]
      : activeCard?.id;
    const targetCard = cards.find((c) => c.id === targetCardId);
    if (!targetCard || !sourceFileId || !tmpl) return;
    setCropOpen(false);
    setAdjustLayer(null);
    setStage("re-cropping");
    setError(null);
    try {
      const upRes = await fetch("/api/ai/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageBase64: payload.base64,
          label: `adj-${targetCard.id}-${Date.now()}`,
          mimeType: payload.mime,
        }),
      });
      const { json: upData, text: upText } = await readJsonOrText(upRes);
      if (!upRes.ok) {
        const msg =
          (upData && (upData.message as string | undefined)) ||
          (upRes.status === 413 ? "Adjusted image too large; zoom out or pick a smaller source." : `Save crop failed (${upRes.status})`) ||
          upText.slice(0, 200);
        setError(msg);
        setStage("idle");
        return;
      }
      const adjustedUrl = upData?.url as string | undefined;
      if (!adjustedUrl) {
        setError("Crop upload returned no URL.");
        setStage("idle");
        return;
      }
      const newUrl = bust(adjustedUrl);
      const isTransparent = payload.mime.includes("png");

      // If the same source card is assigned to multiple layers (e.g.
      // host + guest both using the same uploaded face), adjusting one
      // should NOT move the other. Split the card so the adjusted slot
      // gets its own independent crop, leaving the other slots on the
      // original card.
      const layersUsingCard = Object.entries(layerCard).filter(
        ([, cid]) => cid === targetCard.id,
      );
      const isShared = layersUsingCard.length > 1 && adjustLayer !== null;

      const nextValues: Record<string, string> = { ...values };

      if (isShared) {
        // Clone targetCard into a new variant. Original card keeps its
        // url; new card holds the freshly-adjusted crop.
        const variant: PersonCard = {
          ...targetCard,
          id: `${targetCard.id}-v${Date.now()}`,
          label: `${targetCard.label} (slot)`,
          url: newUrl,
          transparent: isTransparent,
        };
        setCards((prev) => [...prev, variant]);
        setLayerCard((prev) => ({ ...prev, [adjustLayer!]: variant.id }));
        nextValues[adjustLayer!] = newUrl;
      } else {
        // Single-slot or unassigned card → mutate the card itself.
        setCards((prev) =>
          prev.map((c) =>
            c.id === targetCard.id
              ? { ...c, url: newUrl, transparent: isTransparent }
              : c,
          ),
        );
        for (const [ln, cid] of Object.entries(layerCard)) {
          if (cid === targetCard.id) nextValues[ln] = newUrl;
        }
        // If this card wasn't assigned to any layer yet, drop it into
        // the first image layer of the template.
        if (!Object.values(layerCard).includes(targetCard.id)) {
          const firstImg = tmpl.available_modifications?.find((m) =>
            isImageField(m.name),
          );
          if (firstImg) {
            nextValues[firstImg.name] = newUrl;
            setLayerCard((prev) => ({ ...prev, [firstImg.name]: targetCard.id }));
          }
        }
      }
      setValues(nextValues);

      // Re-render the template
      setStage("rendering");
      const modifications = Object.entries(nextValues)
        .filter(([, v]) => v && v.trim().length > 0)
        .map(([name, v]) =>
          isImageField(name) ? { name, image_url: v } : { name, text: v },
        );
      const rres = await fetch("/api/ai/bannerbear/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          templateId: tmpl.uid,
          modifications,
          slug: tmpl.name,
        }),
      });
      const rdata = await rres.json();
      if (!rres.ok) {
        setError(rdata.message || `Re-render failed (${rres.status})`);
        setStage("idle");
        return;
      }
      setResult({ url: bust(rdata.url) });
      setSavedAt(null);
      window.dispatchEvent(new CustomEvent("onpod:thumbnail-saved"));
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function enhanceFinal() {
    if (!result || !sourceFileId) return;
    setStage("enhancing-final");
    setError(null);
    try {
      const res = await fetch("/api/ai/enhance-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageUrl: result.url,
          label: `cover-enhanced-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Enhance failed");
        setStage("idle");
        return;
      }
      setResult({ url: bust(data.url) });
      window.dispatchEvent(new CustomEvent("onpod:thumbnail-saved"));
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function saveToYouTube(): Promise<boolean> {
    if (!result || !sourceFileId) return false;
    // Server-side save — the route fetches the rendered image from
    // Bannerbear (no CORS issues from the browser) and stores it under
    // the file's canonical .cover.jpg key so the YouTube modal picks it
    // up next time it opens. Returns the success/failure boolean so the
    // caller can choose whether to clear the preview only on success.
    try {
      const up = await fetch("/api/ai/save-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          sourceUrl: result.url,
          label: "cover",
        }),
      });
      if (!up.ok) {
        const d = (await up.json().catch(() => ({}))) as { message?: string };
        setError(d.message || `Save failed (${up.status})`);
        return false;
      }
      setSavedAt(Date.now());
      window.dispatchEvent(new CustomEvent("onpod:thumbnail-saved"));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }

  function reset() {
    setResult(null);
    setSavedAt(null);
    setValues((prev) => {
      const next: Record<string, string> = {};
      for (const k of Object.keys(prev)) {
        if (!isImageField(k)) next[k] = prev[k];
        else next[k] = "";
      }
      return next;
    });
    setLayerCard({});
  }

  if (videoFiles.length === 0) return null;

  const busy = stage !== "idle";

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold">Thumbnail studio</h2>
        <p className="text-[12px] text-text-muted">
          Pick people from the podcast, drop them into a template, then
          adjust + enhance on the final image.
        </p>
      </div>

      {/* Step 1 — pick people */}
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
          1 · People from the podcast
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={pickFromPodcast}
            disabled={busy}
            className="px-3 py-2 rounded-[10px] bg-accent text-white text-[12px] disabled:opacity-50"
          >
            {stage === "extracting"
              ? "Extracting…"
              : stage === "finding"
                ? "Finding people…"
                : stage === "removing-bg" && cards.length === 0
                  ? "Cutting out…"
                  : "👥 Pick from podcast"}
          </button>
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={busy}
            className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
          >
            {stage === "uploading" ? "Uploading…" : "⬆︎ Upload image"}
          </button>
          <button
            onClick={suggestThumbnails}
            disabled={busy}
            title="Reads the episode transcript + video frames and picks the 3 best thumbnail moments (Gemini). Requires a transcript."
            className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-accent-2 text-accent-2 text-[12px] disabled:opacity-50"
          >
            {stage === "suggesting" ? "Analyzing…" : "✨ Suggest with AI"}
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void uploadFiles(e.target.files)}
          />
        </div>
        <p className="text-[11px] text-text-dim mt-2">
          After picking or uploading, use the &quot;Remove BG&quot; button on
          the selected person to cut out the background. Or hit{" "}
          <b>✨ Suggest with AI</b> to get the 3 best thumbnail frames straight
          from the episode (video + transcript).
        </p>

        {suggestions.length > 0 ? (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
              ✨ AI suggestions · from video + transcript
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {suggestions.map((s, i) => (
                <div
                  key={s.label || i}
                  className="rounded-[10px] border border-border overflow-hidden bg-bg-elev-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={s.headline || s.label}
                    className="w-full aspect-video object-cover block"
                  />
                  <div className="p-2">
                    {s.headline ? (
                      <div className="text-[12px] font-semibold mb-0.5">{s.headline}</div>
                    ) : null}
                    <div className="text-[11px] text-text-muted">{s.reason}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => void useSuggestionAsCover(s.url)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-[8px] bg-accent text-white text-[11px] disabled:opacity-50"
                      >
                        Use as cover
                      </button>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-accent-2 underline"
                      >
                        Open full
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {cards.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            {cards.map((c) => (
              <div
                key={c.id}
                className={`relative rounded-[10px] overflow-hidden border-2 transition cursor-pointer ${
                  activeCardId === c.id
                    ? "border-accent"
                    : "border-border hover:border-border-strong"
                }`}
                onClick={() => setActiveCardId(c.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.url}
                  alt={c.label}
                  className="w-full block"
                  style={
                    c.transparent
                      ? {
                          backgroundImage:
                            "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)",
                          backgroundSize: "16px 16px",
                          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                          backgroundColor: "#1a1a1d",
                        }
                      : undefined
                  }
                />
                <div className="absolute top-1 left-1 px-2 py-0.5 rounded-full text-[10px] uppercase bg-black/70 text-white">
                  {c.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeCard ? (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-text-muted">
              Selected: <b>{activeCard.label}</b>
            </span>
            <button
              onClick={flipActive}
              disabled={busy}
              className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
            >
              {stage === "flipping" ? "Flipping…" : "⇆ Flip"}
            </button>
            {!activeCard.transparent ? (
              <button
                onClick={removeBgActive}
                disabled={busy}
                className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
              >
                {stage === "removing-bg" ? "Removing…" : "✂️ Remove BG"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Step 2 — template + layers */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
          <div className="text-[11px] uppercase tracking-wider text-text-dim">
            2 · Drop into template
          </div>
          <a
            href="mailto:jeremy@onpod.io?subject=Custom thumbnail template request"
            className="text-[11px] text-text-muted hover:text-text underline"
          >
            Email jeremy@onpod.io for custom templates
          </a>
        </div>

        {templatesError ? (
          <div className="text-[12px] text-danger mb-3">
            {templatesError}. Set <code>BANNERBEAR_API_KEY</code> in Vercel.
          </div>
        ) : null}

        {templates.length === 0 ? (
          <div className="text-[12px] text-text-muted mb-3">Loading templates…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
            {templates.map((t) => (
              <button
                key={t.uid}
                type="button"
                onClick={() => setSelectedTemplate(t.uid)}
                title={t.name}
                className={`group rounded-[10px] overflow-hidden border-2 transition text-left ${
                  selectedTemplate === t.uid
                    ? "border-accent"
                    : "border-border hover:border-border-strong"
                }`}
              >
                {t.preview_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={t.preview_url}
                    alt={t.name}
                    className="block w-full aspect-video object-cover bg-bg-elev-3"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full aspect-video bg-bg-elev-3 flex items-center justify-center text-text-dim text-[11px]">
                    No preview
                  </div>
                )}
                <div className="px-2 py-1.5 text-[11px] truncate">{t.name}</div>
              </button>
            ))}
          </div>
        )}

        {tmpl ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tmpl.preview_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={tmpl.preview_url}
                alt={tmpl.name}
                className="rounded-[10px] border border-border w-full"
              />
            ) : null}
            <div className="space-y-3">
              {(tmpl.available_modifications ?? []).map((m) => {
                const isImg = isImageField(m.name);
                if (isImg) {
                  const currentVal = values[m.name] ?? "";
                  const assignedCardId = layerCard[m.name];
                  const assignedCard = cards.find((c) => c.id === assignedCardId);
                  return (
                    <div key={m.name} className="space-y-1">
                      <div className="text-[11px] text-text-muted flex items-center gap-2 flex-wrap">
                        <code className="text-accent-2">{m.name}</code>
                        {assignedCard ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-accent-2 text-bg text-[9px] uppercase">
                            {assignedCard.label}
                          </span>
                        ) : null}
                      </div>
                      {currentVal ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={currentVal}
                          alt=""
                          className="rounded-[8px] border border-border w-full bg-bg-elev-3"
                        />
                      ) : (
                        <div className="rounded-[8px] border border-dashed border-border bg-bg-elev-3 text-center text-[11px] text-text-dim py-6">
                          (empty — template default will be used)
                        </div>
                      )}

                      {/* Card picker — one mini-thumb per available card */}
                      {cards.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {cards.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setValues((prev) => ({ ...prev, [m.name]: c.url }));
                                setLayerCard((prev) => ({
                                  ...prev,
                                  [m.name]: c.id,
                                }));
                              }}
                              title={c.label}
                              className={`w-14 h-14 rounded-[8px] overflow-hidden border-2 transition ${
                                assignedCardId === c.id
                                  ? "border-accent"
                                  : "border-border hover:border-border-strong"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={c.url}
                                alt={c.label}
                                className="w-full h-full object-cover"
                                style={
                                  c.transparent
                                    ? {
                                        backgroundImage:
                                          "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%)",
                                        backgroundSize: "10px 10px",
                                        backgroundColor: "#1a1a1d",
                                      }
                                    : undefined
                                }
                              />
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              setValues((prev) => ({ ...prev, [m.name]: "" }));
                              setLayerCard((prev) => {
                                const n = { ...prev };
                                delete n[m.name];
                                return n;
                              });
                            }}
                            className="px-2 py-1 rounded-[6px] bg-bg-elev-2 border border-border text-[10px]"
                          >
                            Clear
                          </button>
                        </div>
                      ) : null}

                      <input
                        type="url"
                        value={currentVal}
                        onChange={(e) => {
                          setValues((prev) => ({
                            ...prev,
                            [m.name]: e.target.value,
                          }));
                          // Manual URL detaches from any assigned card
                          setLayerCard((prev) => {
                            const n = { ...prev };
                            delete n[m.name];
                            return n;
                          });
                        }}
                        placeholder="…or paste an image URL"
                        className="w-full px-3 py-1.5 bg-bg-elev-2 border border-border rounded-[8px] text-[12px] font-mono"
                      />
                    </div>
                  );
                }
                return (
                  <label
                    key={m.name}
                    className="block text-[11px] text-text-muted"
                  >
                    <code className="text-accent-2">{m.name}</code>
                    <input
                      type="text"
                      value={values[m.name] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [m.name]: e.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                    />
                  </label>
                );
              })}
              <button
                onClick={render}
                disabled={busy || !sourceFileId}
                className="mt-2 px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
              >
                {stage === "rendering" ? "Rendering…" : "Generate thumbnail"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}

      {/* Step 3 — result + post-render controls */}
      {result ? (
        <div className="mt-5 p-3 bg-bg-elev-2 border border-border rounded-[10px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt="Final thumbnail"
            className="rounded-[8px] border border-border max-w-full"
          />

          {/* Per-layer adjust buttons */}
          {Object.keys(layerCard).length > 0 ? (
            <div className="mt-3">
              <div className="text-[11px] text-text-muted mb-2">
                Adjust an image inside the template:
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(layerCard).map(([layerName, cardId]) => {
                  const card = cards.find((c) => c.id === cardId);
                  if (!card) return null;
                  return (
                    <button
                      key={layerName}
                      onClick={async () => {
                        // Look up the slot's aspect ratio (cached) so the
                        // crop canvas matches the host's actual rectangle
                        // in the template — the right pane and the left
                        // pane finally render at the same shape.
                        if (tmpl) {
                          const cacheKey = `${tmpl.uid}:${layerName}`;
                          const cached = slotDimsCache.current.get(cacheKey);
                          if (cached) {
                            setSlotAspect(cached);
                          } else {
                            setSlotAspect(undefined);
                            void fetch("/api/ai/bannerbear/slot-dims", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                templateId: tmpl.uid,
                                slotName: layerName,
                              }),
                            })
                              .then(async (res) => {
                                if (!res.ok) return;
                                const data = (await res.json()) as {
                                  width?: number;
                                  height?: number;
                                };
                                if (data.width && data.height) {
                                  const a = data.width / data.height;
                                  slotDimsCache.current.set(cacheKey, a);
                                  setSlotAspect(a);
                                }
                              })
                              .catch(() => {});
                          }
                        }
                        setAdjustLayer(layerName);
                        setCropOpen(true);
                      }}
                      disabled={busy}
                      className="px-3 py-2 rounded-[10px] bg-bg-elev-3 border border-border text-[12px] disabled:opacity-50 flex items-center gap-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={card.url}
                        alt=""
                        className="w-6 h-6 rounded object-cover"
                      />
                      🔍 Adjust {card.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={enhanceFinal}
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-bg-elev-3 border border-border text-[12px] disabled:opacity-50"
            >
              {stage === "enhancing-final" ? "Enhancing…" : "✨ Enhance (HD + bright)"}
            </button>
            <button
              onClick={async () => {
                // Only clear the preview AFTER a confirmed save —
                // otherwise a failed save left the user looking at an
                // empty panel with an error tooltip, which felt broken.
                const ok = await saveToYouTube();
                if (ok) reset();
              }}
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-accent text-white text-[12px] font-medium disabled:opacity-50"
              title="Save as the file's cover and clear this preview"
            >
              💾 Save thumbnail
            </button>
            <button
              onClick={() => {
                setResult(null);
                setSavedAt(null);
              }}
              className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px]"
            >
              Close
            </button>
          </div>
          {savedAt ? (
            <p className="text-[12px] text-success mt-2">
              ✓ Saved as the file&apos;s cover. Open the YouTube tab on this
              file — the thumbnail will be pre-selected.
            </p>
          ) : null}
        </div>
      ) : null}

      <CropZoom
        open={cropOpen}
        // Crop against the CURRENT card url (carries flip / bg-removal).
        imageUrl={
          adjustLayer
            ? cards.find((c) => c.id === layerCard[adjustLayer])?.url ?? ""
            : activeCard?.url ?? ""
        }
        // When we know the host slot's aspect (from Bannerbear marker
        // detection), force the crop canvas to that exact shape so the
        // right pane matches the rectangle the host will actually land
        // in. Otherwise fall back to source-image aspect.
        aspect={adjustLayer ? slotAspect : undefined}
        contextImageUrl={result?.url}
        contextLabel={
          adjustLayer
            ? cards.find((c) => c.id === layerCard[adjustLayer])?.label
            : activeCard?.label
        }
        onCancel={() => {
          setCropOpen(false);
          setAdjustLayer(null);
          setSlotAspect(undefined);
        }}
        onApply={applyAdjust}
      />
    </div>
  );
}

function bufferToBase64(buf: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    const chunk = buf.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}
