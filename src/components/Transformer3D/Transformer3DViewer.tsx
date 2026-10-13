import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  Info,
  Maximize2,
  Minimize2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";

import type { AlertItem, Prediction, SensorReading } from "@/lib/types";
import { createTransformerScene, type TransformerSceneHandle } from "./createTransformerScene";
import { evaluateComponentDiagnostics } from "./transformerMapping";
import type { CameraPreset, ComponentDiagnostic, ComponentVisualState, TransformerComponentId } from "./types";

export interface Transformer3DViewerRef {
  focusComponent: (componentId: TransformerComponentId) => void;
  resetView: () => void;
}

interface Transformer3DViewerProps {
  reading: SensorReading | null | undefined;
  prediction: Prediction | null | undefined;
  alerts: AlertItem[];
  isSimulated?: boolean;
  onSelectComponent?: (diagnostic: ComponentDiagnostic) => void;
}

const CAMERA_PRESETS: CameraPreset[] = [
  { id: "overview", label: "Overview", position: [6.5, 4.5, 7.5], target: [0, 1.8, 0] },
  { id: "hv_bushings", label: "400kV Bushings", position: [0, 5.2, 3.8], target: [0, 3.2, 0.4] },
  { id: "conservator", label: "Conservator & Breather", position: [-1.2, 4.2, -3.2], target: [0, 3.0, -0.8] },
  { id: "radiators", label: "Radiator Banks", position: [5.2, 2.5, 2.0], target: [2.3, 1.4, 0] },
  { id: "oltc", label: "OLTC Tap Changer", position: [3.2, 2.2, 3.2], target: [1.4, 1.2, 1.2] },
  { id: "buchholz", label: "Buchholz Relay", position: [-1.8, 3.4, -0.2], target: [-0.6, 2.8, -0.8] },
];

export const Transformer3DViewer = React.forwardRef<Transformer3DViewerRef, Transformer3DViewerProps>(
  function Transformer3DViewer({ reading, prediction, alerts, isSimulated = true, onSelectComponent }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneHandleRef = useRef<TransformerSceneHandle | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);

    const [selectedComponentId, setSelectedComponentId] = useState<TransformerComponentId | null>("main_tank");
    const [hoveredComponentId, setHoveredComponentId] = useState<TransformerComponentId | null>(null);
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [activePreset, setActivePreset] = useState<string>("overview");

    // Compute diagnostics
    const diagnostics = useMemo(() => {
      return evaluateComponentDiagnostics(reading, prediction, alerts, isSimulated);
    }, [reading, prediction, alerts, isSimulated]);

    // Component counts for legend
    const statusCounts = useMemo(() => {
      const counts: Record<ComponentVisualState, number> = {
        Healthy: 0,
        Warning: 0,
        Critical: 0,
        Unknown: 0,
      };
      Object.values(diagnostics).forEach((d) => {
        counts[d.state]++;
      });
      return counts;
    }, [diagnostics]);

    // Smoothly fly camera to preset or component
    const moveCamera = (pos: [number, number, number], target: [number, number, number], durationMs = 800) => {
      if (!sceneHandleRef.current || !controlsRef.current) return;
      const cam = sceneHandleRef.current.camera;
      const ctrl = controlsRef.current;

      const startPos = cam.position.clone();
      const endPos = new THREE.Vector3(...pos);
      const startTarget = ctrl.target.clone();
      const endTarget = new THREE.Vector3(...target);

      const startTime = performance.now();

      function step(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);

        cam.position.lerpVectors(startPos, endPos, ease);
        ctrl.target.lerpVectors(startTarget, endTarget, ease);
        ctrl.update();

        if (progress < 1) {
          requestAnimationFrame(step);
        }
      }

      requestAnimationFrame(step);
    };

    const handleSelectComponent = (id: TransformerComponentId) => {
      setSelectedComponentId(id);
      const diag = diagnostics[id];
      if (diag && onSelectComponent) {
        onSelectComponent(diag);
      }

      // Map component to focused camera framing
      const targetCoords: Record<TransformerComponentId, { pos: [number, number, number]; tgt: [number, number, number] }> = {
        main_tank: { pos: [5.2, 3.5, 5.2], tgt: [0, 1.4, 0] },
        conservator_tank: { pos: [-0.8, 4.2, -3.2], tgt: [0, 3.2, -0.8] },
        hv_bushings: { pos: [0, 5.0, 3.5], tgt: [0, 3.4, 0.4] },
        lv_bushings: { pos: [0, 4.2, -2.4], tgt: [0, 2.8, -0.2] },
        radiator_cooling: { pos: [4.8, 2.4, 1.8], tgt: [2.3, 1.3, 0] },
        cooling_fans: { pos: [4.2, 1.2, 1.5], tgt: [2.3, 0.5, 0] },
        cooling_pumps: { pos: [3.8, 1.2, -1.2], tgt: [2.0, 0.6, -0.6] },
        oil_piping: { pos: [-2.2, 3.5, -2.0], tgt: [-0.6, 2.7, -0.8] },
        buchholz_relay: { pos: [-1.6, 3.4, -0.2], tgt: [-0.6, 2.85, -0.85] },
        tap_changer: { pos: [3.2, 2.2, 3.0], tgt: [1.4, 1.3, 1.2] },
        explosion_vent: { pos: [-3.2, 3.8, 2.0], tgt: [-1.6, 2.9, 0.6] },
        marshalling_kiosk: { pos: [-3.0, 1.8, 3.2], tgt: [-1.4, 0.8, 1.35] },
      };

      if (targetCoords[id]) {
        moveCamera(targetCoords[id].pos, targetCoords[id].tgt);
      }
    };

    const handleResetView = () => {
      setActivePreset("overview");
      moveCamera([6.5, 4.5, 7.5], [0, 1.8, 0]);
    };

    useImperativeHandle(ref, () => ({
      focusComponent: (id: TransformerComponentId) => {
        handleSelectComponent(id);
      },
      resetView: () => {
        handleResetView();
      },
    }));

    // Initialize Three.js scene
    useEffect(() => {
      if (!containerRef.current) return;

      const handle = createTransformerScene(
        containerRef.current,
        (clickedId) => {
          handleSelectComponent(clickedId);
        },
        (hoveredId) => {
          setHoveredComponentId(hoveredId);
        },
      );
      sceneHandleRef.current = handle;

      // Orbit controls
      const controls = new OrbitControls(handle.camera, handle.renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.target.set(0, 1.8, 0);
      controls.maxPolarAngle = Math.PI / 2 + 0.05; // Don't flip below ground
      controls.minDistance = 2.5;
      controls.maxDistance = 18;
      controlsRef.current = controls;

      // Update initial states
      const stateMap: Record<TransformerComponentId, ComponentVisualState> = {} as any;
      Object.entries(diagnostics).forEach(([k, v]) => {
        stateMap[k as TransformerComponentId] = v.state;
      });
      handle.updateStates(stateMap, selectedComponentId);

      // Handle ResizeObserver
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            handle.camera.aspect = width / height;
            handle.camera.updateProjectionMatrix();
            handle.renderer.setSize(width, height);
          }
        }
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        controls.dispose();
        handle.dispose();
        sceneHandleRef.current = null;
        controlsRef.current = null;
      };
    }, []);

    // Sync visual states on data update
    useEffect(() => {
      if (!sceneHandleRef.current) return;
      const stateMap: Record<TransformerComponentId, ComponentVisualState> = {} as any;
      Object.entries(diagnostics).forEach(([k, v]) => {
        stateMap[k as TransformerComponentId] = v.state;
      });
      sceneHandleRef.current.updateStates(stateMap, selectedComponentId);
    }, [diagnostics, selectedComponentId]);

    const activeDiagnostic = selectedComponentId ? diagnostics[selectedComponentId] : null;

    const getStatusBadgeClass = (state: ComponentVisualState) => {
      switch (state) {
        case "Critical":
          return "bg-critical/15 text-critical border-critical/40";
        case "Warning":
          return "bg-warning/15 text-warning border-warning/40";
        case "Healthy":
          return "bg-healthy/15 text-healthy border-healthy/40";
        case "Unknown":
        default:
          return "bg-muted text-muted-foreground border-border";
      }
    };

    return (
      <div className={`panel overflow-hidden transition-all duration-300 flex flex-col ${isExpanded ? "fixed inset-3 z-50 shadow-2xl bg-card" : "w-full"}`}>
        {/* Top Control Bar */}
        <div className="border-b border-border p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 bg-card/80 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold tracking-tight">3D Digital Twin — EHV 400/220kV Transformer</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/5">
                  T1-400kV (315 MVA)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Interactive real-time sub-assembly telemetry & component-level fault visualization
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Viewpoint presets */}
            <div className="hidden md:flex items-center gap-1 bg-background/50 border border-border rounded-lg p-1 text-xs">
              <Camera className="h-3.5 w-3.5 text-muted-foreground ml-1 mr-0.5" />
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setActivePreset(preset.id);
                    moveCamera(preset.position, preset.target);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    activePreset === preset.id
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Reset View Button */}
            <button
              onClick={handleResetView}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Reset to default overview angle"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Camera</span>
            </button>

            {/* Expand / Minimize Toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isExpanded ? "Collapse" : "Full View"}</span>
            </button>
          </div>
        </div>

        {/* Status Legend Bar */}
        <div className="border-b border-border/50 px-4 py-2 bg-background/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-mono uppercase text-muted-foreground">Component Health:</span>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-healthy font-mono text-[11px]">
                <span className="h-2 w-2 rounded-full bg-healthy animate-pulse" />
                Healthy ({statusCounts.Healthy})
              </span>
              <span className="inline-flex items-center gap-1.5 text-warning font-mono text-[11px]">
                <span className="h-2 w-2 rounded-full bg-warning animate-pulse" />
                Warning ({statusCounts.Warning})
              </span>
              <span className="inline-flex items-center gap-1.5 text-critical font-mono text-[11px]">
                <span className="h-2 w-2 rounded-full bg-critical animate-pulse" />
                Critical ({statusCounts.Critical})
              </span>
              {statusCounts.Unknown > 0 && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                  Unknown ({statusCounts.Unknown})
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
            <span>Click any 3D component to inspect telemetry</span>
            {hoveredComponentId && (
              <span className="text-primary font-semibold border-l border-border pl-2">
                Hovering: {diagnostics[hoveredComponentId]?.label}
              </span>
            )}
          </div>
        </div>

        {/* Main View Area: 3D Canvas + Component Detail Drawer */}
        <div className="relative flex-1 grid lg:grid-cols-12 min-h-[460px]" style={{ height: isExpanded ? "calc(100vh - 120px)" : "500px" }}>
          {/* 3D Canvas */}
          <div className="relative lg:col-span-8 xl:col-span-8 w-full h-full bg-[#131826] overflow-hidden">
            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* In-canvas overlay controls */}
            <div className="absolute bottom-3 left-3 bg-card/85 backdrop-blur border border-border rounded-md px-3 py-1.5 text-[11px] font-mono text-muted-foreground shadow-lg flex items-center gap-3">
              <span>Left Click + Drag: Rotate</span>
              <span className="text-border">|</span>
              <span>Scroll: Zoom</span>
              <span className="text-border">|</span>
              <span>Right Click + Drag: Pan</span>
            </div>
          </div>

          {/* Component Diagnostics Sidebar */}
          <div className="lg:col-span-4 xl:col-span-4 border-t lg:border-t-0 lg:border-l border-border bg-card/60 p-4 overflow-y-auto space-y-4">
            {activeDiagnostic ? (
              <div className="space-y-4">
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {activeDiagnostic.subsystem}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${getStatusBadgeClass(
                        activeDiagnostic.state,
                      )}`}
                    >
                      {activeDiagnostic.state}
                    </span>
                  </div>
                  <h4 className="text-base font-semibold text-foreground">{activeDiagnostic.label}</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {activeDiagnostic.description}
                  </p>
                </div>

                {/* Live Telemetry Table */}
                <div className="border border-border/80 rounded-lg p-3 bg-background/50 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-primary" />
                      Live Component Telemetry
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {isSimulated ? "Simulated Stream" : "Substation RTU Live"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activeDiagnostic.primaryTelemetry.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground">{t.name}</span>
                        <div className="text-right">
                          <span className="font-mono font-semibold text-foreground">
                            {t.value} {t.unit}
                          </span>
                          {(t.thresholdWarn || t.thresholdCrit) && (
                            <div className="text-[9px] text-muted-foreground font-mono">
                              Limit: {t.thresholdCrit ?? t.thresholdWarn}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ML Prediction & Fault Risk Context */}
                {activeDiagnostic.mlRiskProbability !== undefined && (
                  <div className="border border-border/80 rounded-lg p-3 bg-background/50 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-foreground">
                        <Cpu className="h-3.5 w-3.5 text-primary" />
                        ML Risk & Health Diagnosis
                      </span>
                      <span className="font-mono text-xs font-bold text-primary">
                        {(activeDiagnostic.mlRiskProbability * 100).toFixed(1)}% Failure Prob
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {activeDiagnostic.mlRecommendation ??
                        "Random Forest classifier indicates equipment operational envelopes remain within nominal IEC standards."}
                    </p>
                  </div>
                )}

                {/* Active Alerts for this component */}
                {activeDiagnostic.relatedAlerts.length > 0 && (
                  <div className="border border-warning/40 rounded-lg p-3 bg-warning/5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                      <AlertTriangle className="h-4 w-4" />
                      Active Associated Alerts ({activeDiagnostic.relatedAlerts.length})
                    </div>
                    <div className="space-y-1.5">
                      {activeDiagnostic.relatedAlerts.map((a) => (
                        <div key={a.id} className="text-[11px] p-2 rounded bg-background/60 border border-warning/30 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{a.parameter}</span>
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {new Date(a.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-[10px]">{a.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended Engineering Action */}
                <div className="border border-border/80 rounded-lg p-3 bg-background/50 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Wrench className="h-3.5 w-3.5 text-primary" />
                    Recommended Maintenance Checklist
                  </div>
                  <ul className="text-xs space-y-1.5 text-muted-foreground">
                    {activeDiagnostic.recommendedInspection.map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="text-[11px] leading-tight">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <Info className="h-8 w-8 text-primary/40 mb-2" />
                <h4 className="text-sm font-semibold text-foreground">Select a Component</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Click on the 3D transformer model or select a viewpoint above to examine sub-assembly telemetry and fault diagnostics.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
