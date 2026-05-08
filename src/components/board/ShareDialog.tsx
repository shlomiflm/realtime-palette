import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Share2, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Member = { user_id: string; role: "owner" | "editor" | "viewer"; profile: { display_name: string; color: string } | null };

export function ShareDialog({ boardId, isOwner, isPublic, onPublicChange }: {
  boardId: string; isOwner: boolean; isPublic: boolean; onPublicChange: (v: boolean) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { if (open) load(); }, [open, boardId]);
  async function load() {
    const { data } = await supabase.from("board_members").select("user_id, role").eq("board_id", boardId);
    const ids = (data ?? []).map((m) => m.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name, color").in("id", ids)
      : { data: [] as { id: string; display_name: string; color: string }[] };
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    setMembers((data ?? []).map((m) => ({ ...m, profile: pmap.get(m.user_id) ?? null })) as Member[]);
  }
  async function changeRole(uid: string, newRole: "editor" | "viewer") {
    await supabase.from("board_members").update({ role: newRole }).eq("board_id", boardId).eq("user_id", uid);
    load();
  }
  async function remove(uid: string) {
    await supabase.from("board_members").delete().eq("board_id", boardId).eq("user_id", uid);
    load();
  }
  async function togglePublic(v: boolean) {
    await supabase.from("boards").update({ is_public: v }).eq("id", boardId);
    onPublicChange(v);
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/board/${boardId}` : "";
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/share/${boardId}` : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Share2 className="size-4 mr-2" />Share</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Share this board</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Invite link (signed-in collaborators)</Label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={inviteUrl} />
              <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("Link copied"); }}><Copy className="size-4" /></Button>
            </div>
          </div>
          {isOwner && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="font-medium text-sm">Public read-only link</div>
                <div className="text-xs text-muted-foreground">Anyone signed in can view</div>
              </div>
              <Switch checked={isPublic} onCheckedChange={togglePublic} />
            </div>
          )}
          {isPublic && (
            <div className="flex gap-2">
              <Input readOnly value={publicUrl} />
              <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Public link copied"); }}><Copy className="size-4" /></Button>
            </div>
          )}
          <div>
            <Label>People with access</Label>
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2">
                  <div className="size-7 rounded-full grid place-items-center text-white text-xs font-bold" style={{ background: m.profile?.color ?? "#888" }}>
                    {(m.profile?.display_name ?? "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 text-sm">{m.profile?.display_name ?? "Unknown"}</div>
                  {m.role === "owner" ? (
                    <span className="text-xs text-muted-foreground">Owner</span>
                  ) : isOwner ? (
                    <>
                      <Select value={m.role} onValueChange={(v) => changeRole(m.user_id, v as "editor" | "viewer")}>
                        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" onClick={() => remove(m.user_id)}><Trash2 className="size-4" /></Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}