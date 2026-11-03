import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Leaf, LogOut, ScanLine, LayoutDashboard, History, BookOpen, Upload, Camera, RotateCcw,
  Loader2, Sparkles, CheckCircle2, Recycle, AlertTriangle, Trash2, Cpu, UserX, HelpCircle, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { classifyWaste, deleteMyAccount } from "@/lib/classify.functions";
import type { ScanResult } from "@/lib/scan-schema";
import { BINS, rowToScan, stats, type Scan, type ScanRow } from "@/lib/eco-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoLens AI — Smart Waste Segregation" },
      { name: "description", content: "Scan any waste item with AI and learn exactly which bin it belongs in." },
      { property: "og:title", content: "EcoLens AI — Smart Waste Segregation" },
      { property: "og:description", content: "Scan any waste item with AI and learn exactly which bin it belongs in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type Tab = "scan" | "dashboard" | "history" | "learn";

async function loadHistory(): Promise<Scan[]> {
  const { data, error } = await supabase.from("scans").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error("Could not load your history.");
  return (data as ScanRow[]).flatMap((r) => { const s = rowToScan(r); return s ? [s] : []; });
}

function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<Scan[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const deleteAccountFn = useServerFn(deleteMyAccount);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "INITIAL_SESSION" && event !== "USER_UPDATED") return;
      setUser(session?.user ?? null);
      setReady(true);
      if (session?.user) loadHistory().then(setHistory).catch((e) => toast.error((e as Error).message));
      else setHistory([]);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = async () => { await supabase.auth.signOut(); setTab("dashboard"); };
  const removeScan = async (id: string) => {
    const { error } = await supabase.from("scans").delete().eq("id", id);
    if (error) { toast.error("Could not delete scan."); return; }
    setHistory((h) => h.filter((s) => s.id !== id)); toast.success("Scan deleted.");
  };
  const clearAll = async () => {
    if (!user || !window.confirm("Delete your entire scan history? This cannot be undone.")) return;
    const { error } = await supabase.from("scans").delete().eq("user_id", user.id);
    if (error) { toast.error("Could not clear history."); return; }
    setHistory([]); toast.success("History cleared.");
  };
  const removeAccount = async () => {
    if (!user || !window.confirm("Delete your account and all saved scans? This cannot be undone.")) return;
    try {
      await deleteAccountFn();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted.");
    } catch (err) { toast.error((err as Error).message); }
  };
  if (!ready) return null;
  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen">
      <Nav tab={tab} setTab={setTab} user={user} onLogout={logout} onDeleteAccount={removeAccount} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div key={tab} className="fade-up">
          {tab === "scan" && (
            <Scanner onSaved={(s) => setHistory((h) => [s, ...h])} />
          )}
          {tab === "dashboard" && <Dashboard history={history} />}
          {tab === "history" && <HistoryView history={history} onDelete={removeScan} onClearAll={clearAll} />}
          {tab === "learn" && <Learn />}
        </div>
      </main>
    </div>
  );
}

/* ---------------- Nav ---------------- */
function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-ocean grid size-9 place-items-center rounded-xl text-primary-foreground">
        <Leaf className="size-5" />
      </span>
      <span className="font-display text-lg font-bold">EcoLens <span className="text-primary">AI</span></span>
    </div>
  );
}

function Nav({ tab, setTab, user, onLogout, onDeleteAccount }: { tab: Tab; setTab: (t: Tab) => void; user: User; onLogout: () => void; onDeleteAccount: () => void }) {
  const items: { id: Tab; label: string; icon: typeof Leaf }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "scan", label: "Scan Waste", icon: ScanLine },
    { id: "history", label: "History", icon: History },
    { id: "learn", label: "Learn Hub", icon: BookOpen },
  ];
  return (
    <header className="glass sticky top-0 z-40 rounded-none border-x-0 border-t-0">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Brand />
        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:ml-6 sm:w-auto">
          {items.map(({ id, label, icon: Icon }) => (
            <Button variant="ghost"
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                tab === id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="size-4" /> {label}
            </Button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">{user.email}</span>
          <Button variant="outline" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={onDeleteAccount}>
            <UserX className="size-4" /> <span className="hidden sm:inline">Delete Account</span>
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" onClick={onLogout}>
            <LogOut className="size-4" /> Log Out
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Auth ---------------- */
function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    const em = email.trim().toLowerCase();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: em, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setInfo("Check your inbox to confirm your email, then log in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password });
        if (error) throw new Error(error.message.includes("confirm") ? "Please confirm your email first." : "Account not registered or invalid password. Please sign up first.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-auth flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="flex w-full justify-center">
        <div className="fade-up w-full max-w-md rounded-3xl border border-border bg-popover p-6 shadow-xl sm:p-8">
          <div className="mb-5 flex justify-center"><Brand /></div>
          <div className="grid grid-cols-2 rounded-full bg-muted p-1">
            {(["login", "signup"] as const).map((m) => (
              <Button variant="ghost" key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                className={`rounded-full py-2 text-sm font-semibold transition-all ${mode === m ? "bg-primary text-primary-foreground glow" : "text-muted-foreground hover:text-foreground"}`}>
                {m === "login" ? "Log In" : "Sign Up"}
              </Button>
            ))}
          </div>
          <h2 className="mt-6 text-xl font-bold sm:text-2xl">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Track your segregation impact over time.</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <Input className="h-11 rounded-xl" aria-label="Email" autoComplete="email" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input className="h-11 rounded-xl" aria-label="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" disabled={busy} className="glow h-11 w-full rounded-xl">{busy && <Loader2 className="size-4 animate-spin" />}{mode === "login" ? "Log In" : "Create Account"}</Button>
            {info && <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">{info}</p>}
            {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Scanner ---------------- */
function shrink(src: string, max = 768): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      const context = c.getContext("2d");
      if (!context) { rej(new Error("Image processing is unavailable.")); return; }
      context.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => rej(new Error("Could not read this image."));
    img.src = src;
  });
}

function Scanner({ onSaved }: { onSaved: (s: Scan) => void }) {
  const [mode, setMode] = useState<"upload" | "camera">("upload");
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const classify = useServerFn(classifyWaste);
  const [loading, setLoading] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef(0);
  const cameraRequestRef = useRef(0);
  const analyzingRef = useRef(false);

  const stopCam = () => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  };
  useEffect(() => () => { operationRef.current += 1; stopCam(); }, []);

  const startCam = async () => {
    stopCam();
    const request = cameraRequestRef.current;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (request !== cameraRequestRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = s;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (request !== cameraRequestRef.current) return;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => { stopCam(); toast.error("Camera preview could not start."); });
        }
      });
    } catch {
      if (request !== cameraRequestRef.current) return;
      toast.error("Camera access was denied or is unavailable.");
    }
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const context = c.getContext("2d");
    if (!context || !v.videoWidth || !v.videoHeight) { toast.error("Camera is not ready yet."); return; }
    context.drawImage(v, 0, 0);
    setImage(await shrink(c.toDataURL("image/jpeg", 0.9)));
    stopCam();
  };

  const onFile = (f?: File) => {
    if (!f || analyzingRef.current) return;
    if (!f.type.startsWith("image/")) { toast.error("Please choose an image file."); return; }
    const operation = ++operationRef.current;
    setImage(null); setResult(null);
    const r = new FileReader();
    r.onload = async () => {
      try {
        if (typeof r.result !== "string") throw new Error("Could not read this image.");
        const processed = await shrink(r.result);
        if (operation === operationRef.current) setImage(processed);
      } catch (e) { if (operation === operationRef.current) toast.error((e as Error).message); }
    };
    r.onerror = () => { if (operation === operationRef.current) toast.error("Could not read this image."); };
    r.readAsDataURL(f);
  };

  const analyze = async () => {
    if (!image || analyzingRef.current) return;
    const operation = ++operationRef.current;
    analyzingRef.current = true;
    setLoading(true); setFailure(null);
    try {
      const res = await classify({ data: { image } });
      if (operation !== operationRef.current) return;
      onSaved(res);
      setResult(res);
      if (res.category === "uncertain") toast.warning("Low confidence — please rescan."); else toast.success("Classified and saved.");
    } catch (e) {
      if (operation === operationRef.current) setFailure((e as Error).message || "Analysis failed. Please try again.");
    } finally {
      analyzingRef.current = false;
      if (operation === operationRef.current) setLoading(false);
    }
  };

  const reset = () => {
    if (analyzingRef.current) return;
    operationRef.current += 1;
    stopCam();
    setImage(null);
    setResult(null); setFailure(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const switchMode = (m: "upload" | "camera") => { reset(); setMode(m); };

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Waste Vision Scanner</h1>
          <p className="mt-1 text-muted-foreground">Upload or capture a photo — we'll tell you which bin it goes in.</p>
        </div>
        {result && <Button onClick={reset} size="lg" className="fade-up rounded-full"><RotateCcw className="size-4" /> New Scan</Button>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <div className="mb-5 grid grid-cols-2 rounded-full bg-muted p-1">
            {(["upload", "camera"] as const).map((m) => (
              <Button variant="ghost" disabled={loading} key={m} onClick={() => switchMode(m)}
                className={`flex items-center justify-center gap-2 rounded-full py-2 text-sm font-medium transition-all ${mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>
                {m === "upload" ? <Upload className="size-4" /> : <Camera className="size-4" />}
                {m === "upload" ? "File Upload" : "Live Camera"}
              </Button>
            ))}
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/50">
            {image ? (
              <img src={image} alt="Waste item preview" className="size-full object-cover" />
            ) : mode === "camera" && camOn ? (
              <video ref={videoRef} playsInline muted className="size-full object-cover" />
            ) : mode === "upload" ? (
              <button onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
                className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground transition-colors hover:text-primary">
                <Upload className="size-10" /><span className="font-medium">Click or drop an image</span>
              </button>
            ) : (
              <button onClick={startCam} className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground transition-colors hover:text-primary">
                <Camera className="size-10" /><span className="font-medium">Start camera</span>
              </button>
            )}
            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-foreground/40 backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-medium"><Loader2 className="size-4 animate-spin" /> Analyzing…</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

          <div className="mt-5 flex gap-3">
            {mode === "camera" && camOn && !image && <Button className="flex-1 rounded-xl" onClick={capture}><Camera className="size-4" /> Capture</Button>}
            {image && !result && (
              <Button className="h-11 flex-1 rounded-xl" onClick={analyze} disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Analyze Waste
              </Button>
            )}
            {image && !result && !loading && <Button variant="outline" className="h-11 rounded-xl" onClick={reset}>Clear</Button>}
          </div>
        </div>

        {result ? <ResultCard r={result} /> : failure ? (
          <div role="alert" className="glass flex flex-col items-center justify-center rounded-3xl p-10 text-center">
            <AlertTriangle className="size-12 text-destructive" />
            <p className="mt-4 font-semibold">Analysis failed</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">{failure}</p>
            <p className="mt-2 text-xs text-muted-foreground">No result was saved.</p>
          </div>
        ) : (
          <div className="glass flex flex-col items-center justify-center rounded-3xl p-10 text-center text-muted-foreground">
            <ScanLine className="size-12 text-primary" />
            <p className="mt-4 max-w-xs">Your classification, confidence score and disposal steps will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryBadge({ c }: { c: ScanResult["category"] }) {
  const b = BINS[c];
  return <span className={`${b.tone} inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-primary-foreground`}>{b.label} · {b.bin}</span>;
}

function ResultCard({ r }: { r: ScanResult }) {
  return (
    <div className="glass fade-up rounded-3xl p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detected item</p>
      <h2 className="mt-1 text-2xl font-bold">{r.item}</h2>
      <div className="mt-3"><CategoryBadge c={r.category} /></div>
      <p className="mt-2 text-sm font-medium text-primary">{r.bin}</p>
      {r.category === "uncertain" && <p role="status" className="mt-3 flex gap-2 rounded-xl border border-border bg-muted p-3 text-sm"><HelpCircle className="size-4 shrink-0" /> The model isn't confident enough to recommend a bin. Retake the photo.</p>}
      <p className="mt-2 text-xs text-muted-foreground">Engine: {r.source === "python" ? "Python FastAPI service" : "Built-in vision AI"}</p>
      <div className="mt-5">
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Confidence</span><span className="font-semibold">{r.confidence}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="bg-ocean h-full rounded-full transition-all duration-700" style={{ width: `${r.confidence}%` }} /></div>
      </div>
      <div className="mt-5 rounded-2xl bg-secondary/70 p-4 text-sm"><p className="mb-1 font-semibold">Why this bin?</p><p className="text-secondary-foreground">{r.reasoning}</p></div>
      <p className="mt-5 font-semibold">Disposal guidance</p>
      <ol className="mt-2 space-y-2">
        {r.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{s}</li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ history }: { history: Scan[] }) {
  const s = stats(history);
  const cards = [
    { label: "Total Scans", value: s.total, icon: ScanLine, tone: "bg-ocean" },
    { label: "Organic", value: s.organic, icon: Leaf, tone: "bg-bin-green" },
    { label: "Recyclable", value: s.recyclable, icon: Recycle, tone: "bg-bin-blue" },
    { label: "Hazardous", value: s.hazardous, icon: AlertTriangle, tone: "bg-bin-red" },
    { label: "Residual", value: s.residual, icon: Trash2, tone: "bg-bin-black" },
    { label: "Uncertain", value: s.uncertain, icon: HelpCircle, tone: "bg-muted-foreground" },
  ];
  return (
    <section>
      <h1 className="text-3xl font-bold">Eco Dashboard</h1>
      <p className="mt-1 text-muted-foreground">Your segregation impact at a glance.</p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="glass rounded-3xl p-5 transition-transform hover:-translate-y-1">
            <span className={`${tone} grid size-10 place-items-center rounded-xl text-primary-foreground`}><Icon className="size-5" /></span>
            <p className="mt-4 text-3xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {s.total > 0 && (
        <div className="glass mt-6 rounded-3xl p-6">
          <p className="font-semibold">Category split</p>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-muted">
            {cards.slice(1).map((c) => c.value > 0 && <div key={c.label} className={c.tone} style={{ width: `${(c.value / s.total) * 100}%` }} title={c.label} />)}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {cards.slice(1).map((c) => <li key={c.label} className="flex items-center gap-2"><span className={`${c.tone} size-3 rounded-full`} />{c.label}: {c.value} ({Math.round((c.value / s.total) * 100)}%)</li>)}
          </ul>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Gauge className="size-4" /> Average confidence of classified scans: {s.avgConfidence}%</p>
        </div>
      )}
      {history.length > 0 && (
        <div className="glass mt-6 rounded-3xl p-6">
          <p className="font-semibold">Recent scans</p>
          <ul className="mt-3 divide-y divide-border">
            {history.slice(0, 5).map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-3">
                <img src={h.image} alt="" className="size-12 rounded-xl object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{h.item}</p><p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</p></div>
                <CategoryBadge c={h.category} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------------- History ---------------- */
function HistoryView({ history, onDelete, onClearAll }: { history: Scan[]; onDelete: (id: string) => void; onClearAll: () => void }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Scan History</h1>
          <p className="mt-1 text-muted-foreground">{history.length} scan{history.length === 1 ? "" : "s"} saved to your account.</p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" className="rounded-full text-destructive hover:text-destructive" onClick={onClearAll}>
            <Trash2 className="size-4" /> Clear All History
          </Button>
        )}
      </div>
      {history.length === 0 ? (
        <div className="glass mt-6 rounded-3xl p-10 text-center text-muted-foreground">No scans yet — head to Scan Waste to start.</div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {history.map((h) => (
            <article key={h.id} className="glass overflow-hidden rounded-3xl">
              <div className="relative">
                <img src={h.image} alt={h.item} className="aspect-video w-full object-cover" />
                <Button variant="destructive" size="icon" aria-label={`Delete scan of ${h.item}`}
                  className="absolute right-3 top-3 size-9 rounded-full shadow-md" onClick={() => onDelete(h.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge c={h.category} />
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                </div>
                <h3 className="mt-3 font-semibold">{h.item}</h3>
                <p className="text-sm font-medium text-primary">{h.bin}</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {h.steps.slice(0, 3).map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- Learn ---------------- */
function Learn() {
  const bins = [
    { tone: "bg-bin-green", icon: Leaf, title: "Green Bin", sub: "Organic / Wet Waste", items: ["Food scraps", "Fruit & vegetable peels", "Tea leaves, flowers", "Natural garden waste"] },
    { tone: "bg-bin-blue", icon: Recycle, title: "Blue Bin", sub: "Dry Recyclable Waste", items: ["Clean plastic bottles", "Paper & newspapers", "Cardboard boxes", "Rinsed metal cans"] },
    { tone: "bg-bin-red", icon: Cpu, title: "Red Bin", sub: "Hazardous & E-Waste", items: ["Aerosol spray cans", "Batteries", "Circuit boards & phones", "Chemical tins, paint"] },
    { tone: "bg-bin-black", icon: Trash2, title: "Black Bin", sub: "Residual Waste", items: ["Multi-layer wrappers", "Biscuit & chip packets", "Non-recyclable laminates", "Soiled tissues"] },
  ];
  const [open, setOpen] = useState<string | null>("Green Bin");
  return (
    <section>
      <h1 className="text-3xl font-bold">Segregation Rules Hub</h1>
      <p className="mt-1 text-muted-foreground">Tap a bin to see what belongs inside.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {bins.map(({ tone, icon: Icon, title, sub, items }) => {
          const active = open === title;
          return (
            <button key={title} onClick={() => setOpen(active ? null : title)} className={`glass rounded-3xl p-6 text-left transition-all hover:-translate-y-1 ${active ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-center gap-4">
                <span className={`${tone} grid size-12 place-items-center rounded-2xl text-primary-foreground`}><Icon className="size-6" /></span>
                <div><h3 className="text-lg font-bold">{title}</h3><p className="text-sm text-muted-foreground">{sub}</p></div>
              </div>
              {active && (
                <ul className="fade-up mt-5 grid grid-cols-2 gap-2">
                  {items.map((i) => <li key={i} className="rounded-xl bg-secondary/70 px-3 py-2 text-sm">{i}</li>)}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
