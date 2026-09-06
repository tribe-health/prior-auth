/**
 * The base component library.
 *
 * Promoted **on demand** from the 61 shadcn primitives in `components/ui`.
 * Wrapping all 61 up front would be speculative work, and a wrapper with no
 * caller is a maintenance cost with no reader.
 *
 * What lives here is what the product's own vocabulary needs — the clinical
 * treatments a generic primitive should not know about. A `Badge` that
 * understood evidence state would put clinical meaning in a component that
 * also renders "New" and "Beta".
 */
export { EvidenceStateChip, type EvidenceStateChipProps } from "./evidence-state-chip";
export { EvidenceCountsSummary, type EvidenceCountsSummaryProps } from "./evidence-counts";
export { CitationChip, type CitationChipProps } from "./citation-chip";
