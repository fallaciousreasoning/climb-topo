import { describe, expect, it } from "vitest";
import { createRemovePathPointCommand } from "./RemovePathPointCommand.js";
import { makeClimb, makePoint, makeTopo, withPoints } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createRemovePathPointCommand", () => {
  it("removes the point id from the climb's path", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["p1", "p2"] })] });
    topo = withPoints(topo, [makePoint({ id: "p1" }), makePoint({ id: "p2" })]);

    const command = createRemovePathPointCommand(topo, "a", 0);
    const after = command.do(topo);
    expect(after.climbs[0]?.pointIds).toEqual(["p2"]);
  });

  it("garbage-collects the point when it was the sole referencer, and undo restores it", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["solo"] })] });
    topo = withPoints(topo, [makePoint({ id: "solo", x: 0.4, y: 0.4 })]);

    const command = createRemovePathPointCommand(topo, "a", 0);
    const after = command.do(topo);
    expect(after.points["solo"]).toBeUndefined();

    expectReversible(command, topo);
    const reverted = command.undo(after);
    expect(reverted.points["solo"]).toEqual(makePoint({ id: "solo", x: 0.4, y: 0.4 }));
  });

  it("leaves a shared point untouched when another climb still references it", () => {
    let topo = makeTopo({
      climbs: [
        makeClimb({ id: "a", pointIds: ["shared"] }),
        makeClimb({ id: "b", pointIds: ["shared"] }),
      ],
    });
    topo = withPoints(topo, [makePoint({ id: "shared" })]);

    const command = createRemovePathPointCommand(topo, "a", 0);
    const after = command.do(topo);
    expect(after.points["shared"]).toBeDefined();
    expect(after.climbs.find((c) => c.id === "b")?.pointIds).toEqual(["shared"]);

    expectReversible(command, topo);
  });

  it("restores the removed point at its original index on undo", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["p1", "p2", "p3"] })] });
    topo = withPoints(topo, [
      makePoint({ id: "p1" }),
      makePoint({ id: "p2" }),
      makePoint({ id: "p3" }),
    ]);

    const command = createRemovePathPointCommand(topo, "a", 1);
    const after = command.do(topo);
    const reverted = command.undo(after);
    expect(reverted.climbs[0]?.pointIds).toEqual(["p1", "p2", "p3"]);
  });
});
