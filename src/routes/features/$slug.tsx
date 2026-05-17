import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { MousePointer2, Users, Zap, MessageSquarePin, LayoutTemplate, Camera, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { templateShapes } from "@/lib/board/templates";

type FeatureDef = {
  title: string;
  tagline: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  cta: string;
  // action keys understood by the page below
  action: "open-board" | "open-share" | "open-board-crdt" | "open-comments" | "new-from-template" | "snapshot";
};

const FEATURES: Record<string, FeatureDef> = {
  "live-cursors": {
    title: "Live cursors",
    tagline: "See everyone, as it happens.",
    body: "Every user's pointer position is broadcast through the Supabase Realtime channel and rendered on the canvas as a colored cursor with their name. As you move your mouse, collaborators see your cursor glide across the board in real time.",
    icon: MousePointer2,
    cta: "Open a board and move your cursor",
    action: "open-board",
  },
  sharing: {
    title: "Roles & sharing",
    tagline: "Owner, editor, viewer — your call.",
    body: "Access is governed by board members with three roles — owner, editor, and viewer — and only owners can change or revoke access. Owners can also toggle a public read-only link so signed-in users outside the invite list can view without editing.",
    icon: Users,
    cta: "Open the Share dialog on a board",
    action: "open-share",
  },
  crdt: {
    title: "CRDT-powered",
    tagline: "Conflict-free, always.",
    body: "All shapes, strokes, and sticky notes live inside a Yjs document that merges concurrent edits automatically so no user overwrites another. State is synced via Supabase broadcast and hydrated from a persisted snapshot on load.",
    icon: Zap,
    cta: "Open a board and edit in two tabs",
    action: "open-board-crdt",
  },
  comments: {
    title: "Pinned comments",
    tagline: "Talk where it matters.",
    body: "Pick the comment tool and click any spot on the canvas to drop a pin at that exact coordinate and type a message. Each pin opens a card with the author and text; authors can resolve their own pins and everything updates live.",
    icon: MessageSquarePin,
    cta: "Open a board with the comment tool armed",
    action: "open-comments",
  },
  templates: {
    title: "Templates",
    tagline: "Skip the blank canvas.",
    body: "Spin up a board pre-seeded as a Kanban (To do / Doing / Done), a Mind map (central node), a Retro (went well / didn't / actions), or just Blank — so collaborators land on something structured instead of an empty page.",
    icon: LayoutTemplate,
    cta: "Create a board from a template",
    action: "new-from-template",
  },
  snapshots: {
    title: "Snapshots",
    tagline: "Capture the moment.",
    body: "The full Yjs document is encoded and saved every few seconds whenever the board changes. You can also export the canvas as a PNG at any time for thumbnails or sharing outside the app.",
    icon: Camera,
    cta: "Open a board and export a PNG",
    action: "snapshot",
  },
};

export const Route = createFileRoute("/features/$slug")({
  component: FeaturePage,
  loader: ({ params }) => {
    if (!FEATURES[params.slug]) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const f = FEATURES[params.slug];
    if (!f) return { meta: [{ title: "Feature — Canvas" }] };
    return {
      meta: [
        { title: `${f.title} — Canvas` },
        { name: "description", content: f.body.slice(0, 155) },
        { property: "og:title", content: `${f.title} — Canvas` },
        { property: "og:description", content: f.tagline },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center text-center p-6">
      <div>
        <h1 className="text-2xl font-semibold">Feature not found</h1>
        <Link to="/" className="text-primary text-sm mt-2 inline-block">← Back home</Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
});

function FeaturePage() {
  const { slug } = Route.useParams();
  const f = FEATURES[slug]!;
  const Icon = f.icon;
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  async function findOrCreateBoard(template = "blank"): Promise<string | null> {
    if (!user) return null;
    const { data: existing } = await supabase
      .from("boards").select("id").order("updated_at", { ascending: false }).limit(1);
    if (existing && existing.length) return existing[0].id;
    const { data, error } = await supabase
      .from("boards").insert({ title: `${f.title} demo`, template, owner_id: user.id }).select().single();
    if (error) { toast.error(error.message); return null; }
    const seed = templateShapes(template);
    if (seed.length) sessionStorage.setItem(`seed:${data.id}`, JSON.stringify(seed));
    return data.id;
  }

  async function runAction() {
    if (!user) { nav({ to: "/signup" }); return; }
    setBusy(true);
    try {
      if (f.action === "new-from-template") {
        nav({ to: "/dashboard", search: { newBoard: "1" } as never });
        return;
      }
      const id = await findOrCreateBoard();
      if (!id) return;
      const hintMap: Record<FeatureDef["action"], string> = {
        "open-board": "",
        "open-share": "share",
        "open-board-crdt": "crdt",
        "open-comments": "comments",
        "snapshot": "snapshot",
        "new-from-template": "",
      };
      const hint = hintMap[f.action];
      if (hint) sessionStorage.setItem(`featureHint:${id}`, hint);
      nav({ to: "/board/$boardId", params: { boardId: id } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back home
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <Link to="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          ) : (
            <>
              <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link to="/signup"><Button size="sm">Get started</Button></Link>
            </>
          )}
        </nav>
      </header>
      <main className="px-6 py-20 mx-auto max-w-3xl">
        <div className="size-14 rounded-2xl grid place-items-center mb-6" style={{ background: "var(--gradient-primary)" }}>
          <Icon className="size-7 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{f.title}</h1>
        <p className="mt-3 text-xl text-muted-foreground">{f.tagline}</p>
        <p className="mt-6 text-base leading-relaxed">{f.body}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button size="lg" onClick={runAction} disabled={busy} className="shadow-[var(--shadow-elegant)]">
            {busy ? "Opening…" : f.cta}
          </Button>
          <Link to="/"><Button size="lg" variant="outline">Back to all features</Button></Link>
        </div>
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(FEATURES).filter(([s]) => s !== slug).map(([s, def]) => (
            <Link key={s} to="/features/$slug" params={{ slug: s }}
              className="rounded-lg border border-border p-3 text-sm hover:border-primary/40 hover:bg-accent/30 transition-colors">
              <def.icon className="size-4 text-primary mb-1" />
              {def.title}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}