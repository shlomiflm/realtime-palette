import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X } from "lucide-react";

type Msg = { id: string; user_id: string; body: string; created_at: string };
type Profile = { id: string; display_name: string; color: string };

export function ChatPanel({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("board_id", boardId).order("created_at");
      if (!active) return;
      setMsgs((data ?? []) as Msg[]);
      const ids = Array.from(new Set((data ?? []).map((m: Msg) => m.user_id)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("*").in("id", ids);
        const map: Record<string, Profile> = {};
        (ps ?? []).forEach((p) => (map[p.id] = p as Profile));
        if (active) setProfiles(map);
      }
    })();
    const ch = supabase
      .channel(`chat:${boardId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `board_id=eq.${boardId}` },
        async (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => [...prev, m]);
          setProfiles((prev) => {
            if (prev[m.user_id]) return prev;
            supabase.from("profiles").select("*").eq("id", m.user_id).maybeSingle()
              .then(({ data: p }) => { if (p) setProfiles((x) => ({ ...x, [p.id]: p as Profile })); });
            return prev;
          });
        })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [boardId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    if (!text.trim() || !user) return;
    const body = text.trim();
    setText("");
    await supabase.from("chat_messages").insert({ board_id: boardId, user_id: user.id, body });
  }

  return (
    <aside className="absolute right-4 top-20 bottom-4 w-80 z-20 flex flex-col rounded-2xl bg-card border border-border shadow-[var(--shadow-elegant)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold">Chat</h3>
        <Button size="icon" variant="ghost" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {msgs.map((m) => {
          const p = profiles[m.user_id];
          return (
            <div key={m.id} className="flex gap-2">
              <div className="size-7 rounded-full grid place-items-center text-white text-[10px] font-bold flex-shrink-0"
                style={{ background: p?.color ?? "#888" }}>{(p?.display_name ?? "?")[0]?.toUpperCase()}</div>
              <div>
                <div className="text-xs text-muted-foreground">{p?.display_name ?? "User"}</div>
                <div className="text-sm">{m.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-border flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
        <Button type="submit" size="icon"><Send className="size-4" /></Button>
      </form>
    </aside>
  );
}