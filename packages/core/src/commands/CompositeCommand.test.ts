import { describe, expect, it } from "vitest";
import { createCompositeCommand } from "./CompositeCommand.js";
import { createSetClimbVisibilityCommand } from "./SetClimbVisibilityCommand.js";
import { makeClimb, makeTopo } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createCompositeCommand", () => {
  it("applies sub-commands in order and undoes them in reverse order, as one step", () => {
    const topo = makeTopo({
      climbs: [makeClimb({ id: "a", visible: true }), makeClimb({ id: "b", visible: true })],
    });

    const composite = createCompositeCommand("Hide both", [
      createSetClimbVisibilityCommand(topo, "a", false),
      createSetClimbVisibilityCommand(topo, "b", false),
    ]);

    const after = composite.do(topo);
    expect(after.climbs.map((c) => c.visible)).toEqual([false, false]);

    expectReversible(composite, topo);
  });
});
