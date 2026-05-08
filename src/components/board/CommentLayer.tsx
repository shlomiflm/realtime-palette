import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Check } from "lucide-react";

type Comment = { id: string; user_id: string; x: number; y: number; body: string; resolved: boolean };
type Profile = { id: string; display_name: string; color: string };

export function CommentLayer({ boardId, viewport, readOnly, pendingPin, onPinPlaced }: {
  boardId: string; viewport: { x: number; y: number; zoom: number }; readOnly: boolean;
  pendingPin: { x: number; y: number } | null; onPinPlaced: () => void;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("comments").select("*").eq("board_id", boardId);
      setComments((data ?? []) as Comment[]);
      const ids = Array.from(new Set((data ?? []).map((c: Comment) => c.user_id)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("*").in("id", ids);
        const map: Record<string, Profile> = {};
        (ps ?? []).forEach((p) => (map[p.id] = p as Profile));
        setProfiles(map);
      }
    })();
    const ch = supabase.channel(`comments:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `board_id=eq.${boardId}` },
        (payload) => {
          if (payload.eventType === "INSERT") setComments((p) => [...p, payload.new as Comment]);
          if (payload.eventType === "DELETE") setComments((p) => p.filter((c) => c.id !== (payload.old as Comment).id));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [boardId]);

  const world = (p: { x: number; y: number }) => ({ left: p.x * viewport.zoom + viewport.x, top: p.y * viewport.zoom + viewport.y });

  async function submitPending() {
    if (!pendingPin || !user || !pendingText.trim()) return;
    await supabase.from("comments").insert({ board_id: boardId, user_id: user.id, x: pendingPin.x, y: pendingPin.y, body: pendingText.trim() });
    setPendingText(""); onPinPlaced();
  }
  async function resolve(id: string) { await supabase.from("comments").delete().eq("id", id); }

  return (
    <>
      {comments.map((c) => {
        const p = profiles[c.user_id];
        return (
          <div key={c.id} className="absolute z-10" style={world(c)}>
            <button onClick={() => setOpenId(openId === c.id ? null : c.id)}
              className="size-7 -translate-x-1/2 -translate-y-full rounded-full rounded-bl-none grid place-items-center text-white shadow-[var(--shadow-elegant)] hover:scale-110 transition"
              style={{ background: p?.color ?? "#6366f1" }}>
              <MessageCircle className="size-4" />
            </button>
            {openId === c.id && (
              <div className="absolute left-3 top-1 w-64 rounded-lg bg-card border border-border p-3 shadow-[var(--shadow-elegant)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium">{p?.display_name ?? "User"}</div>
                  <div className="flex gap-1">
                    {!readOnly && c.user_id === user?.id && (
                      <Button size="icon" variant="ghost" className="size-6" onClick={() => resolve(c.id)}><Check className="size-3" /></Button>
                    )}
                    <Button size="icon" variant="ghost" className="size-6" onClick={() => setOpenId(null)}><X className="size-3" /></Button>
                  </div>
                </div>
                <div className="text-sm">{c.body}</div>
              </div>
            )}
          </div>
        );
      })}
      {pendingPin && !readOnly && (
        <div className="absolute z-20" style={world(pendingPin)}>
          <div className="-translate-x-1/2 -translate-y-full flex flex-col items-start gap-1">
            <div className="size-7 rounded-full rounded-bl-none grid place-items-center text-white bg-primary"><MessageCircle className="size-4" /></div>
            <div className="w-64 rounded-lg bg-card border border-border p-2 shadow-[var(--shadow-elegant)]">
              <Input autoFocus value={pendingText} placeholder="Add a comment…"
                onChange={(e) => setPendingText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitPending(); if (e.key === "Escape") onPinPlaced(); }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}