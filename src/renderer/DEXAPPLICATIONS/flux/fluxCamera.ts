/**
 * Flux camera: the math behind Camera layers.
 *
 * A Camera layer used to be inert: the Camera Rig panel toasted "FOV 50, DOF"
 * but the renderer never looked at camera layers. Now the topmost active
 * camera frames the shot: its position is the centre of the view, its Z
 * rotation rolls the view, its field of view zooms, layers further from it in
 * Z get smaller (perspective) and, with depth of field on, layers away from the
 * focus distance blur.
 */

export interface CameraSettings {
  /** Vertical field of view in degrees (10-120). 50 = no zoom. */
  fov: number;
  dof: boolean;
  /** Distance in Z from the camera that is in perfect focus. */
  focusDistance: number;
  /** Blur in px per unit of Z away from the focus plane (DOF strength). */
  aperture: number;
}

export const DEFAULT_CAMERA: CameraSettings = { fov: 50, dof: false, focusDistance: 0, aperture: 0.02 };

export const REFERENCE_FOV = 50;
export const MAX_DOF_BLUR = 24;

const rad = (deg: number) => (deg * Math.PI) / 180;
const clampFov = (fov: number) => Math.min(120, Math.max(10, Number.isFinite(fov) ? fov : REFERENCE_FOV));

/** Zoom relative to the 50° reference lens: narrower FOV = closer. */
export function fovZoom(fov: number): number {
  return Math.tan(rad(REFERENCE_FOV) / 2) / Math.tan(rad(clampFov(fov)) / 2);
}

/** Focal length in pixels for a frame `height` tall at this FOV. */
export function focalLength(fov: number, height: number): number {
  return height / 2 / Math.tan(rad(clampFov(fov)) / 2);
}

/**
 * Perspective scale for a layer `depth` units in front of the camera plane
 * (positive = further away). Null when the layer is at or behind the camera,
 * which means it is not drawn.
 */
export function perspectiveScale(depth: number, focal: number): number | null {
  const d = focal + depth;
  if (d <= 1) return null;
  return focal / d;
}

/** Depth-of-field blur radius in px for a layer `depth` units away. */
export function dofBlur(depth: number, cam: CameraSettings): number {
  if (!cam.dof) return 0;
  const off = Math.abs(depth - cam.focusDistance) * Math.max(0, cam.aperture);
  return Math.min(MAX_DOF_BLUR, Math.round(off * 10) / 10);
}

export interface CameraView {
  x: number; y: number; z: number; roll: number; zoom: number; focal: number; settings: CameraSettings;
}

/**
 * Apply the camera to a 2D context: (x, y) moves to the frame centre, the view
 * rolls by -roll and zooms by the FOV. Layers are drawn after this in world space.
 */
export function applyCameraView(
  ctx: Pick<CanvasRenderingContext2D, 'translate' | 'rotate' | 'scale'>,
  view: CameraView,
  width: number,
  height: number,
): void {
  ctx.translate(width / 2, height / 2);
  if (view.roll) ctx.rotate(-rad(view.roll));
  if (view.zoom !== 1) ctx.scale(view.zoom, view.zoom);
  ctx.translate(-view.x, -view.y);
}
