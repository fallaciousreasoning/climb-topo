import type { Vec2 } from "./spline.js";

export type { Vec2 };

export interface ImageDimensions {
  width: number;
  height: number;
}

export function toPixel(normalized: Vec2, image: ImageDimensions): Vec2 {
  return { x: normalized.x * image.width, y: normalized.y * image.height };
}

export function toNormalized(pixel: Vec2, image: ImageDimensions): Vec2 {
  return { x: pixel.x / image.width, y: pixel.y / image.height };
}

/**
 * Converts a pointer event's client coordinates into normalized [0,1] stage space, via the
 * svg element's rendered bounding box — deliberately independent of the svg's internal
 * viewBox units, to keep interaction math and rendering math from being conflated.
 */
export function clientPointToNormalized(
  svgRoot: SVGSVGElement,
  clientX: number,
  clientY: number,
): Vec2 {
  const rect = svgRoot.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}
