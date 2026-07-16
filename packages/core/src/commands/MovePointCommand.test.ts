import { describe, expect, it } from "vitest";
import { createMovePointCommand } from "./MovePointCommand.js";
import { makeClimb, makePoint, makeTopo, withPoints } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createMovePointCommand", () => {
  it("moves the point and is reversible", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["p1"] })] });
    topo = withPoints(topo, [makePoint({ id: "p1", x: 0.1, y: 0.1 })]);

    const command = createMovePointCommand(topo, "p1", 0.9, 0.9);
    const after = command.do(topo);
    expect(after.points["p1"]).toMatchObject({ x: 0.9, y: 0.9 });

    expectReversible(command, topo);
  });

  it("moving a shared point moves it for every climb referencing it (link-up regression)", () => {
    let topo = makeTopo({
      climbs: [
        makeClimb({ id: "a", pointIds: ["shared"] }),
        makeClimb({ id: "b", pointIds: ["shared"] }),
      ],
    });
    topo = withPoints(topo, [makePoint({ id: "shared", x: 0.2, y: 0.2 })]);

    const command = createMovePointCommand(topo, "shared", 0.7, 0.8);
    const after = command.do(topo);

    // Both climbs reference the same point id, so a single command updates both at once.
    const pointForA = after.points[after.climbs.find((c) => c.id === "a")!.pointIds[0]!];
    const pointForB = after.points[after.climbs.find((c) => c.id === "b")!.pointIds[0]!];
    expect(pointForA).toEqual(pointForB);
    expect(pointForA).toMatchObject({ x: 0.7, y: 0.8 });
  });

  it("throws when the point does not exist", () => {
    const topo = makeTopo();
    expect(() => createMovePointCommand(topo, "missing", 0, 0)).toThrow();
  });
});
