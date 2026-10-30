import * as THREE from "three";

export function elevationToRelief(elevation: number): number {
  const normalized = Math.max(0, Math.min(1, elevation));
  return .12 + Math.pow(normalized, .72) * 2.58;
}

export function terrainColor(elevation: number): THREE.Color {
  const normalized = Math.max(0, Math.min(1, elevation));
  if (normalized > .72) return new THREE.Color(0xb7a681);
  if (normalized > .48) return new THREE.Color(0x918569);
  if (normalized > .27) return new THREE.Color(0x607b64);
  return new THREE.Color(0x23504b);
}
