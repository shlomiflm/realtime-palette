import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Create your account — Canvas" }] }),
});

function SignupPage() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(email, password, name);
    setLoading(false);
    if (error) return toast.error(error);
    toast.success("Check your inbox to verify, then sign in.");
    nav({ to: "/login" });
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
        <div className="mb-6 text-center">
          <div className="mx-auto size-10 rounded-lg" style={{ background: "var(--gradient-primary)" }} />
          <h1 className="mt-4 text-2xl font-semibold">Create your account</h1>
        </div>
        <div className="space-y-4">
          <div><Label>Display name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Password</Label><Input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? "Creating…" : "Sign up"}</Button>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Have an account? <Link to="/login" className="text-primary font-medium">Sign in</Link>
        </p>
      </form>
    </div>
  );
}