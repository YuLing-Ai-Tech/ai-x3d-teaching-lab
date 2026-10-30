export type AssetMode = "public-core" | "local-full";

export const assetMode: AssetMode = import.meta.env.VITE_AI_X3D_ASSET_MODE === "local-full"
  ? "local-full"
  : "public-core";

export const hasPrivateAssets = assetMode === "local-full";

export const privateAssetCases = new Set(["long-march", "blender", "geo"]);
