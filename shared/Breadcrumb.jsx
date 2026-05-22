export function Breadcrumb({ current }) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        fontSize: 11.5,
        marginBottom: 16,
        color: "#94a3b8",
      }}
    >
      <a
        href="../"
        style={{ color: "#64748b", textDecoration: "none" }}
      >
        Calculators
      </a>
      <span style={{ margin: "0 6px", color: "#cbd5e1" }}>/</span>
      <span style={{ color: "#475569", fontWeight: 500 }}>{current}</span>
    </nav>
  );
}
