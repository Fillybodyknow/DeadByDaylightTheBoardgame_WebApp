// Board graphs: rooms, the props printed in each room and the paths between them, read
// from the map images in public/assets/maps. Coordinates are measured on a 2000-wide preview
// of the published (top-cropped) image — 2000 × 1458, or 2000 × 1442 for Ormond — and stored
// as fractions.
//
// A path icon with lines to three rooms (a fork) is one PathDef per pair of rooms, the later
// ones carrying `token`: the first pair's id, which holds the icon's wall, pallet or trap.

import type { BoardDef, PathDef, PathKind, PropCategory, RoomDef } from './types'

const W = 2000
const H = 1458

const O: PropCategory = 'objective'
const S: PropCategory = 'survival'
const A: PropCategory = 'altruism'
const B: PropCategory = 'boldness'

function room(id: string, name: string, startFace: number | null, props: PropCategory[], x1: number, y1: number, x2: number, y2: number, h = H): RoomDef {
  return { id, name, startFace, props, box: [x1 / W, y1 / h, (x2 - x1) / W, (y2 - y1) / h] }
}

function path(id: string, a: string, b: string, kind: PathKind, x: number, y: number, wall = false, h = H): PathDef {
  return { id, a, b, kind, wall, at: [x / W, y / h] }
}

/** A fork: one icon joining three rooms, as three pairs sharing the first pair's icon. */
function fork(id: string, [a, b, c]: [string, string, string], kind: PathKind, x: number, y: number, wall = false, h = H): PathDef[] {
  return [
    path(id, a, b, kind, x, y, wall, h),
    { ...path(`${id}b`, a, c, kind, x, y, wall, h), token: id },
    { ...path(`${id}c`, b, c, kind, x, y, wall, h), token: id },
  ]
}

export const macmillan: BoardDef = {
  id: 'macmillan',
  name: 'MacMillan Estate',
  image: 'assets/maps/macmillan.webp',
  aspect: 2360 / 1721,
  rooms: [
    room('mine-depths', 'Mine Depths', null, [O, B, A], 90, 42, 510, 282),
    room('mine-entrance', 'Mine Entrance', 2, [O, B, A, A], 553, 217, 972, 457),
    room('foundry-upper', 'Foundry Upper Floor', 1, [O, B, S, A], 1025, 42, 1445, 282),
    room('coal-tower-upper', 'Coal Tower Upper Floor', 3, [O, S, S, A], 1490, 175, 1910, 415),
    room('ancient-tree', 'Ancient Tree', 5, [O, B, A, A], 222, 585, 640, 825),
    room('foundry-ground', 'Foundry Ground Floor', null, [O, B, S, A, A], 895, 498, 1312, 840),
    room('coal-tower-ground', 'Coal Tower Ground Floor', null, [B, S, S, A], 1360, 630, 1778, 870),
    room('scrapyard', 'Scrapyard', 4, [O, B, S, S], 552, 892, 972, 1132),
    room('foundry-basement', 'Foundry Basement', null, [O, B, S, A], 1025, 1010, 1445, 1250),
    room('shack', 'Shack', null, [O, B, S, S], 90, 1132, 508, 1370),
    room('backlot', 'Backlot', 0, [O, B, S, A], 1490, 1132, 1910, 1372),
  ],
  paths: [
    path('p1', 'mine-depths', 'mine-entrance', 'crouch', 635, 120),
    path('p2', 'foundry-upper', 'mine-entrance', 'vault', 850, 85),
    path('p3', 'foundry-upper', 'coal-tower-upper', 'sprint', 1710, 85),
    path('p4', 'mine-depths', 'shack', 'sneak', 138, 715, true),
    path('p5', 'mine-depths', 'ancient-tree', 'sprint', 262, 430),
    path('p6', 'mine-entrance', 'ancient-tree', 'sneak', 428, 430),
    path('p7', 'mine-entrance', 'foundry-ground', 'sprint', 1110, 388),
    path('p8', 'foundry-upper', 'foundry-ground', 'sneak', 1268, 388),
    path('p9', 'foundry-upper', 'coal-tower-ground', 'crouch', 1600, 525),
    path('p10', 'coal-tower-upper', 'coal-tower-ground', 'sneak', 1757, 525),
    path('p11', 'coal-tower-ground', 'foundry-ground', 'vault', 1452, 525, true),
    path('p12', 'coal-tower-upper', 'backlot', 'vault', 1865, 780),
    path('p13', 'foundry-ground', 'scrapyard', 'crouch', 805, 570),
    path('p14', 'ancient-tree', 'scrapyard', 'sneak', 728, 778),
    path('p15', 'ancient-tree', 'shack', 'crouch', 262, 990),
    path('p16', 'scrapyard', 'shack', 'sprint', 428, 990),
    path('p17', 'foundry-ground', 'foundry-basement', 'sneak', 1088, 918),
    path('p18', 'foundry-ground', 'backlot', 'sprint', 1262, 918),
    path('p19', 'coal-tower-ground', 'backlot', 'crouch', 1755, 1005),
    path('p20', 'foundry-basement', 'backlot', 'sprint', 1550, 1045),
    path('p21', 'shack', 'foundry-basement', 'sprint', 760, 1230, true),
    path('p22', 'shack', 'backlot', 'vault', 995, 1320, true),
  ],
}

export const autohaven: BoardDef = {
  id: 'autohaven',
  name: 'Autohaven Wreckers',
  image: 'assets/maps/autohaven.webp',
  aspect: 2360 / 1721,
  rooms: [
    room('labyrinth', 'Labyrinth', null, [O, B, A, A], 883, 28, 1303, 268),
    room('scrapheap', 'Scrapheap', 2, [O, B, S, A], 1492, 55, 1910, 295),
    room('scrapyard-north', 'Scrapyard North', 1, [O, B, S, A], 240, 148, 660, 388),
    room('main-garage', 'Main Garage', null, [O, B, S, S, A], 1032, 438, 1450, 678),
    room('scrapyard-south', 'Scrapyard South', null, [O, B, S, A], 88, 585, 506, 825),
    room('snackbar', 'Snackbar', 5, [O, B, S, S, A, A], 552, 585, 970, 925),
    room('barn', 'Barn', null, [O, B, S, S, A], 1492, 758, 1910, 998),
    room('pumps', 'Pumps', 0, [O, B, S, A], 845, 980, 1262, 1220),
    room('old-shack', 'Old Shack', 4, [O, B, S, A], 228, 1063, 645, 1303),
    room('cottage', 'Cottage', 3, [O, B, S, A], 1353, 1133, 1772, 1373),
  ],
  paths: [
    path('p1', 'labyrinth', 'scrapyard-south', 'sprint', 160, 78, true),
    path('p2', 'scrapyard-north', 'labyrinth', 'vault', 770, 195),
    ...fork('p3', ['scrapyard-north', 'labyrinth', 'snackbar'], 'sprint', 770, 370),
    path('p4', 'labyrinth', 'scrapheap', 'crouch', 1398, 82),
    path('p5', 'scrapheap', 'main-garage', 'sneak', 1398, 262, true),
    path('p6', 'labyrinth', 'main-garage', 'sneak', 1085, 348),
    path('p7', 'scrapyard-north', 'scrapyard-south', 'sneak', 290, 485),
    path('p8', 'scrapyard-south', 'snackbar', 'sneak', 460, 485, true),
    path('p9', 'snackbar', 'main-garage', 'crouch', 908, 475),
    path('p10', 'main-garage', 'barn', 'crouch', 1612, 535),
    path('p11', 'scrapheap', 'barn', 'sneak', 1803, 535),
    path('p12', 'main-garage', 'pumps', 'crouch', 1135, 825, true),
    path('p13', 'scrapyard-south', 'old-shack', 'crouch', 280, 948),
    path('p14', 'old-shack', 'snackbar', 'vault', 433, 948),
    path('p15', 'snackbar', 'pumps', 'crouch', 745, 1030),
    path('p16', 'pumps', 'barn', 'vault', 1383, 1000),
    path('p17', 'old-shack', 'pumps', 'sneak', 745, 1180),
    ...fork('p18', ['scrapyard-south', 'pumps', 'cottage'], 'sprint', 1055, 1325),
    path('p19', 'cottage', 'barn', 'sneak', 1862, 1265),
  ],
}

/** Ormond's published image is a little shorter: 2000 × 1442 at the same width. */
const OH = 1442.36

export const ormond: BoardDef = {
  id: 'ormond',
  name: 'Ormond',
  image: 'assets/maps/ormond.webp',
  aspect: 2360 / 1702,
  rooms: [
    room('balcony', 'Balcony', null, [O, B, A, A], 1155, 28, 1575, 270, OH),
    room('guest-rooms', 'Guest Rooms', 0, [O, B, S, A], 550, 123, 970, 365, OH),
    room('picnic-area', 'Picnic Area', 1, [O, B, S], 88, 243, 508, 488, OH),
    room('storage', 'Storage', 5, [O, B, S, S], 1492, 298, 1910, 540, OH),
    room('chalet', 'Chalet', null, [O, B, S, S, A, A], 425, 525, 845, 868, OH),
    room('rentals', 'Rentals', null, [O, B, S, A, A], 1012, 497, 1432, 740, OH),
    room('wooded-area', 'Wooded Area', 4, [O, B, S, A], 1322, 798, 1742, 1040, OH),
    room('ski-shack', 'Ski Shack', 2, [O, B, S, A], 90, 950, 510, 1192, OH),
    room('basement', 'Basement', null, [O, B, S, A], 680, 1040, 1100, 1282, OH),
    room('entryway', 'Entryway', 3, [O, B, S, S, A, A], 1277, 1112, 1697, 1355, OH),
  ],
  paths: [
    path('p1', 'balcony', 'picnic-area', 'crouch', 160, 65, true, OH),
    path('p2', 'guest-rooms', 'picnic-area', 'sprint', 330, 155, false, OH),
    path('p3', 'guest-rooms', 'balcony', 'sprint', 1058, 165, false, OH),
    path('p4', 'balcony', 'storage', 'vault', 1730, 110, false, OH),
    path('p5', 'balcony', 'rentals', 'vault', 1195, 368, false, OH),
    path('p6', 'storage', 'rentals', 'sprint', 1350, 365, false, OH),
    path('p7', 'guest-rooms', 'chalet', 'sneak', 630, 440, true, OH),
    path('p8', 'chalet', 'balcony', 'sneak', 790, 440, false, OH),
    path('p9', 'chalet', 'picnic-area', 'vault', 300, 610, false, OH),
    path('p10', 'picnic-area', 'ski-shack', 'sneak', 160, 705, false, OH),
    path('p11', 'chalet', 'rentals', 'sneak', 925, 617, false, OH),
    path('p12', 'rentals', 'wooded-area', 'crouch', 1548, 690, true, OH),
    path('p13', 'storage', 'wooded-area', 'sneak', 1698, 632, false, OH),
    path('p14', 'storage', 'entryway', 'sprint', 1865, 790, false, OH),
    path('p15', 'chalet', 'ski-shack', 'sprint', 300, 828, false, OH),
    path('p16', 'chalet', 'rentals', 'sprint', 1055, 845, false, OH),
    path('p17', 'chalet', 'basement', 'crouch', 752, 955, false, OH),
    path('p18', 'rentals', 'entryway', 'sneak', 1208, 940, false, OH),
    path('p19', 'ski-shack', 'basement', 'sneak', 590, 1105, true, OH),
    path('p20', 'basement', 'entryway', 'crouch', 1185, 1228, false, OH),
    path('p21', 'entryway', 'wooded-area', 'crouch', 1788, 1140, false, OH),
    path('p22', 'ski-shack', 'entryway', 'sprint', 160, 1310, false, OH),
  ],
}

export const crotusPrenn: BoardDef = {
  id: 'crotus-prenn',
  name: 'Crotus Prenn Asylum',
  image: 'assets/maps/crotus-prenn.webp',
  aspect: 2360 / 1721,
  rooms: [
    room('shack', 'Shack', 5, [O, B, B, S, A], 88, 15, 505, 258),
    room('dark-wood', 'Dark Wood', 0, [O, B, S, A], 792, 17, 1212, 260),
    room('courtyard', 'Courtyard', 1, [O, B, S, A, A], 1493, 97, 1912, 338),
    room('treatment-hall', 'Treatment Hall', null, [O, B, S, A], 332, 392, 752, 635),
    room('hallway', 'Hallway', null, [S, S, A, A], 942, 422, 1362, 665),
    room('carnival-entrance', 'Carnival Entrance', 2, [O, O, B, S, A], 1505, 650, 1925, 892),
    room('greenhouse', 'Greenhouse', null, [O, B, S, A], 297, 818, 717, 1060),
    room('receiving-desk', 'Receiving Desk', null, [O, B, S, A], 922, 862, 1342, 1105),
    room('ruins', 'Ruins', 4, [O, B, S, S, A], 88, 1140, 505, 1382),
    room('outer-garden', 'Outer Garden', 3, [O, B, S, A], 1495, 1138, 1915, 1380),
  ],
  paths: [
    path('p1', 'shack', 'dark-wood', 'sneak', 643, 145),
    path('p2', 'dark-wood', 'courtyard', 'sneak', 1383, 145),
    path('p3', 'dark-wood', 'treatment-hall', 'crouch', 643, 292),
    path('p4', 'dark-wood', 'hallway', 'crouch', 1293, 318, true),
    path('p5', 'shack', 'treatment-hall', 'crouch', 230, 447, true),
    path('p6', 'shack', 'ruins', 'crouch', 128, 715),
    path('p7', 'treatment-hall', 'hallway', 'sprint', 843, 530),
    path('p8', 'hallway', 'courtyard', 'vault', 1475, 470),
    path('p9', 'courtyard', 'carnival-entrance', 'crouch', 1835, 500),
    path('p10', 'treatment-hall', 'greenhouse', 'sprint', 527, 725),
    path('p11', 'hallway', 'receiving-desk', 'sprint', 1133, 762),
    path('p12', 'receiving-desk', 'courtyard', 'vault', 1310, 765),
    path('p13', 'greenhouse', 'ruins', 'sneak', 210, 1000, true),
    path('p14', 'greenhouse', 'receiving-desk', 'sprint', 818, 955),
    path('p15', 'receiving-desk', 'carnival-entrance', 'sneak', 1425, 952),
    ...fork('p16', ['receiving-desk', 'carnival-entrance', 'outer-garden'], 'sprint', 1715, 1025, true),
    path('p17', 'greenhouse', 'outer-garden', 'crouch', 668, 1175),
    path('p18', 'ruins', 'outer-garden', 'sneak', 998, 1330),
  ],
}

export const boards: Record<string, BoardDef> = { macmillan, autohaven, ormond, 'crotus-prenn': crotusPrenn }
