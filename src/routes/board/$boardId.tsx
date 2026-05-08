import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createYjsBoard, type YjsBoardHandle } from "@/lib/board/yjs";
import { Canvas } from "@/components/board/Canvas";
import { Toolbar, type Tool } from "@/components/board/Toolbar";
import { PresenceList } from "@/components/board/PresenceList";
import { ChatPanel } from "@/components/board/ChatPanel";
import { ShareDialog } from "@/components/board/ShareDialog";
import { CommentLayer } from "@/components/board/CommentLayer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import type { AnyShape } from "@/lib/board/types";

export const Route = createFileRoute("/board/$boardId")({ component: BoardPage });

function BoardPage() {
  const { boardId } = Route.useParams();
  const { user, profile, loading } = useAuth();
  const nav = useNavigate();
  const [handle, setHandle] = useState<YjsBoardHandle | null>(null);
  const [board, setBoard] = useState<{ title: string; owner_id: string; is_public: boolean } | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [chatOpen, setChatOpen] = useState(false);
  const [peers, setPeers] = useState<{ userId: string; name: string; color: string }[]>([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { nav({ to: "/login" }); return; }
    let h: YjsBoardHandle | null = null;
    (async () => {
      // ensure membership (auto-join as editor if not member and board isn't restricted)
      const { data: existing } = await supabase.from("board_members").select("role").eq("board_id", boardId).eq("user_id", user.id).maybeSingle();
      if (!existing) {
        await supabase.from("board_members").insert({ board_id: boardId, user_id: user.id, role: "editor" });
      }
      const { data: b, error } = await supabase.from("boards").select("title, owner_id, is_public").eq("id", boardId).maybeSingle();
      if (error || !b) { toast.error("Board not found or no access"); nav({ to: "/dashboard" }); return; }
      setBoard(b);
      h = await createYjsBoard(boardId, user.id);
      // seed template if needed
      const seed = sessionStorage.getItem(`seed:${boardId}`);
      if (seed && h.shapes.size === 0) {
        const arr: AnyShape[] = JSON.parse(seed);
        h.doc.transact(() => arr.forEach((s) => h!.shapes.set(s.id, s)));
        sessionStorage.removeItem(`seed:${boardId}`);
      }
      setHandle(h);
    })();
    return () => { h?.destroy(); };
  }, [boardId, user, loading]);

  async function exportPNG() {
    const canv = canvasContainerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canv || !user) return;
    canv.toBlob(async (blob) => {
      if (!blob) return;
      const path = `${boardId}/${Date.now()}.png`;
      const { error } = await supabase.storage.from("board-snapshots").upload(path, blob, { contentType: "image/png" });
      if (error) return toast.error(error.message);
      const { data } = supabase.storage.from("board-snapshots").getPublicUrl(path);
      await supabase.from("snapshots").insert({ board_id: boardId, user_id: user.id, storage_path: path });
      await supabase.from("boards").update({ thumbnail_url: data.publicUrl }).eq("id", boardId);
      toast.success("Snapshot saved");
    }, "image/png");
  }

  if (!handle || !board || !profile || !user) return <div className="min-h-screen grid place-items-center text-muted-foreground">Opening board…</div>;

  const isOwner = board.owner_id === user.id;
  const me = { userId: user.id, name: profile.display_name, color: profile.color };

  return (
    <div className="fixed inset-0 bg-background">
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-card/80 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3">
          <Link to="/dashboard"><Button variant="ghost" size="icon"><ArrowLeft className="size-4" /></Button></Link>
          <div>
            <input className="font-semibold bg-transparent outline-none" defaultValue={board.title}
              onBlur={(e) => supabase.from("boards").update({ title: e.target.value }).eq("id", boardId).then(() => {})} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PresenceList peers={peers} />
          <Button variant="ghost" size="icon" onClick={() => setChatOpen((o) => !o)}><MessageSquare className="size-4" /></Button>
          <ShareDialog boardId={boardId} isOwner={isOwner} isPublic={board.is_public} onPublicChange={(v) => setBoard({ ...board, is_public: v })} />
        </div>
      </header>

      <div ref={canvasContainerRef} className="absolute inset-0 pt-14">
        <Canvas
          doc={handle.doc} shapes={handle.shapes} channel={handle.channel}
          tool={tool} setTool={setTool} me={me} readOnly={false}
          onViewport={setViewport} onPresence={setPeers}
          pendingComment={tool === "comment" && !pendingPin}
          onCommentPin={(p) => { setPendingPin(p); }}
        />
        <CommentLayer boardId={boardId} viewport={viewport} readOnly={false}
          pendingPin={pendingPin} onPinPlaced={() => { setPendingPin(null); setTool("select"); }} />
      </div>

      <Toolbar tool={tool} setTool={setTool}
        onUndo={() => (window as unknown as { __undo?: () => void }).__undo?.()}
        onRedo={() => (window as unknown as { __redo?: () => void }).__redo?.()}
        onExport={exportPNG} />

      {chatOpen && <ChatPanel boardId={boardId} onClose={() => setChatOpen(false)} />}
    </div>
  );
}