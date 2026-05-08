import { Button } from "@/components/ui/button";
import { MousePointer, Square, Circle, Pencil, StickyNote, Type, Undo2, Redo2, Download, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tool = "select" | "rect" | "ellipse" | "stroke" | "sticky" | "text" | "comment";

const TOOLS: { id: Tool; icon: typeof Square; label: string }[] = [
  { id: "select", icon: MousePointer, label: "Select" },
  { id: "rect", icon: Square, label: "Rectangle" },
  { id: "ellipse", icon: Circle, label: "Ellipse" },
  { id: "stroke", icon: Pencil, label: "Pen" },
  { id: "sticky", icon: StickyNote, label: "Sticky" },
  { id: "text", icon: Type, label: "Text" },
  { id: "comment", icon: MessageSquare, label: "Comment" },
];

export function Toolbar({ tool, setTool, onUndo, onRedo, onExport }: {
  tool: Tool; setTool: (t: Tool) => void;
  onUndo: () => void; onRedo: () => void; onExport: () => void;
}) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-4 z-20 flex items-center gap-1 rounded-2xl bg-card border border-border p-1.5 shadow-[var(--shadow-elegant)]">
      {TOOLS.map((t) => (
        <Button key={t.id} size="icon" variant={tool === t.id ? "default" : "ghost"}
          onClick={() => setTool(t.id)} title={t.label} className={cn("size-9")}>
          <t.icon className="size-4" />
        </Button>
      ))}
      <div className="w-px h-6 bg-border mx-1" />
      <Button size="icon" variant="ghost" onClick={onUndo} title="Undo"><Undo2 className="size-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onRedo} title="Redo"><Redo2 className="size-4" /></Button>
      <Button size="icon" variant="ghost" onClick={onExport} title="Export PNG"><Download className="size-4" /></Button>
    </div>
  );
}