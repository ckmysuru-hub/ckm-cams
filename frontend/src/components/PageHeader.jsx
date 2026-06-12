export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4" data-testid="page-header">
      <div>
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="ck-display text-4xl md:text-5xl font-semibold text-[var(--ck-black)]" data-testid="page-title">
          {title}
        </h1>
        <div className="ck-divider mt-3" />
        {subtitle && <p className="text-sm text-[var(--ck-muted)] mt-3 max-w-xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
