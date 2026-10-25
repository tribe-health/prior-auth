// TJ-ARCH-MOB-001 compliant
// The PatientGPT mark at 28px: the light-surface file on light, the
// slate-bubble file on dark (docs/design/brand rules: never the bare sweeps).
export function BrandMark() {
  return (
    <>
      <img className="mark-img on-light" src="/brand/mark.svg" width={28} height={28} alt="" />
      <img className="mark-img on-dark" src="/brand/mark-dark.svg" width={28} height={28} alt="" />
    </>
  )
}
