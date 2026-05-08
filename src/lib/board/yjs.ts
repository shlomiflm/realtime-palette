import * as Y from "yjs";
import { supabase } from "@/integrations/supabase/client";
import type { AnyShape } from "./types";

/**
 * Sets up a Yjs doc synced via Supabase Realtime broadcast and persists snapshots
 * to the boards table. Returns helpers and cleanup.
 */
export interface YjsBoardHandle {
  doc: Y.Doc;
  shapes: Y.Map<AnyShape>;
  destroy: () => void;
  channel: ReturnType<typeof supabase.channel>;
  saveSnapshot: () => Promise<void>;
}

export async function createYjsBoard(boardId: string, clientId: string): Promise<YjsBoardHandle> {
  const doc = new Y.Doc();
  const shapes = doc.getMap<AnyShape>("shapes");

  // Load persisted state from Supabase
  const { data } = await supabase.from("boards").select("yjs_state").eq("id", boardId).maybeSingle();
  if (data?.yjs_state) {
    try {
      // yjs_state stored as bytea -> hex string in JS client
      const raw: string = data.yjs_state as unknown as string;
      const bytes = hexToBytes(raw);
      if (bytes.length > 0) Y.applyUpdate(doc, bytes);
    } catch (e) {
      console.warn("yjs hydrate failed", e);
    }
  }

  // Realtime channel for Yjs updates + cursors + presence
  const channel = supabase.channel(`board:${boardId}`, {
    config: { broadcast: { self: false }, presence: { key: clientId } },
  });

  // Outgoing updates
  doc.on("update", (update: Uint8Array, origin) => {
    if (origin === "remote") return;
    channel.send({ type: "broadcast", event: "yjs", payload: { u: bytesToBase64(update) } });
  });

  channel.on("broadcast", { event: "yjs" }, ({ payload }) => {
    try {
      const u = base64ToBytes(payload.u);
      Y.applyUpdate(doc, u, "remote");
    } catch (e) {
      console.warn("apply remote update failed", e);
    }
  });

  // On join, request a sync from peers
  channel.on("broadcast", { event: "sync-request" }, () => {
    const sv = Y.encodeStateAsUpdate(doc);
    channel.send({ type: "broadcast", event: "yjs", payload: { u: bytesToBase64(sv) } });
  });

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({ type: "broadcast", event: "sync-request", payload: {} });
        resolve();
      }
    });
  });

  // Periodic snapshot to DB
  let dirty = false;
  doc.on("update", () => { dirty = true; });
  const interval = setInterval(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      const state = Y.encodeStateAsUpdate(doc);
      await supabase.from("boards").update({ yjs_state: bytesToHex(state) as unknown as never }).eq("id", boardId);
    } catch (e) {
      console.warn("snapshot failed", e);
    }
  }, 5000);

  return {
    doc,
    shapes,
    channel,
    saveSnapshot: async () => {
      const state = Y.encodeStateAsUpdate(doc);
      await supabase.from("boards").update({ yjs_state: bytesToHex(state) as unknown as never }).eq("id", boardId);
    },
    destroy: () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      doc.destroy();
    },
  };
}

// helpers
function bytesToBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  let s = "\\x";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}
function hexToBytes(s: string): Uint8Array {
  if (typeof s !== "string") return new Uint8Array();
  const h = s.startsWith("\\x") ? s.slice(2) : s;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}