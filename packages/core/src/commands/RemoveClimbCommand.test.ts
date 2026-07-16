import { describe, expect, it } from "vitest";
import { createRemoveClimbCommand } from "./RemoveClimbCommand.js";
import { makeClimb, makePoint, makeTopo, withPoints } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createRemoveClimbCommand", () => {
  it("removes the climb and garbage-collects its solely-owned points, reversibly", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["p1", "p2"] })] });
    topo = withPoints(topo, [makePoint({ id: "p1" }), makePoint({ id: "p2" })]);

    const command = createRemoveClimbCommand(topo, "a");
    const after = command.do(topo);
    expect(after.climbs).toHaveLength(0);
    expect(after.points).toEqual({});

    expectReversible(command, topo);
  });

  it("keeps points still referenced by another climb after removal", () => {
    let topo = makeTopo({
      climbs: [
        makeClimb({ id: "a", pointIds: ["shared", "own-a"] }),
        makeClimb({ id: "b", pointIds: ["shared"] }),
      ],
    });
    topo = withPoints(topo, [makePoint({ id: "shared" }), makePoint({ id: "own-a" })]);

    const command = createRemoveClimbCommand(topo, "a");
    const after = command.do(topo);
    expect(after.points["shared"]).toBeDefined();
    expect(after.points["own-a"]).toBeUndefined();
    expect(after.climbs.map((c) => c.id)).toEqual(["b"]);

    expectReversible(command, topo);
  });

  it("restores the climb at its original position on undo", () => {
    const topo = makeTopo({
      climbs: [makeClimb({ id: "a" }), makeClimb({ id: "b" }), makeClimb({ id: "c" })],
    });

    const command = createRemoveClimbCommand(topo, "b");
    const after = command.do(topo);
    const reverted = command.undo(after);
    expect(reverted.climbs.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});
