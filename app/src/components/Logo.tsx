export function Logo({ size = 22 }: { size?: number }) {
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
