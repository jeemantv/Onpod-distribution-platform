"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";

export function SpotifyModal({
  fileId,
  file,
  aiReady,
  onClose,
}: {
  fileId: string;
  file: FileItem;
  aiReady: boolean;
  onClose: () => void;
}) {
  void fileId;
  const [step, setStep] = useState<"form" | "xml">("form");
  const [title, setTitle] = useState(
    aiReady ? "E47 — Why most founders never escape the grind" : "",
  );
  const [description, setDescription] = useState(
    aiReady
      ? "Three seven-figure Canadian founders share the mistakes that almost broke them."
      : "",
  );
  const [season, setSeason] = useState("3");
  const [episode, setEpisode] = useState("47");

  const xml = `<item>
  <title><![CDATA[${title}]]></title>
  <description><![CDATA[${description}]]></description>
  <itunes:summary><![CDATA[${description}]]></itunes:summary>
  <itunes:author>Jeremy Prudhomme</itunes:author>
  <itunes:image href="https://onpod.io/cover.png"/>
  <itunes:duration>00:45:00</itunes:duration>
  <itunes:explicit>false</itunes:explicit>
  <itunes:season>${season}</itunes:season>
  <itunes:episode>${episode}</itunes:episode>
  <itunes:episodeType>full</itunes:episodeType>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <guid isPermaLink="false">onpod-${file.id}-${Date.now()}</guid>
  <enclosure url="https://feeds.onpod.io/audio/${file.id}.mp3" length="0" type="audio/mpeg"/>
  <link>https://onpod.io</link>
</item>`;

  if (step === "xml") {
    return (
      <Modal
        title="Spotify — RSS item generated"
        subtitle="Append inside your <channel> tag on your existing feed"
        onClose={onClose}
        size="lg"
        footer={
          <>
            <button onClick={() => navigator.clipboard.writeText(xml)} className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]">
              Copy XML
            </button>
            <button className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium">
              Download .xml
            </button>
          </>
        }
      >
        <div className="mb-4 p-3 rounded-[10px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[#fbbf24] text-[12px]">
          Update <code className="bg-black/20 px-1 rounded">enclosure url</code>{" "}
          with the actual MP3 URL after upload.
        </div>
        <textarea
          readOnly
          value={xml}
          rows={18}
          className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[10px] font-mono text-[12px]"
        />
      </Modal>
    );
  }

  return (
    <Modal
      title="Push to Spotify / Apple Podcasts"
      subtitle="Generates the RSS <item> XML to append to your feed"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={() => setStep("xml")}
            className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium"
          >
            Push to RSS feed
          </button>
        </>
      }
    >
      <div className="mb-5 p-4 bg-bg-elev-2 border border-border rounded-[12px]">
        <div className="text-[12px] text-text-muted mb-1">Distribution destinations</div>
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          <Dest label="Spotify" />
          <Dest label="Apple Podcasts" />
          <Dest label="Overcast" />
          <Dest label="Pocket Casts" />
          <span className="text-text-dim">+ ~30 others via RSS</span>
        </div>
        <div className="text-[11px] text-text-dim mt-2">
          Feed URL: <code className="text-accent-2">https://feeds.onpod.io/founders-lounge.xml</code>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Episode title</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-sp"
          />
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="input-sp"
          />
        </div>
        <div>
          <Label>Season</Label>
          <input value={season} onChange={(e) => setSeason(e.target.value)} className="input-sp" />
        </div>
        <div>
          <Label>Episode</Label>
          <input value={episode} onChange={(e) => setEpisode(e.target.value)} className="input-sp" />
        </div>
        <div>
          <Label>Audio source</Label>
          <select className="input-sp">
            <option>Audio_Master_Stereo.wav (auto-extract)</option>
            <option>Upload custom MP3</option>
          </select>
        </div>
        <div>
          <Label>Episode artwork</Label>
          <select className="input-sp">
            <option>Episode_Cover_v2.png</option>
            <option>Use show default</option>
          </select>
        </div>
        <div className="col-span-2">
          <Label>Publish mode</Label>
          <select className="input-sp">
            <option>Push immediately</option>
            <option>Schedule for later</option>
            <option>Save as draft</option>
          </select>
        </div>
      </div>

      <style jsx>{`
        :global(.input-sp) {
          width: 100%;
          padding: 10px 14px;
          background: #1c1c20;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
        }
      `}</style>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] text-text-muted mb-2">{children}</label>;
}

function Dest({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-elev-3 border border-border text-[12px]">
      <span className="w-1.5 h-1.5 rounded-full bg-success" />
      {label}
    </span>
  );
}
