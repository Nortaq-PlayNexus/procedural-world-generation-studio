import type { ObjectKind } from "./types";

export interface AssetDefinition {
  kind: ObjectKind;
  label: string;
  category: "vegetation" | "rock" | "landmark";
  /** Default visual scale used when the asset is hand-placed. */
  scale: number;
  minSlope: number;
  maxSlope: number;
  dryOnly: boolean;
  icon: string;
}

/**
 * Editor catalog. Placement rules here mirror the generator's environmental
 * rules: the editor can override them deliberately, but defaults stay coherent.
 */
export const ASSET_CATALOG: AssetDefinition[] = [
  { kind: "pine", label: "Pine", category: "vegetation", scale: 1.15, minSlope: 0, maxSlope: 0.78, dryOnly: true, icon: "♠" },
  { kind: "redwood", label: "Redwood", category: "vegetation", scale: 1.3, minSlope: 0, maxSlope: 0.7, dryOnly: true, icon: "♣" },
  { kind: "jungle", label: "Jungle tree", category: "vegetation", scale: 1.2, minSlope: 0, maxSlope: 0.72, dryOnly: true, icon: "❦" },
  { kind: "palm", label: "Palm", category: "vegetation", scale: 1.05, minSlope: 0, maxSlope: 0.6, dryOnly: true, icon: "☘" },
  { kind: "shrub", label: "Shrub", category: "vegetation", scale: 0.7, minSlope: 0, maxSlope: 0.95, dryOnly: true, icon: "✿" },
  { kind: "grass tuft", label: "Ground cover", category: "vegetation", scale: 0.55, minSlope: 0, maxSlope: 1.1, dryOnly: true, icon: "≋" },
  { kind: "rock", label: "Rock", category: "rock", scale: 0.6, minSlope: 0, maxSlope: 2, dryOnly: true, icon: "◆" },
  { kind: "boulder", label: "Boulder", category: "rock", scale: 1.1, minSlope: 0, maxSlope: 2, dryOnly: true, icon: "⬢" },
  { kind: "ruin", label: "Ruin", category: "landmark", scale: 1, minSlope: 0, maxSlope: 0.45, dryOnly: true, icon: "▤" },
  { kind: "obelisk", label: "Obelisk", category: "landmark", scale: 1, minSlope: 0, maxSlope: 0.3, dryOnly: true, icon: "◈" },
];

export const ASSET_BY_KIND = Object.fromEntries(ASSET_CATALOG.map((asset) => [asset.kind, asset])) as Record<ObjectKind, AssetDefinition>;

export function assetDefinition(kind: ObjectKind): AssetDefinition {
  return ASSET_BY_KIND[kind] ?? ASSET_CATALOG[0];
}
