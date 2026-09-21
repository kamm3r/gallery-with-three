export type GallerySigil = 'sun' | 'leaf' | 'moon';
export const GALLERY_SEQUENCE: GallerySigil[] = ['sun', 'leaf', 'moon', 'leaf', 'sun'];
export function advanceGallerySequence(progress: number, seal: GallerySigil, found: readonly GallerySigil[]) {
  if (found.length < 3 || progress >= GALLERY_SEQUENCE.length) return progress;
  return seal === GALLERY_SEQUENCE[progress] ? progress + 1 : seal === 'sun' ? 1 : 0;
}
const cells = new Map<string, [number, number]>();
function room(x1: number, x2: number, z1: number, z2: number) {
  for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) cells.set(`${x},${z}`, [x, z]);
}
room(-1, 1, 0, 3); // Arrival hall.
room(0, 0, -4, -1); // North corridor.
room(-2, 2, -8, -5); // Vault.
room(-5, -3, -3, -1); room(-2, -1, -2, -2); // West archive.
room(3, 5, -3, -1); room(1, 2, -2, -2); // East moon chamber.
room(3, 5, 2, 4); room(2, 2, 3, 3); // Garden wing.
room(-5, -5, -5, -4); room(-6, -5, -7, -6); // Hidden archive annex.
room(5, 5, -5, -4); room(5, 6, -7, -6); // Hidden moon annex.
export const galleryTiles = [...cells.values()];
export const galleryWalls: Array<{ position: [number, number, number]; size: [number, number, number] }> = [];
for (const [x, z] of galleryTiles) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (cells.has(`${x + dx},${z + dz}`)) continue;
    galleryWalls.push({ position: [x * 6 + dx * 3, 3.5, z * 6 + dz * 3], size: [dx ? .4 : 6.4, 7, dz ? .4 : 6.4] });
  }
}
