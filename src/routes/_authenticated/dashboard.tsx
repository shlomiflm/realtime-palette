import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, LogOut, Layers } from "lucide-react";
import { toast } from "sonner";
import { templateShapes } from "@/lib/board/templates";

type Board = { id: string; title: string; updated_at: string; template: string | null; thumbnail_url: string | null };

const TEMPLATES = [
  { id: "blank", name: "Blank", desc: "Start fresh." },
  { id: "kanban", name: "Kanban", desc: "To do · Doing · Done." },
  { id: "mindmap", name: "Mind map", desc: "Central idea + branches." },
  { id: "retro", name: "Retro", desc: "What went well, what didn't." },
];

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Your boards — Canvas" }] }),
});

function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Untitled board");
  const [template, setTemplate] = useState("blank");

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("boards").select("id,title,updated_at,template,thumbnail_url").order("updated_at", { ascending: false });
    setBoards((data ?? []) as Board[]);
  }

  async function create() {
    if (!user) return;
    const { data, error } = await supabase.from("boards").insert({ title, template, owner_id: user.id }).select().single();
    if (error) return toast.error(error.message);
    // Seed template shapes via Yjs (lightweight, just store as initial state next time the board opens — store seed)
    const seed = templateShapes(template);
    if (seed.length) {
      // store as JSON in title? Use sessionStorage to seed on first open
      sessionStorage.setItem(`seed:${data.id}`, JSON.stringify(seed));
    }
    setOpen(false);
    nav({ to: "/board/$boardId", params: { boardId: data.id } });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-8 rounded-lg" style={{ background: "var(--gradient-primary)" }} />
          <span className="font-semibold">Canvas</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{profile?.display_name}</span>
          <div className="size-8 rounded-full grid place-items-center text-white text-xs font-bold" style={{ background: profile?.color }}>
            {profile?.display_name?.[0]?.toUpperCase()}
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut().then(() => nav({ to: "/" }))}><LogOut className="size-4" /></Button>
        </div>
      </header>
      <main className="px-6 py-10 mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Your boards</h1>
            <p className="text-muted-foreground mt-1">{boards.length} board{boards.length === 1 ? "" : "s"}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-[var(--shadow-elegant)]"><Plus className="size-4 mr-2" />New board</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create a new board</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                <div>
                  <Label>Template</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {TEMPLATES.map((t) => (
                      <button type="button" key={t.id} onClick={() => setTemplate(t.id)}
                        className={`text-left p-3 rounded-lg border ${template === t.id ? "border-primary bg-accent" : "border-border"}`}>
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-16 text-center">
            <Layers className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No boards yet. Create your first one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((b) => (
              <Link key={b.id} to="/board/$boardId" params={{ boardId: b.id }}
                className="rounded-2xl border border-border bg-card p-5 hover:shadow-[var(--shadow-elegant)] transition-shadow">
                <div className="aspect-video rounded-lg mb-3 overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
                  {b.thumbnail_url && <img src={b.thumbnail_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="font-medium">{b.title}</div>
                <div className="text-xs text-muted-foreground mt-1">Updated {new Date(b.updated_at).toLocaleDateString()}</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}