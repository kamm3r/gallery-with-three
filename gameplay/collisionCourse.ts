export type CourseShape = 'box' | 'pyramid' | 'sphere' | 'cylinder';
export type Tuple3 = [number, number, number];
export interface CourseObstacle { shape: CourseShape; position: Tuple3; size: Tuple3; rotation?: Tuple3; color: string }
export const COURSE_EXTENT = 80;
export const courseObstacles: CourseObstacle[] = [];
function add(shape: CourseShape, position: Tuple3, size: Tuple3, color = '#c88450', rotation?: Tuple3) {
  courseObstacles.push({ shape, position, size, color, rotation });
}

// Retain the original ramp coordinates for movement regression tests.
for (const [x, angle] of [[-6.5, 10], [0, 20], [6.5, 35], [20, 50], [26, 65]]) {
  const radians = angle * Math.PI / 180;
  const rise = Math.sin(radians) * 6;
  add('box', [x, rise / 2 - .1, 3], [3.2, .24, 6], '#cf8753', [radians, 0, 0]);
  add('box', [x, rise - .13, -.8], [3.2, .3, 1.6], '#deb58c');
}
for (const [lane, riser, tread] of [[0, .18, .68], [1, .3, .7], [2, .48, .85]]) {
  for (let step = 0; step < 9; step++) {
    const h = (step + 1) * riser;
    add('box', [-10.5 - lane * 6, h / 2, -4 - step * tread], [3.4, h, tread + .02], lane === 0 ? '#7d9aa6' : '#468aac');
  }
}
// Rough contacts, from shallow bumps to tall pyramids.
for (let lane = 0; lane < 3; lane++) for (let x = 0; x < 5; x++) for (let z = 0; z < 6; z++) {
  const height = [.22, .55, 1.15][lane];
  add('pyramid', [-31 + lane * 12 + x * 1.55, height / 2, -22 - z * 1.6], [1.5, height, 1.5], (x + z) % 2 ? '#d49966' : '#ab653b');
}
add('pyramid', [-15, 2.8, -39], [9, 5.6, 9]);
for (let i = 0; i < 9; i++) {
  add('box', [20, .1 + (i % 2) * .015, -16 - i * 1.2], [5, .2, 1.18], '#d1ab76');
  add('box', [29, .7, -17 - i * 1.7], [.45, 1.4, 1.2], '#5598b6');
}
for (let i = 0; i < 5; i++) {
  const height = .9 + i * .45;
  add('box', [-6 + i * 4, height / 2, -11], [2.5, height, 2.5], '#638496');
}
// Passage widths are measured between the inside faces.
for (const [i, width] of [[0, .8], [1, 1], [2, 1.4], [3, 2]]) {
  const x = 38 + (i % 2) * 8, z = 6 - Math.floor(i / 2) * 12;
  for (const side of [-1, 1]) add('box', [x + side * (width / 2 + .25), 1.5, z], [.5, 3, 6], '#5d8fa3');
  add('box', [x, 3.15, z], [width + 1, .3, 6], '#7dabb9');
}
for (let i = 0; i < 3; i++) {
  const h = [1.6, 2.1, 2.8][i];
  add('box', [18 + i * 7, h + .15, 21], [5, .3, 6], '#b77751');
  for (const side of [-1, 1]) add('box', [18 + i * 7 + side * 2.4, h / 2, 21], [.2, h, 6], '#bb916d');
}
for (let i = 0; i < 7; i++) {
  add('sphere', [-36, .35 + i * .1, 3 - i * 2.7], [1.6, 1.6, 1.6], '#d7bc56');
  add('cylinder', [-44, .2 + (i % 3) * .3, 3 - i * 2.7], [1.8, .4 + (i % 3) * .6, 1.8], '#d0a747');
}
add('box', [12.5, 1.6, -3], [.8, 3.2, 8], '#40545c');
add('box', [-35, 2, 24], [10, 4, .5], '#bc825c');
add('box', [-40, 2, 19], [.5, 4, 10], '#bc825c');
for (let i = 0; i < 8; i++) add('box', [43 + Math.sin(i * .8) * 4, .35 + i * .5, -30 - i * 1.8], [3, .7 + i, 2], '#8196a1');

export const courseLabels: Array<{ text: string; position: Tuple3 }> = [
  { text: 'CURVED HILL', position: [-42, .025, 59] },
  { text: 'LOOP / OVERHANG', position: [-17, .025, 57] },
  { text: 'BOAT / CONCAVE CONTACTS', position: [17, .025, 62] },
  { text: 'BRANCHING BEAMS', position: [49, .025, 60] },
  { text: 'WALL TEETH / OBLIQUE CONTACT', position: [-60, .025, -20] },
  { text: 'SLOPES  10 / 20 / 35°', position: [0, .025, 9] },
  { text: 'STEEP  50 / 65°', position: [23, .025, 9] },
  { text: 'STAIRS  .18 / .30 / .48 m', position: [-17, .025, 1] },
  { text: 'ROUGH GROUND  .22 / .55 / 1.15 m', position: [-15, .025, -18] },
  { text: 'MOVING PLATFORMS', position: [0, .025, -3] },
  { text: 'SEAMS / GAPS / BALANCE', position: [24, .025, -13] },
  { text: 'PASSAGES  .8 / 1 / 1.4 / 2 m', position: [42, .025, 12] },
  { text: 'CEILINGS  1.6 / 2.1 / 2.8 m', position: [25, .025, 27] },
  { text: 'ROUND CONTACTS', position: [-40, .025, 8] },
  { text: 'WALL SLIDE / CORNERS', position: [-36, .025, 29] },
  { text: 'PUSHABLE BODIES', position: [-15, .025, 29] },
  { text: 'ROTATING / FORE-AFT', position: [9, .025, -37] },
];

// Branching balance route with ramps, narrowing arms and raised platforms.
add('box', [49, .7, 49], [1.2, .3, 15], '#4289b6');
for (const side of [-1, 1]) {
  add('box', [49 + side * 4, 1.5, 40], [.8, .3, 12], '#4289b6', [.14, side * -.65, 0]);
  add('box', [49 + side * 7.6, 2.3, 35], [3.5, .4, 3.5], '#4289b6');
}
add('box', [49, .3, 58], [2.4, .3, 4], '#4289b6', [.2, 0, 0]);
for (let i = 0; i < 8; i++) {
  add('box', [-61, 2, -29 - i * 4], [6, 4, .7], '#cf8753', [0, (i % 2 ? 1 : -1) * .55, 0]);
}
// Tall stepped tower and isolated thin walls expose corner/ledge behavior.
for (let i = 0; i < 10; i++) {
  const angle = i * Math.PI / 2;
  add('box', [42 + Math.sin(angle) * 3, (i + 1) * .35, -57 + Math.cos(angle) * 3], [3, (i + 1) * .7, 3], i % 2 ? '#ba7166' : '#d2aa7b');
}
