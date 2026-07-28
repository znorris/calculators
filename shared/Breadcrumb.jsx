/**
 * Breadcrumb trail.
 *
 * `trail` holds the ancestors, nearest last, each with its own href. It is
 * needed because a hardcoded "../" is only correct one level deep: from
 * /compensation-comparison/assumptions/ it resolves to the calculator, not the
 * index, so the link labelled Calculators went somewhere else entirely.
 *
 * Called with only `current`, it keeps the original one-level behavior.
 */
export function Breadcrumb({ current, trail = [{ label: "Calculators", href: "../" }] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        fontSize: 11.5,
        marginBottom: 16,
        color: "#94a3b8",
      }}
    >
      {trail.map((step) => (
        <span key={step.href}>
          <a href={step.href} style={{ color: "#64748b", textDecoration: "none" }}>
            {step.label}
          </a>
          <span style={{ margin: "0 6px", color: "#cbd5e1" }}>/</span>
        </span>
      ))}
      <span style={{ color: "#475569", fontWeight: 500 }} aria-current="page">
        {current}
      </span>
    </nav>
  );
}
