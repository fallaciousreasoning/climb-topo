import type { Topo } from "@climb-topo/core";

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200">
      <rect width="800" height="1200" fill="#5b5147"/>
      <rect x="40" y="60" width="720" height="1080" fill="#6b6156"/>
      <text x="400" y="640" font-size="28" fill="#c9c2b8" text-anchor="middle">placeholder crag photo</text>
    </svg>`,
  );

export function makeFixtureTopo(): Topo {
  return {
    schemaVersion: 1,
    id: "demo-topo",
    image: { backgroundUrl: PLACEHOLDER_IMAGE },
    points: {
      a1: { id: "a1", x: 0.3, y: 0.85, type: "vertex" },
      a2: { id: "a2", x: 0.32, y: 0.6, type: "vertex" },
      a3: { id: "a3", x: 0.28, y: 0.35, type: "vertex" },
      a4: { id: "a4", x: 0.35, y: 0.12, type: "vertex" },
      b1: { id: "b1", x: 0.6, y: 0.9, type: "vertex" },
      b2: { id: "b2", x: 0.55, y: 0.55, type: "bolt" },
      b3: { id: "b3", x: 0.5, y: 0.2, type: "vertex" },
    },
    climbs: [
      {
        id: "climb-a",
        name: "Sunny Corner",
        grade: { system: "yds", value: "5.9" },
        visible: true,
        reference: "SC",
        routeType: "trad",
        pointIds: ["a1", "a2", "a3", "a4"],
      },
      {
        id: "climb-b",
        name: "Steep Crimp",
        grade: { system: "yds", value: "5.12b" },
        visible: true,
        reference: "SCr",
        routeType: "sport",
        pointIds: ["b1", "b2", "b3"],
      },
      {
        id: "climb-linkup",
        name: "Sunny Corner Direct (link-up)",
        grade: { system: "yds", value: "5.11a" },
        visible: true,
        reference: "SCD",
        routeType: "mixed",
        // Shares a3/a4 with climb-a, then finishes up climb-b's last two points.
        pointIds: ["a1", "a2", "a3", "a4", "b3"],
      },
      {
        id: "climb-undrawn",
        name: "Not Yet Drawn",
        visible: true,
        pointIds: [],
      },
    ],
  };
}
