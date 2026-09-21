export const HUB_PAINTING_SCALE = 1.2;
export const HUB_PORTALS = [
  { id: 'gallery', label: 'Woodland gallery', x: -32, z: -14, yaw: 0.15, flat: false, image: '/assets/fieldhouse.jpg', destination: '/gallery' },
  { id: 'grove', label: 'Halloween Hollow', x: -67, z: -69, yaw: -0.9, flat: false, image: '/assets/oilpainting.jpg', destination: '/seasons' },
  { id: 'north', label: 'The Ash Warden', x: 88, z: -51, yaw: 1.8, flat: false, image: '/assets/tree.jpg', destination: '/boss' },
  { id: 'playground', label: 'Lakeside training grounds', x: 69, z: 82, yaw: 2.4, flat: false, image: '/assets/plaster.jpg', destination: '/playground' },
  { id: 'island', label: 'Fallen painting', x: -28, z: 102, yaw: 0, flat: true, image: '/assets/hands.jpg', destination: '/gallery' },
];

export function inPortalGarden(x: number, z: number) {
  return HUB_PORTALS.some((portal) => Math.hypot(x - portal.x, z - portal.z) < 5);
}

const FIRST_PATH = [[0, 6], [-6, 4], [-15, -3], [-24, -6], [-31.5, -10]];
export function firstPathDistance(x: number, z: number) {
  if (x < -35 || x > 3 || z < -14 || z > 9) return Infinity;
  let distance = Infinity;
  for (let i = 1; i < FIRST_PATH.length; i++) {
    const [ax, az] = FIRST_PATH[i-1], [bx, bz] = FIRST_PATH[i];
    const dx = bx-ax, dz = bz-az;
    const t = Math.max(0, Math.min(1, ((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    distance = Math.min(distance, Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  return distance;
}
