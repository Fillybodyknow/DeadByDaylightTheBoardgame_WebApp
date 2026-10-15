// Board graphs: rooms, the props printed in each room and the paths between them, read
// from the map images in public/assets/maps. Coordinates are measured on a 2000 × 1458
// preview of the published (top-cropped) image and stored as fractions.

import type { BoardDef, PathDef, PathKind, PropCategory, RoomDef } from './types'

const W = 2000
const H = 1458

const O: PropCategory = 'objective'
const S: PropCategory = 'survival'
const A: PropCategory = 'altruism'
const B: PropCategory = 'boldness'

function room(id: string, name: string, startFace: number | null, props: PropCategory[], x1: number, y1: number, x2: number, y2: number): RoomDef {
  return { id, name, startFace, props, box: [x1 / W, y1 / H, (x2 - x1) / W, (y2 - y1) / H] }
}

function path(id: string, a: string, b: string, kind: PathKind, x: number, y: number, wall = false): PathDef {
  return { id, a, b, kind, wall, at: [x / W, y / H] }
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

export const boards: Record<string, BoardDef> = { macmillan }
