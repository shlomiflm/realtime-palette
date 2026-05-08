export function PresenceList({ peers }: { peers: { userId: string; name: string; color: string }[] }) {
  return (
    <div className="flex -space-x-2">
      {peers.slice(0, 6).map((p) => (
        <div key={p.userId} title={p.name}
          className="size-8 rounded-full grid place-items-center text-white text-xs font-bold ring-2 ring-card"
          style={{ background: p.color }}>
          {p.name?.[0]?.toUpperCase() ?? "?"}
        </div>
      ))}
      {peers.length > 6 && <div className="size-8 rounded-full bg-muted text-xs grid place-items-center ring-2 ring-card">+{peers.length - 6}</div>}
    </div>
  );
}