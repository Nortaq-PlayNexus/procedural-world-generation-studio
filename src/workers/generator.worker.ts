/// <reference lib="webworker" />
import { generateWorldAsync } from "../lib/worldgen";
import type { GenerationProgress, WorldConfig } from "../lib/types";

interface StartMessage {
  type: "generate";
  id: number;
  config: WorldConfig;
}

interface CancelMessage {
  type: "cancel";
  id: number;
}

let activeId = 0;
let controller: AbortController | null = null;

self.onmessage = async (event: MessageEvent<StartMessage | CancelMessage>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (message.id === activeId) controller?.abort();
    return;
  }
  if (message.type !== "generate") return;

  controller?.abort();
  controller = new AbortController();
  activeId = message.id;
  const active = controller;

  try {
    const world = await generateWorldAsync(
      message.config,
      (progress: GenerationProgress) => {
        (self as unknown as Worker).postMessage({ type: "progress", id: message.id, progress });
      },
      active.signal,
    );
    if (active.signal.aborted) return;
    // Transfer every large buffer exactly once; no copies leave the worker.
    const transfers: ArrayBuffer[] = [
      world.heights.buffer as ArrayBuffer,
      world.slope.buffer as ArrayBuffer,
      world.waterDepth.buffer as ArrayBuffer,
      world.lakeMask.buffer as ArrayBuffer,
      world.riverMask.buffer as ArrayBuffer,
      world.flowAccumulation.buffer as ArrayBuffer,
      world.flowDirection.buffer as ArrayBuffer,
      world.watershed.buffer as ArrayBuffer,
      world.drainageTarget.buffer as ArrayBuffer,
      world.temperature.buffer as ArrayBuffer,
      world.moisture.buffer as ArrayBuffer,
      world.biome.buffer as ArrayBuffer,
      world.coastDistance.buffer as ArrayBuffer,
      world.lakeSurface.buffer as ArrayBuffer,
    ];
    (self as unknown as Worker).postMessage({ type: "complete", id: message.id, world }, transfers);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      (self as unknown as Worker).postMessage({ type: "cancelled", id: message.id });
      return;
    }
    (self as unknown as Worker).postMessage({
      type: "error",
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
