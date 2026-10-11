import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Zap, ShieldCheck } from "lucide-react";
import { login } from "@/lib/api";

// Login page (route "/"). Real credential check hits FastAPI when
// VITE_API_URL is set; otherwise any username + password ≥ 4 chars works
// so the demo runs standalone in the Lovable preview.
export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("operator");
  const [password, setPassword] = useState("substation");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-forward if already signed in.
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("dt_user")) {
      navigate({ to: "/dashboard" });
    }
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await login(username, password);
    setLoading(false);
    if (!ok) {
      setError("Invalid credentials. Try operator / substation for demo.");
      return;
    }
    localStorage.setItem("dt_user", username);
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">AI Digital Twin</h1>
            <p className="text-xs font-mono text-muted-foreground">EHV 400 / 220 kV Substation</p>
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-base font-semibold">Operator Sign In</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Access the substation control dashboard.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              />
            </div>

            {error && (
              <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" />
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-[11px] font-mono text-muted-foreground">
            Demo: <span className="text-foreground">operator</span> /{" "}
            <span className="text-foreground">substation</span>
          </p>
        </div>
      </div>
    </div>
  );
}
