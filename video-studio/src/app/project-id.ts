// This app's host-owned project id, read truthfully from the sealed
// `project://<projectId>` origin the iframe runs on. When the bundle runs
// outside that origin (a plain browser tab during development), the fallback
// keeps engine-internal world identity stable without ever being treated as
// authority.
export function projectIdFromLocation(): string {
  if (globalThis.location === undefined) return 'video-studio'
  if (location.protocol === 'project:' && location.hostname) return location.hostname
  return 'video-studio'
}
