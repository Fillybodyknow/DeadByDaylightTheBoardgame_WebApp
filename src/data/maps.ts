// Game boards and their Room Setup start rooms (rulebook p.5–6): each board has exactly
// six rooms marked with a skill-check die face 0–5. At setup every mini rolls one die and
// starts in the room with that face. Read from the map images in public/assets/maps.
//
// `box` is the room card on the map image as fractions of its width/height [x, y, w, h].

import mapCrops from './mapCrops.json'

export interface StartRoom {
  face: number
  name: string
  box: [number, number, number, number]
}

export interface GameMap {
  id: string
  name: string
  image: string
  /** True for the two sides of the board that ships in the box (p.3). */
  inBox: boolean
  startRooms: StartRoom[]
}

// Measured in a 2000 × 1708.5 preview of the uncropped 2360 × 2016 images. The published
// images have their top track band cropped off (scripts/build_assets.py); mapCrops.json holds
// the removed fraction of the height, so boxes are shifted into the cropped image here.
const W = 2000
const H = 1708.5
const crops: Record<string, number> = mapCrops

const rooms = (mapId: string, list: [number, string, number, number, number, number][]): StartRoom[] => {
  const c = crops[mapId] ?? 0
  const y = (py: number) => (py / H - c) / (1 - c)
  return list.map(([face, name, x1, y1, x2, y2]) => ({
    face,
    name,
    box: [x1 / W, y(y1), (x2 - x1) / W, y(y2) - y(y1)],
  }))
}

export const maps: GameMap[] = [
  {
    id: 'macmillan',
    name: 'MacMillan Estate',
    image: 'assets/maps/macmillan.webp',
    inBox: true,
    startRooms: rooms('macmillan', [
      [0, 'Backlot', 1490, 1380, 1910, 1622],
      [1, 'Foundry Upper Floor', 1025, 290, 1445, 530],
      [2, 'Mine Entrance', 553, 465, 972, 707],
      [3, 'Coal Tower Upper Floor', 1490, 423, 1910, 665],
      [4, 'Scrapyard', 552, 1140, 972, 1382],
      [5, 'Ancient Tree', 222, 833, 640, 1075],
    ]),
  },
  {
    id: 'autohaven',
    name: 'Autohaven Wreckers',
    image: 'assets/maps/autohaven.webp',
    inBox: true,
    startRooms: rooms('autohaven', [
      [0, 'Pumps', 843, 1228, 1262, 1470],
      [1, 'Scrapyard North', 238, 397, 660, 638],
      [2, 'Scrapheap', 1490, 303, 1910, 545],
      [3, 'Cottage', 1352, 1380, 1772, 1622],
      [4, 'Old Shack', 225, 1312, 645, 1553],
      [5, 'Snackbar', 552, 833, 970, 1175],
    ]),
  },
  {
    id: 'ormond',
    name: 'Ormond',
    image: 'assets/maps/ormond.webp',
    inBox: false,
    startRooms: rooms('ormond', [
      [0, 'Guest Rooms', 548, 390, 970, 633],
      [1, 'Picnic Area', 86, 510, 508, 752],
      [2, 'Ski Shack', 88, 1217, 510, 1460],
      [3, 'Entryway', 1275, 1378, 1697, 1622],
      [4, 'Wooded Area', 1320, 1065, 1742, 1308],
      [5, 'Storage', 1490, 565, 1910, 808],
    ]),
  },
  {
    id: 'crotus-prenn',
    name: 'Crotus Prenn Asylum',
    image: 'assets/maps/crotus-prenn.webp',
    inBox: false,
    startRooms: rooms('crotus-prenn', [
      [0, 'Dark Wood', 790, 268, 1212, 510],
      [1, 'Courtyard', 1490, 347, 1910, 590],
      [2, 'Carnival Entrance', 1503, 900, 1925, 1142],
      [3, 'Outer Garden', 1493, 1385, 1915, 1628],
      [4, 'Ruins', 85, 1387, 505, 1630],
      [5, 'Shack', 85, 265, 505, 510],
    ]),
  },
  {
    id: 'forsaken-boneyard',
    name: 'Forsaken Boneyard',
    image: 'assets/maps/forsaken-boneyard.webp',
    inBox: false,
    startRooms: rooms('forsaken-boneyard', [
      [0, 'South Library', 778, 1302, 1232, 1570],
      [1, 'Eyrie Balcony', 40, 240, 498, 615],
      [2, 'Sepulchre', 1508, 245, 1968, 620],
      [3, 'Fountain', 1508, 1293, 1965, 1665],
      [4, 'Graveyard', 38, 1290, 495, 1665],
      [5, 'North Library', 770, 330, 1222, 600],
    ]),
  },
  {
    id: 'withered-isle',
    name: 'Withered Isle',
    image: 'assets/maps/withered-isle.webp',
    inBox: false,
    startRooms: rooms('withered-isle', [
      [0, 'Pasture', 1505, 240, 1950, 495],
      [1, 'Mansion', 30, 1415, 475, 1670],
      [2, 'Docks', 545, 1188, 985, 1442],
      [3, 'Garden Plot', 1078, 1418, 1525, 1672],
      [4, 'South Porch', 1510, 1078, 1955, 1335],
      [5, 'Playground', 1355, 572, 1803, 825],
    ]),
  },
]

export const mapById = new Map(maps.map((m) => [m.id, m]))
