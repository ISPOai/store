declare module "cadjs" {
  export function buildModel(three: unknown, source: unknown, settings?: unknown): {
    root: unknown;
    bounds: { min?: number[]; max?: number[] };
    runtime?: unknown;
    dispose?: () => void;
  };
  export function renderModel(three: unknown, model: unknown, options?: unknown): {
    camera: unknown;
    renderer: unknown;
    scene: unknown;
    resize: () => unknown;
    render: () => void;
    capturePng: () => string;
    dispose: () => void;
  };
}

declare module "cadjs/lib/render/glbMeshData.js" {
  export function buildMeshDataFromGlbBuffer(buffer: ArrayBuffer): Promise<unknown>;
}

declare module "three";

declare module "three/examples/jsm/controls/OrbitControls.js" {
  export class OrbitControls {
    constructor(camera: unknown, domElement?: HTMLElement);
    target: { clone(): unknown; copy(value: unknown): void; set(x: number, y: number, z: number): void };
    enableDamping: boolean;
    dampingFactor: number;
    screenSpacePanning: boolean;
    autoRotate: boolean;
    update(deltaSeconds?: number): boolean;
    dispose(): void;
  }
}

declare module "*orbitControls.js" {
  export function updateOrbitControls(
    controls: { update: (deltaSeconds?: number) => boolean; autoRotate?: boolean },
    timestamp: number,
    state: { orbitControlsLastTimestamp: number },
  ): boolean;
}
