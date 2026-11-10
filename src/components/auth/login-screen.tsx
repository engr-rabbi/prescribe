"use client";

// Login screen — split layout with teal brand panel and a professional sign-in card.

import { useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Lock,
  Mail,
  MousePointerClick,
  Pill,
  Stethoscope,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { isRemote } from "@/lib/remote-client";
import { useI18n } from "@/lib/i18n";
import type { SessionUser } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginScreenProps {
  onSuccess: (user: SessionUser) => void;
}

// Local EN/BN labels for strings missing from the shared i18n DICT.
type LMap = { en: string; bn: string };

const L: Record<string, LMap> = {
  tagline: {
    en: "Smart Digital Prescription Management System",
    bn: "স্মার্ট ডিজিটাল প্রেসক্রিপশন ব্যবস্থাপনা সিস্টেম",
  },
  feature1: { en: "Click-to-Select prescribing", bn: "ক্লিক করে নির্বাচন করে প্রেসক্রিপশন" },
  feature2: { en: "21,000+ medicine database", bn: "২১,০০০+ ঔষধের ডাটাবেস" },
  feature3: { en: "A4 print & PDF export", bn: "A4 প্রিন্ট ও পিডিএফ এক্সপোর্ট" },
  welcome: { en: "Welcome back", bn: "স্বাগতম" },
  forgot: { en: "Forgot password?", bn: "পাসওয়ার্ড ভুলে গেছেন?" },
  contactAdmin: {
    en: "Please contact the system administrator to reset your password.",
    bn: "পাসওয়ার্ড রিসেট করতে অনুগ্রহ করে সিস্টেম প্রশাসকের সাথে যোগাযোগ করুন।",
  },
  demoTitle: { en: "Demo accounts", bn: "ডেমো অ্যাকাউন্ট" },
  signingIn: { en: "Signing in…", bn: "সাইন ইন হচ্ছে…" },
  oops: { en: "Sign-in failed", bn: "সাইন ইন ব্যর্থ" },
  showPw: { en: "Show password", bn: "পাসওয়ার্ড দেখান" },
  hidePw: { en: "Hide password", bn: "পাসওয়ার্ড লুকান" },
};

const DEMO_ACCOUNTS: { email: string; password: string; role: LMap }[] = [
  { email: "doctor@rx.local", password: "doctor123", role: { en: "Doctor", bn: "ডাক্তার" } },
  { email: "admin@rx.local", password: "admin123", role: { en: "Admin", bn: "অ্যাডমিন" } },
  { email: "assistant@rx.local", password: "assistant123", role: { en: "Assistant", bn: "সহকারী" } },
];

const FEATURES: { icon: typeof Pill; label: LMap }[] = [
  { icon: MousePointerClick, label: L.feature1 },
  { icon: Pill, label: L.feature2 },
  { icon: FileText, label: L.feature3 },
];

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const { lang, t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const s = (m: LMap) => m[lang];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(false);
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      toast.success(`${s(L.welcome)}, ${res.user.name}`);
      onSuccess(res.user);
    } catch (e) {
      setError(true);
      // Google build: surface real problems (backend unreachable, locked account …) instead of
      // always claiming the credentials are wrong
      const msg = e instanceof Error ? e.message : "";
      toast.error(isRemote && msg && !/Invalid email or password/i.test(msg) ? msg : t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/30 lg:flex-row">
      {/* ---------- Brand panel ---------- */}
      <div className="relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br from-teal-700 to-emerald-600 px-6 py-10 text-white lg:w-[52%] lg:py-0">
        {/* decorative rings */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute top-1/3 left-10 hidden size-16 rounded-2xl bg-white/10 lg:block" />

        <div className="relative z-10 w-full max-w-md">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/15 shadow-inner backdrop-blur-sm">
              <Stethoscope className="size-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t("appName")}</h1>
              <p className="mt-1 text-sm text-white/80">{s(L.tagline)}</p>
            </div>
          </div>

          <ul className="mt-10 hidden space-y-4 lg:block">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label.en} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4.5" />
                </span>
                <span className="text-sm font-medium text-white/90">{s(label)}</span>
              </li>
            ))}
          </ul>

          <p className="mt-10 hidden text-xs leading-relaxed text-white/60 lg:block">
            © {new Date().getFullYear()} {t("appName")} · {t("appTagline")}
          </p>
        </div>
      </div>

      {/* ---------- Sign-in card ---------- */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 rounded-xl border bg-card p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-700 to-emerald-600 text-white">
                <Stethoscope className="size-5" />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">{t("appName")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("appTagline")}</p>
              </div>
            </div>

            <h2 className="text-xl font-semibold tracking-tight">{t("signIn")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s(L.welcome)}</p>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <Lock className="size-4" />
                <AlertTitle>{s(L.oops)}</AlertTitle>
                <AlertDescription>{t("invalidCredentials")}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t("email")}</Label>
                <div className="relative">
                  <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="doctor@rx.local"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password">{t("password")}</Label>
                  <button
                    type="button"
                    onClick={() => toast.info(s(L.contactAdmin))}
                    className="text-xs font-medium text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
                  >
                    {s(L.forgot)}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="pr-10 pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? s(L.hidePw) : s(L.showPw)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-teal-700 to-emerald-600 text-white hover:from-teal-800 hover:to-emerald-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {s(L.signingIn)}
                  </>
                ) : (
                  t("login")
                )}
              </Button>
            </form>
          </div>

          {/* Demo accounts hint — only for the local demo build, never when connected to Google */}
          {!isRemote ? (
          <div className="rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <p className="mb-1.5 font-medium text-foreground/70">{s(L.demoTitle)}</p>
            <ul className="space-y-1 font-mono">
              {DEMO_ACCOUNTS.map((acc) => (
                <li key={acc.email} className="flex flex-wrap items-center gap-x-2">
                  <span>{acc.email}</span>
                  <span className="text-muted-foreground/60">/</span>
                  <span>{acc.password}</span>
                  <span className="font-sans text-[11px] text-teal-700 dark:text-teal-400">
                    ({s(acc.role)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default LoginScreen;
