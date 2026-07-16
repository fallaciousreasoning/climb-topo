import { describe, expect, it } from "vitest";
import { createSetPointTypeCommand } from "./SetPointTypeCommand.js";
import { makeClimb, makePoint, makeTopo, withPoints } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createSetPointTypeCommand", () => {
  it("changes the point's type and is reversible", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["p1"] })] });
    topo = withPoints(topo, [makePoint({ id: "p1", type: "vertex" })]);

    const command = createSetPointTypeCommand(topo, "p1", "bolt");
    const after = command.do(topo);
    expect(after.points["p1"]).toMatchObject({ type: "bolt" });

    expectReversible(command, topo);
  });

  it("changing a shared point's type changes it for every climb referencing it", () => {
    let topo = makeTopo({
      climbs: [
        makeClimb({ id: "a", pointIds: ["shared"] }),
        makeClimb({ id: "b", pointIds: ["shared"] }),
      ],
    });
    topo = withPoints(topo, [makePoint({ id: "shared", type: "vertex" })]);

    const command = createSetPointTypeCommand(topo, "shared", "anchor");
    const after = command.do(topo);

    const pointForA = after.points[after.climbs.find((c) => c.id === "a")!.pointIds[0]!];
    const pointForB = after.points[after.climbs.find((c) => c.id === "b")!.pointIds[0]!];
    expect(pointForA).toEqual(pointForB);
    expect(pointForA).toMatchObject({ type: "anchor" });
  });

  it("throws when the point does not exist", () => {
    const topo = makeTopo();
    expect(() => createSetPointTypeCommand(topo, "missing", "bolt")).toThrow();
  });
});
