import { describe, expect, it } from "vitest";
import { createSetClimbVisibilityCommand } from "./SetClimbVisibilityCommand.js";
import { makeClimb, makeTopo } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createSetClimbVisibilityCommand", () => {
  it("toggles visibility and is reversible", () => {
    const topo = makeTopo({ climbs: [makeClimb({ id: "a", visible: true })] });
    const command = createSetClimbVisibilityCommand(topo, "a", false);

    const after = command.do(topo);
    expect(after.climbs[0]?.visible).toBe(false);

    expectReversible(command, topo);
  });

  it("does not affect pointIds — visibility is independent of whether a climb is drawn", () => {
    const topo = makeTopo({ climbs: [makeClimb({ id: "a", visible: false, pointIds: [] })] });
    const command = createSetClimbVisibilityCommand(topo, "a", true);
    const after = command.do(topo);
    expect(after.climbs[0]?.pointIds).toEqual([]);
    expect(after.climbs[0]?.visible).toBe(true);
  });
});
