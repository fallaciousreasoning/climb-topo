import { describe, expect, it } from "vitest";
import { createAddPathPointCommand } from "./AddPathPointCommand.js";
import { makeClimb, makePoint, makeTopo, withPoints } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createAddPathPointCommand", () => {
  it("appends a newly-created point to the end of the climb's path", () => {
    const topo = makeTopo({ climbs: [makeClimb({ id: "a" })] });
    const command = createAddPathPointCommand(topo, "a", { kind: "new", x: 0.5, y: 0.5 });

    const after = command.do(topo);
    const climb = after.climbs.find((c) => c.id === "a")!;
    expect(climb.pointIds).toHaveLength(1);
    const pointId = climb.pointIds[0]!;
    expect(after.points[pointId]).toMatchObject({ x: 0.5, y: 0.5, type: "vertex" });
  });

  it("is reversible: undo removes the point and shrinks the registry", () => {
    const topo = makeTopo({ climbs: [makeClimb({ id: "a" })] });
    const command = createAddPathPointCommand(topo, "a", { kind: "new", x: 0.5, y: 0.5 });
    expectReversible(command, topo);
  });

  it("reuses an existing pointId instead of creating a duplicate (link-up)", () => {
    let topo = makeTopo({
      climbs: [makeClimb({ id: "a", pointIds: ["shared"] })],
    });
    topo = withPoints(topo, [makePoint({ id: "shared", x: 0.3, y: 0.3 })]);
    const before = { ...topo, climbs: [...topo.climbs, makeClimb({ id: "b" })] };

    const command = createAddPathPointCommand(before, "b", {
      kind: "existing",
      pointId: "shared",
    });

    const after = command.do(before);
    expect(Object.keys(after.points)).toEqual(["shared"]); // no new point created
    expect(after.climbs.find((c) => c.id === "b")!.pointIds).toEqual(["shared"]);
  });

  it("undo of a snapped/reused point leaves the registry untouched", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["shared"] })] });
    topo = withPoints(topo, [makePoint({ id: "shared", x: 0.3, y: 0.3 })]);
    const before = { ...topo, climbs: [...topo.climbs, makeClimb({ id: "b" })] };

    const command = createAddPathPointCommand(before, "b", {
      kind: "existing",
      pointId: "shared",
    });
    expectReversible(command, before);

    const after = command.do(before);
    const reverted = command.undo(after);
    // The shared point itself must still exist — only climb b's reference to it is removed.
    expect(reverted.points["shared"]).toBeDefined();
  });

  it("end-to-end link-up authoring: two new points then a shared reuse", () => {
    let topo = makeTopo({
      climbs: [makeClimb({ id: "a" }), makeClimb({ id: "b" })],
    });

    const addA1 = createAddPathPointCommand(topo, "a", { kind: "new", x: 0.1, y: 0.1 });
    topo = addA1.do(topo);
    const addA2 = createAddPathPointCommand(topo, "a", { kind: "new", x: 0.2, y: 0.2 });
    topo = addA2.do(topo);
    const addA3 = createAddPathPointCommand(topo, "a", { kind: "new", x: 0.3, y: 0.3 });
    topo = addA3.do(topo);

    const climbA = topo.climbs.find((c) => c.id === "a")!;
    expect(climbA.pointIds).toHaveLength(3);
    const sharedPointId = climbA.pointIds[1]!;

    const addB1 = createAddPathPointCommand(topo, "b", { kind: "new", x: 0.4, y: 0.4 });
    topo = addB1.do(topo);
    const addBShared = createAddPathPointCommand(topo, "b", {
      kind: "existing",
      pointId: sharedPointId,
    });
    topo = addBShared.do(topo);
    const addB2 = createAddPathPointCommand(topo, "b", { kind: "new", x: 0.5, y: 0.5 });
    topo = addB2.do(topo);

    const climbB = topo.climbs.find((c) => c.id === "b")!;
    expect(climbB.pointIds).toEqual([expect.any(String), sharedPointId, expect.any(String)]);
    expect(Object.keys(topo.points)).toHaveLength(5); // 3 from A + 2 new from B, shared not duplicated
  });

  it("inserts at an explicit index, splitting the line between two existing points", () => {
    let topo = makeTopo({ climbs: [makeClimb({ id: "a", pointIds: ["p1", "p3"] })] });
    topo = withPoints(topo, [
      makePoint({ id: "p1", x: 0, y: 0 }),
      makePoint({ id: "p3", x: 1, y: 1 }),
    ]);

    const command = createAddPathPointCommand(
      topo,
      "a",
      { kind: "new", x: 0.5, y: 0.5 },
      1, // insert between p1 and p3
    );
    const after = command.do(topo);
    const climb = after.climbs.find((c) => c.id === "a")!;
    expect(climb.pointIds).toHaveLength(3);
    expect(climb.pointIds[0]).toBe("p1");
    expect(climb.pointIds[2]).toBe("p3");
    const insertedId = climb.pointIds[1]!;
    expect(after.points[insertedId]).toMatchObject({ x: 0.5, y: 0.5 });

    expectReversible(command, topo);
    const reverted = command.undo(after);
    expect(reverted.climbs[0]?.pointIds).toEqual(["p1", "p3"]);
  });
});
