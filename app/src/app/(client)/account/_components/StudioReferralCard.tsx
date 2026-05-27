"use client";

// Externals-only referral pitch. The client (often working with a small
// recording studio that hasn't joined OnPod) sees this on their /account
// dashboard. Hitting the button opens their default mail app with a
// pre-filled invitation to their studio, CC'd to jeremy@onpod.io so we
// catch the lead. They paste the studio's email themselves.

const CALENDLY_URL = "https://calendly.com/onpod-studios/new-meeting";
const REFERRER_CC = "jeremy@onpod.io";

export function StudioReferralCard({
  clientFirstName,
  clientEmail,
}: {
  clientFirstName: string;
  clientEmail: string;
}) {
  const subject = "Have you heard about OnPod Studios?";
  const body = `Hi,

I've been using OnPod (onpod.io) for my podcast — they handle recording, AI metadata, clips, publishing to Spotify/YouTube, the whole pipeline.

They mentioned they're partnering with recording studios. If you bring ${"≥"} 3 clients onto the platform, your studio gets 20TB of free storage on OnPod — no monthly fee for the storage tier.

Worth a 15-minute call? They set up Calendly bookings here:
${CALENDLY_URL}

I've cc'd Jeremy from OnPod on this email so he can answer any questions directly.

Thanks,
${clientFirstName}
${clientEmail}`;

  const href = `mailto:?cc=${encodeURIComponent(REFERRER_CC)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <section className="mb-6 p-5 rounded-[16px] bg-[linear-gradient(135deg,rgba(168,85,247,0.10),rgba(236,72,153,0.10))] border border-[rgba(168,85,247,0.25)]">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-[12px] bg-[rgba(168,85,247,0.18)] text-[#c084fc] flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-medium mb-1">
            Work with a recording studio? Get them 20 TB free.
          </h2>
          <p className="text-[12px] text-text-muted leading-relaxed mb-3">
            OnPod partners with recording studios. If your studio brings 3+
            clients onto OnPod, they unlock <strong>20 TB of free storage</strong> —
            no monthly fee. Send your studio a 30-second intro email and book
            them a quick call. Jeremy from OnPod handles it from there.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={href}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-accent text-white text-[12px] font-medium hover:opacity-90"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Send my studio an invite
            </a>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-bg-elev-3 border border-border-strong text-[12px] hover:border-text-muted"
            >
              Or book the call yourself →
            </a>
          </div>
          <p className="mt-3 text-[10px] text-text-dim">
            Pre-filled email · jeremy@onpod.io is CC&apos;d so OnPod sees the
            intro and can follow up directly. You paste your studio&apos;s email
            in the To: field.
          </p>
        </div>
      </div>
    </section>
  );
}
