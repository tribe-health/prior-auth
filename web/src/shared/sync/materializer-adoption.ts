/** The memory-blocked RA11c browser materializer is available only for qualification runs. */
export function isExperimentalMaterializerEnabled(value: string | undefined): boolean {
  return value === "experimental";
}
