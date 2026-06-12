import { LOGO_URL } from "@/lib/api";

export function Logo({ size = 36, withText = true, light = false }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-logo">
      <img
        src={LOGO_URL}
        alt="Chess Klub Mysuru"
        style={{ width: size, height: size, objectFit: "contain" }}
        className={light ? "" : ""}
      />
      {withText && (
        <div className="leading-tight">
          <div
            className={`ck-display text-[18px] font-semibold tracking-tight ${
              light ? "text-white" : "text-[var(--ck-black)]"
            }`}
          >
            Chess <span style={{ color: "var(--ck-orange)" }}>Klub</span>
          </div>
          <div
            className={`text-[10px] uppercase tracking-[0.18em] font-semibold ${
              light ? "text-white/60" : "text-[var(--ck-muted)]"
            }`}
          >
            Mysuru · CAMS
          </div>
        </div>
      )}
    </div>
  );
}
