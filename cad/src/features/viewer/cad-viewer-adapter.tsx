import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildModel, renderModel } from "cadjs";

import { updateOrbitControls } from "../../../vendor/text-to-cad/viewer/src/client/components/viewer/orbitControls.js";
import { loadGlbMesh } from "./cad-source";
import {
  initialViewerState,
  sourceKindForUrl,
  type ViewerPart,
  type ViewerState,
} from "./viewer-state";

type CadViewport = ReturnType<typeof renderModel>;
type CadModelRuntime = ReturnType<typeof buildModel>;

export type CadViewerHandle = {
  fit: () => void;
  reset: () => void;
  capture: () => string | null;
};

export type CadViewerAdapterProps = {
  sourceUrl: string | null;
  onStateChange?: (state: ViewerState) => void;
  onSnapshotReady?: (dataUrl: string) => void;
};

export const CadViewerAdapter = forwardRef<CadViewerHandle, CadViewerAdapterProps>(
  function CadViewerAdapter({ sourceUrl, onStateChange, onSnapshotReady }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<CadViewport | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const modelRef = useRef<CadModelRuntime | null>(null);
    const initialCameraRef = useRef<{
      position: unknown;
      up: unknown;
      target: unknown;
      zoom: number;
    } | null>(null);
    const [state, setState] = useState<ViewerState>(initialViewerState);

    const publishState = (next: ViewerState) => {
      setState(next);
      onStateChange?.(next);
    };

    useImperativeHandle(ref, () => ({
      fit() {
        viewportRef.current?.resize();
        controlsRef.current?.target.set(0, 0, 0);
        controlsRef.current?.update();
        viewportRef.current?.render();
      },
      reset() {
        const viewport = viewportRef.current;
        const controls = controlsRef.current;
        const initial = initialCameraRef.current;
        if (!viewport || !controls || !initial) return;
        const camera = viewport.camera as {
          position: { copy(value: unknown): void };
          up: { copy(value: unknown): void };
          zoom: number;
          updateProjectionMatrix(): void;
        };
        camera.position.copy(initial.position);
        camera.up.copy(initial.up);
        camera.zoom = initial.zoom;
        camera.updateProjectionMatrix();
        controls.target.copy(initial.target);
        controls.update();
        viewport.render();
      },
      capture() {
        return viewportRef.current?.capturePng() ?? null;
      },
    }), []);

    useEffect(() => {
      let disposed = false;
      const host = hostRef.current;
      const canvas = canvasRef.current;

      viewportRef.current?.dispose();
      controlsRef.current?.dispose();
      viewportRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
      initialCameraRef.current = null;

      if (!sourceUrl || !host || !canvas) {
        publishState(initialViewerState);
        return;
      }

      const kind = sourceKindForUrl(sourceUrl);
      if (kind !== "glb") {
        publishState({
          phase: "unsupported",
          message: "The embedded viewer needs the STEP-derived GLB preview.",
          parts: [],
        });
        return;
      }

      publishState({ phase: "loading", message: "Loading CAD preview…", parts: [] });

      void (async () => {
        try {
          const source = await loadGlbMesh(sourceUrl);
          if (disposed) return;

          const style = getComputedStyle(host);
          const foreground = resolveCssColor(host, style.color);
          const background = resolveCssColor(host, style.backgroundColor);
          const model = buildModel(THREE, source, {
            displayMode: "solid",
            renderPartsIndividually: true,
            theme: {
              surface: foreground,
              edge: foreground,
              background: { type: "solid", solidColor: background },
            },
          });
          const orbitState = { orbitControlsLastTimestamp: 0 };
          let controls: OrbitControls | null = null;
          const viewport = renderModel(THREE, model, {
            canvas,
            hostElement: host,
            autoStart: true,
            alpha: false,
            maxPixelRatio: 2,
            theme: {
              background: { type: "solid", solidColor: background },
              lighting: {
                ambient: { enabled: true, color: foreground, intensity: 0.7 },
                directional: {
                  enabled: true,
                  color: foreground,
                  intensity: 1.4,
                  position: { x: 160, y: -140, z: 240 },
                },
              },
            },
            beforeRender: ({ viewport: nextViewport }: { viewport: CadViewport }) => {
              if (controls) {
                updateOrbitControls(
                  controls,
                  performance.now(),
                  orbitState,
                );
                nextViewport.render();
              }
            },
          });

          controls = new OrbitControls(
            viewport.camera,
            (viewport.renderer as { domElement: HTMLElement }).domElement,
          );
          controls.enableDamping = true;
          controls.dampingFactor = 0.08;
          controls.screenSpacePanning = true;
          controls.update();

          viewportRef.current = viewport;
          controlsRef.current = controls;
          modelRef.current = model;
          const camera = viewport.camera as {
            position: { clone(): unknown };
            up: { clone(): unknown };
            zoom: number;
          };
          initialCameraRef.current = {
            position: camera.position.clone(),
            up: camera.up.clone(),
            target: controls.target.clone(),
            zoom: camera.zoom,
          };

          const records = Array.isArray((model as CadModelRuntime & { records?: unknown[] }).records)
            ? (model as CadModelRuntime & { records: unknown[] }).records
            : [];
          publishState({
            phase: "ready",
            message: "Preview ready.",
            parts: records.slice(0, 200).map(partFromRecord),
          });
          globalThis.requestAnimationFrame?.(() => {
            if (!disposed) {
              onSnapshotReady?.(viewport.capturePng());
            }
          });
        } catch (error) {
          if (disposed) return;
          publishState({
            phase: "error",
            message: error instanceof Error ? error.message : "The preview could not be rendered.",
            parts: [],
          });
        }
      })();

      return () => {
        disposed = true;
        controlsRef.current?.dispose();
        viewportRef.current?.dispose();
        controlsRef.current = null;
        viewportRef.current = null;
        modelRef.current = null;
      };
    }, [onSnapshotReady, sourceUrl]);

    return (
      <div
        ref={hostRef}
        data-viewer-phase={state.phase}
        className="relative size-full min-h-[260px] overflow-hidden bg-background"
      >
        <canvas ref={canvasRef} className="block size-full" />
      </div>
    );
  },
);

function resolveCssColor(host: HTMLElement, fallback: string) {
  const probe = document.createElement("span");
  probe.style.color = fallback;
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  host.appendChild(probe);
  const color = getComputedStyle(probe).color || fallback;
  probe.remove();
  return color;
}

function partFromRecord(record: unknown, index: number): ViewerPart {
  const bag = record && typeof record === "object" ? record as Record<string, unknown> : {};
  const id = String(bag.id ?? bag.partId ?? bag.occurrenceId ?? `part-${index + 1}`);
  const label = String(bag.name ?? bag.label ?? bag.partName ?? `Part ${index + 1}`);
  return { id, label };
}
