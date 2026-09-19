interface ShapeGatewayEnvironment {
  readonly VITE_ASO_SHAPE_GATEWAY?: string;
}

/** Resolve the only browser origin authorized to serve replica shapes. */
export function requireShapeGatewayUrl(environment: ShapeGatewayEnvironment): string {
  const gateway = environment.VITE_ASO_SHAPE_GATEWAY?.trim();
  if (!gateway) {
    throw new Error("VITE_ASO_SHAPE_GATEWAY is required to open the authorized replica.");
  }
  return gateway;
}
