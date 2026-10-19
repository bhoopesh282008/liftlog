// Soft red, ember and cool light behind every page, so the Liquid Glass
// cards and controls have colour to blur and bend. It holds still: light
// moving under blurred glass would force a re-blur every frame. Hidden when
// the person asks for reduced transparency.
export function AmbientBackdrop() {
  return (
    <div aria-hidden className="ambient pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span
        className="ambient-blob -top-[45vmax] -left-[35vmax]"
        style={{ background: "radial-gradient(circle, var(--ambient-a), transparent 62%)" }}
      />
      <span
        className="ambient-blob top-[20vh] -right-[50vmax]"
        style={{ background: "radial-gradient(circle, var(--ambient-b), transparent 60%)" }}
      />
      <span
        className="ambient-blob -bottom-[55vmax] left-[-10vmax]"
        style={{ background: "radial-gradient(circle, var(--ambient-c), transparent 60%)" }}
      />
    </div>
  );
}
