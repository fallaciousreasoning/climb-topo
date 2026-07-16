import { expect } from "vitest";
import type { Command } from "../commands/Command.js";
import type { Topo } from "../model/topo.js";

/** Asserts `undo(do(state))` deep-equals the original state, for any command. */
export function expectReversible(command: Command, stateBefore: Topo): void {
  const after = command.do(stateBefore);
  const reverted = command.undo(after);
  expect(reverted).toEqual(stateBefore);
}
