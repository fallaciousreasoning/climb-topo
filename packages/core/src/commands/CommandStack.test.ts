import { describe, expect, it } from "vitest";
import { CommandStack } from "./CommandStack.js";
import { createSetClimbVisibilityCommand } from "./SetClimbVisibilityCommand.js";
import { makeClimb, makeTopo } from "../testing/fixtures.js";
import type { Topo } from "../model/topo.js";

function makeHarness(initial: Topo) {
  let state = initial;
  const stack = new CommandStack(
    () => state,
    (next) => {
      state = next;
    },
  );
  return { stack, getState: () => state };
}

describe("CommandStack", () => {
  it("applies a command and tracks canUndo/canRedo", () => {
    const topo = makeTopo({ climbs: [makeClimb({ id: "a", visible: true })] });
    const { stack, getState } = makeHarness(topo);

    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);

    stack.execute(createSetClimbVisibilityCommand(getState(), "a", false));
    expect(getState().climbs[0]?.visible).toBe(false);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
  });

  it("undo reverts and enables redo; redo reapplies", () => {
    const topo = makeTopo({ climbs: [makeClimb({ id: "a", visible: true })] });
    const { stack, getState } = makeHarness(topo);

    stack.execute(createSetClimbVisibilityCommand(getState(), "a", false));
    stack.undo();
    expect(getState().climbs[0]?.visible).toBe(true);
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(true);

    stack.redo();
    expect(getState().climbs[0]?.visible).toBe(false);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
  });

  it("executing a new command after undo clears the redo stack", () => {
    const topo = makeTopo({
      climbs: [makeClimb({ id: "a", visible: true }), makeClimb({ id: "b", visible: true })],
    });
    const { stack, getState } = makeHarness(topo);

    stack.execute(createSetClimbVisibilityCommand(getState(), "a", false));
    stack.undo();
    expect(stack.canRedo()).toBe(true);

    stack.execute(createSetClimbVisibilityCommand(getState(), "b", false));
    expect(stack.canRedo()).toBe(false);
  });

  it("undo/redo are no-ops on empty stacks", () => {
    const topo = makeTopo();
    const { stack, getState } = makeHarness(topo);

    stack.undo();
    stack.redo();
    expect(getState()).toEqual(topo);
  });

  it("canUndo/canRedo reflect the stack correctly even when read from inside setState itself", () => {
    // Regression: setState (e.g. EditorStore's notify-subscribers callback) must see the
    // stack bookkeeping already applied, not the pre-push/pre-pop state. A setState that
    // synchronously re-renders a UI reading canUndo()/canRedo() would otherwise see stale
    // values one command behind.
    const topo = makeTopo({ climbs: [makeClimb({ id: "a", visible: true })] });
    let state = topo;
    const observedDuringExecute: boolean[] = [];
    const observedDuringUndo: boolean[] = [];
    const observedDuringRedo: boolean[] = [];

    const stack = new CommandStack(
      () => state,
      (next) => {
        state = next;
        observedDuringExecute.push(stack.canUndo());
        observedDuringUndo.push(stack.canUndo());
        observedDuringRedo.push(stack.canRedo());
      },
    );

    stack.execute(createSetClimbVisibilityCommand(state, "a", false));
    expect(observedDuringExecute.at(-1)).toBe(true); // one command now on the undo stack

    stack.undo();
    expect(observedDuringUndo.at(-1)).toBe(false); // undo stack now empty
    expect(observedDuringRedo.at(-1)).toBe(true); // redo stack now has the undone command

    stack.redo();
    expect(observedDuringExecute.at(-1)).toBe(true); // undo stack has it again
  });

  it("interleaves multiple undo/redo correctly", () => {
    const topo = makeTopo({
      climbs: [makeClimb({ id: "a", visible: true }), makeClimb({ id: "b", visible: true })],
    });
    const { stack, getState } = makeHarness(topo);

    stack.execute(createSetClimbVisibilityCommand(getState(), "a", false));
    stack.execute(createSetClimbVisibilityCommand(getState(), "b", false));
    expect(getState().climbs.map((c) => c.visible)).toEqual([false, false]);

    stack.undo();
    expect(getState().climbs.map((c) => c.visible)).toEqual([false, true]);

    stack.undo();
    expect(getState().climbs.map((c) => c.visible)).toEqual([true, true]);

    stack.redo();
    stack.redo();
    expect(getState().climbs.map((c) => c.visible)).toEqual([false, false]);
  });
});
