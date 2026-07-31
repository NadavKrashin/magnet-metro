/** Maps world units to canvas pixels. Shared by the renderer and mechanic overlays. */
export interface View {
  toScreenX(worldX: number): number;
  toScreenY(worldY: number): number;
  /** Canvas pixels per world unit. */
  scale: number;
}
