// Uses the OnPod logo PNG when NEXT_PUBLIC_ONPOD_LOGO_URL is set, falls
// back to the styled "O ONPOD" mark for the dev/no-asset case.

export function Logo({ size = 22 }: { size?: number }) {
  const logoUrl = process.env.NEXT_PUBLIC_ONPOD_LOGO_URL;
  if (logoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt="OnPod"
        height={size + 10}
        style={{ height: size + 10, width: "auto" }}
        className="object-contain"
      />
    );
  }
  return (
    <div className="flex items-center gap-[10px]">
      <div
        className="rounded-[8px] flex items-center justify-center display"
        style={{
          width: size + 10,
          height: size + 10,
          background: "linear-gradient(135deg,#a855f7,#ec4899)",
          fontSize: size * 0.75,
        }}
      >
        O
      </div>
      <span
        className="display tracking-[0.08em] brand-text"
        style={{ fontSize: size }}
      >
        ONPOD
      </span>
    </div>
  );
}
