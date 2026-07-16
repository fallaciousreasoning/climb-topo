import { describe, it } from "vitest";
import { createAddClimbCommand } from "./AddClimbCommand.js";
import { makeClimb, makeTopo } from "../testing/fixtures.js";
import { expectReversible } from "../testing/commands.js";

describe("createAddClimbCommand", () => {
  it("is reversible", () => {
    const topo = makeTopo();
    const command = createAddClimbCommand(makeClimb({ id: "a" }));
    expectReversible(command, topo);
  });
});
