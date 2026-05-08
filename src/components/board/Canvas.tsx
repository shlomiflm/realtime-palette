import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { nanoid } from "nanoid";
import type { AnyShape, StrokeShape, CursorState } from "@/lib/board/types";
import type { Tool } from "./Toolbar";

interface Props {
  doc: Y.Doc;
  shapes: Y.Map<AnyShape>;
  channel: ReturnType<typeof import("@supabase/supabase-js").SupabaseClient.prototype.channel>;
  tool: Tool;
  setTool: (t: Tool) => void;
  me: { userId: string; name: string; color: string };
  readOnly: boolean;
  onViewport: (v: { x: number; y: number; zoom: number }) => void;
  onPresence: (peers: { userId: string; name: string; color: string }[]) => void;
  onCommentPin?: (p: { x: number; y: number }) => void;
  pendingComment?: boolean;
}

export function Canvas({ doc, shapes, channel, tool, setTool, me, readOnly, onViewport, onPresence, onCommentPin, pendingComment }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [drawing, setDrawing] = useState<AnyShape | null>(null);
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const [, force] = useState(0);
  const undoMgr = useRef<Y.UndoManager | null>(null);
  const editingTextId = useRef<string | null>(null);

  // Subscribe to shapes changes
  useEffect(() => {
    const handler = () => force((n) => n + 1);
    shapes.observeDeep(handler);
    return () => shapes.unobserveDeep(handler);
  }, [shapes]);

  // Undo manager (100 steps via captureTimeout)
  useEffect(() => {
    undoMgr.current = new Y.UndoManager(shapes, { captureTimeout: 500 });
    (window as any).__undo = () => undoMgr.current?.undo();
    (window as any).__redo = () => undoMgr.current?.redo();
    return () => undoMgr.current?.destroy();
  }, [shapes]);

  // Notify viewport upward
  useEffect(() => { onViewport(viewport); }, [viewport, onViewport]);

  // Cursor + presence broadcast
  useEffect(() => {
    const onCursor = ({ payload }: any) => {
      if (!payload || payload.userId === me.userId) return;
      setCursors((c) => ({ ...c, [payload.userId]: payload }));
    };
    channel.on("broadcast", { event: "cursor" }, onCursor);
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, { userId: string; name: string; color: string }[]>;
      const peers = Object.values(state).flat();
      onPresence(peers);
    });
    channel.track(me).catch(() => {});
  }, [channel, me, onPresence]);

  // Coordinate helpers
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: (sx - r.left - viewport.x) / viewport.zoom, y: (sy - r.top - viewport.y) / viewport.zoom };
  }, [viewport]);

  // Draw loop
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = containerRef.current!.getBoundingClientRect();
      c.width = r.width * dpr; c.height = r.height * dpr;
      c.style.width = r.width + "px"; c.style.height = r.height + "px";
      render();
    };
    const render = () => {
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      // grid
      const r = containerRef.current!.getBoundingClientRect();
      const gridSize = 40 * viewport.zoom;
      ctx.fillStyle = "rgba(99,102,241,0.08)";
      const offX = viewport.x % gridSize, offY = viewport.y % gridSize;
      for (let x = offX; x < r.width; x += gridSize) {
        for (let y = offY; y < r.height; y += gridSize) {
          ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.save();
      ctx.translate(viewport.x, viewport.y);
      ctx.scale(viewport.zoom, viewport.zoom);
      const all = [...Array.from(shapes.values()), ...(drawing ? [drawing] : [])];
      for (const s of all) drawShape(ctx, s);
      ctx.restore();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current!);
    resize();
    let raf = 0;
    const tick = () => { render(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [shapes, drawing, viewport]);

  function drawShape(ctx: CanvasRenderingContext2D, s: AnyShape) {
    ctx.fillStyle = s.fill; ctx.strokeStyle = s.stroke; ctx.lineWidth = 2;
    if (s.type === "rect") {
      roundRect(ctx, s.x, s.y, s.w, s.h, 8); ctx.fill(); ctx.stroke();
      if (s.text) drawText(ctx, s.text, s.x, s.y, s.w, s.h, "#1e293b");
    } else if (s.type === "ellipse") {
      ctx.beginPath(); ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w) / 2, Math.abs(s.h) / 2, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (s.text) drawText(ctx, s.text, s.x, s.y, s.w, s.h, "#1e293b");
    } else if (s.type === "sticky") {
      ctx.shadowColor = "rgba(0,0,0,0.15)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
      ctx.fillStyle = s.fill; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.shadowColor = "transparent";
      drawText(ctx, s.text || "Sticky", s.x + 8, s.y + 8, s.w - 16, s.h - 16, "#422006", "left", "top");
    } else if (s.type === "text") {
      drawText(ctx, s.text || "Text", s.x, s.y, s.w, s.h, s.stroke || "#1e293b", "left", "top", 18);
    } else if (s.type === "stroke") {
      const ss = s as StrokeShape;
      ctx.strokeStyle = ss.stroke; ctx.lineWidth = ss.strokeWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      const pts = ss.points;
      if (pts.length >= 2) {
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      }
    }
  }
  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, color: string, ha: CanvasTextAlign = "center", va: CanvasTextBaseline = "middle", size = 14) {
    ctx.fillStyle = color; ctx.font = `${size}px ui-sans-serif, system-ui`;
    ctx.textAlign = ha; ctx.textBaseline = va;
    const cx = ha === "center" ? x + w / 2 : x;
    const cy = va === "middle" ? y + h / 2 : y;
    const lines = wrap(ctx, text, w, size);
    lines.forEach((ln, i) => ctx.fillText(ln, cx, cy + i * size * 1.2));
  }
  function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, size: number): string[] {
    const out: string[] = []; const words = text.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > max && line) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
    return out.slice(0, Math.max(1, Math.floor((1000) / (size * 1.2))));
  }

  // Pointer events
  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const w = screenToWorld(e.clientX, e.clientY);
    if (pendingComment && onCommentPin) { onCommentPin(w); return; }
    if (tool === "select" || e.button === 1 || e.altKey) {
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y };
      return;
    }
    const id = nanoid(8);
    if (tool === "stroke") {
      const s: StrokeShape = { id, type: "stroke", x: w.x, y: w.y, w: 0, h: 0, fill: "transparent", stroke: me.color, points: [w.x, w.y], strokeWidth: 3 };
      setDrawing(s);
    } else if (tool === "sticky") {
      const s: AnyShape = { id, type: "sticky", x: w.x, y: w.y, w: 160, h: 160, fill: "#fef08a", stroke: "#ca8a04", text: "" };
      shapes.set(id, s); editingTextId.current = id; promptText(s);
    } else if (tool === "text") {
      const s: AnyShape = { id, type: "text", x: w.x, y: w.y, w: 200, h: 30, fill: "transparent", stroke: "#1e293b", text: "Text" };
      shapes.set(id, s); promptText(s);
    } else {
      setDrawing({ id, type: tool === "rect" ? "rect" : "ellipse", x: w.x, y: w.y, w: 0, h: 0, fill: "#e0e7ff", stroke: "#6366f1" });
    }
  }
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  function promptText(s: AnyShape) {
    const v = window.prompt("Text:", s.text || "");
    if (v != null) shapes.set(s.id, { ...s, text: v });
  }

  function onPointerMove(e: React.PointerEvent) {
    const w = screenToWorld(e.clientX, e.clientY);
    // throttle cursor broadcast
    if (channel) {
      channel.send({ type: "broadcast", event: "cursor", payload: { ...me, x: w.x, y: w.y } });
    }
    if (panRef.current) {
      setViewport((v) => ({ ...v, x: panRef.current!.vx + (e.clientX - panRef.current!.sx), y: panRef.current!.vy + (e.clientY - panRef.current!.sy) }));
      return;
    }
    if (drawing) {
      if (drawing.type === "stroke") {
        const ss = drawing as StrokeShape;
        setDrawing({ ...ss, points: [...ss.points, w.x, w.y] });
      } else {
        setDrawing({ ...drawing, w: w.x - drawing.x, h: w.y - drawing.y });
      }
    }
  }
  function onPointerUp() {
    panRef.current = null;
    if (drawing) {
      let s = drawing;
      if (s.type !== "stroke") {
        // normalize negative drag
        let { x, y, w, h } = s;
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        if (w < 4 || h < 4) { setDrawing(null); return; }
        s = { ...s, x, y, w, h };
      } else {
        const ss = s as StrokeShape;
        const xs = ss.points.filter((_, i) => i % 2 === 0);
        const ys = ss.points.filter((_, i) => i % 2 === 1);
        s = { ...ss, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      shapes.set(s.id, s);
      setDrawing(null);
      setTool("select");
    }
  }
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      const r = containerRef.current!.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setViewport((v) => {
        const nz = Math.max(0.1, Math.min(4, v.zoom * factor));
        return { x: mx - (mx - v.x) * (nz / v.zoom), y: my - (my - v.y) * (nz / v.zoom), zoom: nz };
      });
    } else {
      setViewport((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-[hsl(var(--background))]"
      style={{ cursor: tool === "select" ? "default" : pendingComment ? "crosshair" : "crosshair" }}>
      <canvas ref={ref}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onWheel={onWheel} className="absolute inset-0" />
      {/* live cursors */}
      {Object.values(cursors).map((c) => (
        <div key={c.userId} className="absolute pointer-events-none z-30 transition-transform"
          style={{ transform: `translate(${c.x * viewport.zoom + viewport.x}px, ${c.y * viewport.zoom + viewport.y}px)` }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill={c.color}><path d="M3 2l7 18 2-7 7-2z" /></svg>
          <div className="ml-4 -mt-1 px-2 py-0.5 rounded text-white text-xs whitespace-nowrap" style={{ background: c.color }}>{c.name}</div>
        </div>
      ))}
    </div>
  );
}

export function exportCanvasAsPNG(canvasEl: HTMLCanvasElement | null): string | null {
  if (!canvasEl) return null;
  return canvasEl.toDataURL("image/png");
}