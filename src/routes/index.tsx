import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { MousePointer2, Users, Zap, MessageSquarePin, LayoutTemplate, Camera } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Canvas — Real-time collaborative whiteboard" },
      { name: "description", content: "Draw, sketch, and brainstorm together in real time. Multiplayer infinite canvas with live cursors, comments, and chat." },
    ],
  }),
});

function Index() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg" style={{ background: "var(--gradient-primary)" }} />
          <span className="font-semibold text-lg">Canvas</span>
        </div>
        <nav className="flex items-center gap-3">
          {user ? (
            <Link to="/dashboard"><Button>Open dashboard</Button></Link>
          ) : (
            <>
              <Link to="/login"><Button variant="ghost">Sign in</Button></Link>
              <Link to="/signup"><Button>Get started</Button></Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden px-6 py-24 md:py-32 text-center">
          <div className="absolute inset-0 -z-10 opacity-30" style={{ background: "var(--gradient-hero)" }} />
          <div className="mx-auto max-w-3xl">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>
              Think together, in real time
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground">
              An infinite multiplayer whiteboard. Draw shapes, sticky notes and freehand strokes with your team — see every cursor, comment, and idea as it happens.
            </p>
            <div className="mt-10 flex justify-center gap-3">
              <Link to={user ? "/dashboard" : "/signup"}>
                <Button size="lg" className="shadow-[var(--shadow-elegant)]">Start drawing free</Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="px-6 py-20 mx-auto max-w-6xl grid md:grid-cols-3 gap-6">
          {[
            { icon: MousePointer2, t: "Live cursors", d: "See teammates move and edit in real time, with names and colors.", slug: "live-cursors" },
            { icon: Users, t: "Roles & sharing", d: "Owner, editor, viewer roles. Generate a public read-only share link.", slug: "sharing" },
            { icon: Zap, t: "CRDT-powered", d: "Yjs keeps everything in sync — even when the network is messy.", slug: "crdt" },
            { icon: MessageSquarePin, t: "Pinned comments", d: "Pin discussions to coordinates on the canvas.", slug: "comments" },
            { icon: LayoutTemplate, t: "Templates", d: "Start from kanban, mind map, retro, or a blank page.", slug: "templates" },
            { icon: Camera, t: "Snapshots", d: "Export the board to PNG and keep a history.", slug: "snapshots" },
          ].map(({ icon: Icon, t, d, slug }) => (
            <Link key={t} to="/features/$slug" params={{ slug }}
              className="text-left rounded-2xl border border-border p-6 bg-card hover:shadow-[var(--shadow-elegant)] hover:border-primary/40 transition-all">
              <Icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
              <span className="mt-4 inline-block text-xs font-medium text-primary">Try it →</span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
