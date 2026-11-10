"use client";

// Template settings — pick one of the 3 built-in prescription templates and
// customize accent color, fonts, header layout, toggles and body columns.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, LayoutTemplate, Loader2, Save, Sparkles } from "lucide-react";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { ACCENT_COLORS, TEMPLATE_META } from "@/lib/constants";
import { DEFAULT_TEMPLATE_CONFIG, type DoctorProfileDTO, type TemplateConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface TemplateSettingsViewProps {
  className?: string;
}

type TemplateKey = (typeof TEMPLATE_META)[number]["key"];

// Concrete local config state (mirrors TemplateConfig but fully required).
interface ConfigState {
  accentColor: string;
  fontFamily: "serif" | "sans" | "mixed";
  headerLayout: "centered" | "split" | "banner";
  showLogo: boolean;
  showPhoto: boolean;
  showWatermark: boolean;
  columnLayout: "two-col" | "single-col";
}

const DEFAULTS: ConfigState = {
  accentColor: DEFAULT_TEMPLATE_CONFIG.accentColor ?? "#0f766e",
  fontFamily: DEFAULT_TEMPLATE_CONFIG.fontFamily ?? "serif",
  headerLayout: DEFAULT_TEMPLATE_CONFIG.headerLayout ?? "centered",
  showLogo: DEFAULT_TEMPLATE_CONFIG.showLogo ?? true,
  showPhoto: DEFAULT_TEMPLATE_CONFIG.showPhoto ?? false,
  showWatermark: DEFAULT_TEMPLATE_CONFIG.showWatermark ?? false,
  columnLayout: DEFAULT_TEMPLATE_CONFIG.columnLayout ?? "two-col",
};

// Local EN/BN labels for strings missing from the shared i18n DICT.
type LMap = { en: string; bn: string };

const L: Record<string, LMap> = {
  chooseTitle: { en: "Choose a Template", bn: "টেমপ্লেট নির্বাচন করুন" },
  chooseDesc: {
    en: "Pick the base layout of your prescription pad — changes apply to new prescriptions.",
    bn: "আপনার প্রেসক্রিপশন প্যাডের ভিত্তি লেআউট বেছে নিন — পরিবর্তন নতুন প্রেসক্রিপশনে প্রযোজ্য হবে।",
  },
  customizeTitle: { en: "Customize Active Template", bn: "সক্রিয় টেমপ্লেট কাস্টমাইজ করুন" },
  customizeDesc: {
    en: "Fine-tune colors, typography and visibility for the selected template.",
    bn: "নির্বাচিত টেমপ্লেটের রঙ, টাইপোগ্রাফি ও দৃশ্যমানতা ঠিক করুন।",
  },
  accentColor: { en: "Accent Color", bn: "অ্যাকসেন্ট রঙ" },
  fontFamily: { en: "Font Family", bn: "ফন্ট পরিবার" },
  serif: { en: "Serif", bn: "সেরিফ" },
  sans: { en: "Sans", bn: "স্যান্স" },
  mixed: { en: "Mixed", bn: "মিক্সড" },
  headerLayout: { en: "Header Layout", bn: "হেডার লেআউট" },
  headerCentered: { en: "Centered", bn: "কেন্দ্রীভূত" },
  headerSplit: { en: "Split", bn: "বিভক্ত" },
  headerBanner: { en: "Banner", bn: "ব্যানার" },
  columnLayout: { en: "Body Columns", bn: "বডি কলাম" },
  twoCol: { en: "Two columns", bn: "দুই কলাম" },
  singleCol: { en: "Single column", bn: "এক কলাম" },
  showLogo: { en: "Show logo", bn: "লোগো দেখান" },
  showPhoto: { en: "Show photo", bn: "ছবি দেখান" },
  showWatermark: { en: "Show watermark", bn: "ওয়াটারমার্ক দেখান" },
  activeBadge: { en: "Active", bn: "সক্রিয়" },
  savingSettings: { en: "Saving…", bn: "সংরক্ষণ হচ্ছে…" },
  loadingTemplates: { en: "Loading templates…", bn: "টেমপ্লেট লোড হচ্ছে…" },
};

interface TemplateRow {
  id: string;
  name: string;
  templateKey: string;
  config: TemplateConfig;
  isDefault: boolean;
}

/** Tiny A4 wireframe showing the header/columns differences between templates. */
function TemplateThumb({ variant, accent }: { variant: TemplateKey; accent: string }) {
  const line = (w: string, tone = "bg-muted-foreground/25") => (
    <div className={cn("h-1 rounded-full", tone, w)} />
  );
  return (
    <div className="flex h-28 w-20 shrink-0 flex-col overflow-hidden rounded-md border bg-white shadow-sm">
      {variant === "classic" ? (
        <div className="flex flex-col justify-center gap-1 px-2 py-2" style={{ backgroundColor: accent }}>
          <div className="h-1 w-10 rounded-full bg-white/90" />
          <div className="h-1 w-14 rounded-full bg-white/60" />
        </div>
      ) : variant === "clinical" ? (
        <div className="flex items-center gap-2 border-b-2 px-2 py-2" style={{ borderColor: accent }}>
          <div className="size-5 shrink-0 rounded-sm bg-muted-foreground/20" />
          <div className="flex flex-col gap-1">
            <div className="h-1 w-9 rounded-full bg-muted-foreground/40" />
            <div className="h-1 w-12 rounded-full bg-muted-foreground/25" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 border-b-2 px-2 py-2" style={{ borderColor: accent }}>
          <div className="size-3.5 rounded-full" style={{ backgroundColor: accent }} />
          <div className="h-1 w-12 rounded-full bg-muted-foreground/40" />
          <div className="h-1 w-16 rounded-full bg-muted-foreground/25" />
        </div>
      )}
      <div className="flex flex-1 gap-2 p-2">
        <div className="flex flex-1 flex-col gap-1">
          {line("w-full", "bg-teal-900/20")}
          {line("w-4/5")}
          {line("w-full")}
          {line("w-3/5")}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {line("w-full", "bg-teal-900/20")}
          {line("w-full")}
          {line("w-4/5")}
          {line("w-1/2")}
        </div>
      </div>
      <div className="flex items-center justify-between px-2 pb-2">
        {line("w-8")}
        {line("w-6")}
      </div>
    </div>
  );
}

export function TemplateSettingsView({ className }: TemplateSettingsViewProps) {
  const { lang, t } = useI18n();
  const s = useCallback((m: LMap) => m[lang], [lang]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [profile, setProfile] = useState<DoctorProfileDTO | null>(null);
  const [activeKey, setActiveKey] = useState<TemplateKey>("modern");
  const [config, setConfig] = useState<ConfigState>(DEFAULTS);

  // Resolve the initial config for a template key: saved template → profile fields → defaults.
  const resolveConfig = useCallback(
    (key: TemplateKey, rows: TemplateRow[], prof: DoctorProfileDTO | null): ConfigState => {
      const saved = rows.find((r) => r.templateKey === key)?.config;
      if (saved) {
        return {
          accentColor: saved.accentColor ?? DEFAULTS.accentColor,
          fontFamily: saved.fontFamily ?? DEFAULTS.fontFamily,
          headerLayout: saved.headerLayout ?? DEFAULTS.headerLayout,
          showLogo: saved.showLogo ?? DEFAULTS.showLogo,
          showPhoto: saved.showPhoto ?? DEFAULTS.showPhoto,
          showWatermark: saved.showWatermark ?? DEFAULTS.showWatermark,
          columnLayout: saved.columnLayout ?? DEFAULTS.columnLayout,
        };
      }
      if (prof) {
        return {
          ...DEFAULTS,
          accentColor: prof.themeColor || DEFAULTS.accentColor,
          fontFamily: (prof.fontFamily as ConfigState["fontFamily"]) || DEFAULTS.fontFamily,
          headerLayout: (prof.headerLayout as ConfigState["headerLayout"]) || DEFAULTS.headerLayout,
          showLogo: prof.showLogo,
          showPhoto: prof.showPhoto,
        };
      }
      return DEFAULTS;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tplRes, profRes] = await Promise.all([api.getTemplates(), api.getDoctorProfile()]);
        if (cancelled) return;
        const rows: TemplateRow[] = tplRes.templates;
        const prof = profRes.profile;
        setTemplates(rows);
        setProfile(prof);
        const key = (
          TEMPLATE_META.some((m) => m.key === prof.activeTemplate) ? prof.activeTemplate : "modern"
        ) as TemplateKey;
        setActiveKey(key);
        setConfig(resolveConfig(key, rows, prof));
      } catch {
        toast.error(t("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveConfig, t]);

  async function handleSelectTemplate(key: TemplateKey) {
    if (key === activeKey || switching) return;
    setSwitching(key);
    setActiveKey(key);
    setConfig(resolveConfig(key, templates, profile));
    try {
      await api.updateDoctorProfile({ activeTemplate: key });
      setProfile((p) => (p ? { ...p, activeTemplate: key } : p));
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setSwitching(null);
    }
  }

  async function handleSaveSettings() {
    if (saving) return;
    setSaving(true);
    try {
      const templateConfig: TemplateConfig = {
        accentColor: config.accentColor,
        fontFamily: config.fontFamily,
        headerLayout: config.headerLayout,
        showLogo: config.showLogo,
        showPhoto: config.showPhoto,
        showWatermark: config.showWatermark,
        columnLayout: config.columnLayout,
      };
      const existing = templates.find((r) => r.templateKey === activeKey);
      await api.saveTemplate({
        id: existing?.id,
        name: existing?.name ?? `${activeKey} custom`,
        templateKey: activeKey,
        config: templateConfig,
        isDefault: true,
      });
      await api.updateDoctorProfile({
        themeColor: config.accentColor,
        fontFamily: config.fontFamily,
        headerLayout: config.headerLayout,
        showLogo: config.showLogo,
        showPhoto: config.showPhoto,
      });
      const tplRes = await api.getTemplates();
      setTemplates(tplRes.templates);
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setSaving(false);
    }
  }

  const activeMeta = useMemo(
    () => TEMPLATE_META.find((m) => m.key === activeKey) ?? TEMPLATE_META[0],
    [activeKey]
  );

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-24 text-muted-foreground", className)}>
        <Loader2 className="mr-2 size-5 animate-spin text-teal-700" />
        {s(L.loadingTemplates)}
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* ---------- Template picker ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="size-4 text-teal-700 dark:text-teal-400" />
            {s(L.chooseTitle)}
          </CardTitle>
          <CardDescription>{s(L.chooseDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_META.map((meta) => {
            const isActive = meta.key === activeKey;
            return (
              <button
                key={meta.key}
                type="button"
                onClick={() => handleSelectTemplate(meta.key)}
                disabled={switching !== null}
                className={cn(
                  "group relative flex gap-4 rounded-xl border p-4 text-left transition-all hover:border-teal-600/50 hover:shadow-md disabled:cursor-wait disabled:opacity-70",
                  isActive ? "border-teal-600 ring-2 ring-teal-600/30" : "border-border bg-card"
                )}
              >
                <TemplateThumb variant={meta.key} accent={config.accentColor} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{lang === "bn" ? meta.nameBn : meta.name}</p>
                    {isActive && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
                        <Check className="size-3" />
                        {s(L.activeBadge)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {meta.description}
                  </p>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* ---------- Customization ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-teal-700 dark:text-teal-400" />
            {s(L.customizeTitle)}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {lang === "bn" ? activeMeta.nameBn : activeMeta.name}
            </span>
          </CardTitle>
          <CardDescription>{s(L.customizeDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Accent color */}
          <div className="space-y-2">
            <Label>{s(L.accentColor)}</Label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_COLORS.map((c) => {
                const selected = config.accentColor.toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.name}
                    type="button"
                    aria-label={c.name}
                    title={c.name}
                    onClick={() => setConfig((p) => ({ ...p, accentColor: c.value }))}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border shadow-sm transition-transform hover:scale-110",
                      selected
                        ? "border-foreground/60 ring-2 ring-teal-600/40 ring-offset-2"
                        : "border-border"
                    )}
                    style={{ backgroundColor: c.value }}
                  >
                    {selected && <Check className="size-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Font family */}
          <div className="space-y-2">
            <Label>{s(L.fontFamily)}</Label>
            <RadioGroup
              value={config.fontFamily}
              onValueChange={(v) =>
                setConfig((p) => ({ ...p, fontFamily: v as ConfigState["fontFamily"] }))
              }
              className="flex flex-wrap gap-4"
            >
              {(
                [
                  { value: "serif", label: L.serif, cls: "font-serif" },
                  { value: "sans", label: L.sans, cls: "font-sans" },
                  { value: "mixed", label: L.mixed, cls: "font-serif italic" },
                ] as const
              ).map((opt) => (
                <Label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal transition-colors",
                    config.fontFamily === opt.value
                      ? "border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200"
                      : "hover:bg-accent"
                  )}
                >
                  <RadioGroupItem value={opt.value} />
                  <span className={opt.cls}>{s(opt.label)}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <Separator />

          {/* Layout selects + switches */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{s(L.headerLayout)}</Label>
              <Select
                value={config.headerLayout}
                onValueChange={(v) =>
                  setConfig((p) => ({ ...p, headerLayout: v as ConfigState["headerLayout"] }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="centered">{s(L.headerCentered)}</SelectItem>
                  <SelectItem value="split">{s(L.headerSplit)}</SelectItem>
                  <SelectItem value="banner">{s(L.headerBanner)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{s(L.columnLayout)}</Label>
              <Select
                value={config.columnLayout}
                onValueChange={(v) =>
                  setConfig((p) => ({ ...p, columnLayout: v as ConfigState["columnLayout"] }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="two-col">{s(L.twoCol)}</SelectItem>
                  <SelectItem value="single-col">{s(L.singleCol)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <Label htmlFor="sw-logo" className="cursor-pointer text-sm font-normal">
                {s(L.showLogo)}
              </Label>
              <Switch
                id="sw-logo"
                checked={config.showLogo}
                onCheckedChange={(v) => setConfig((p) => ({ ...p, showLogo: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <Label htmlFor="sw-photo" className="cursor-pointer text-sm font-normal">
                {s(L.showPhoto)}
              </Label>
              <Switch
                id="sw-photo"
                checked={config.showPhoto}
                onCheckedChange={(v) => setConfig((p) => ({ ...p, showPhoto: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5 sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
              <Label htmlFor="sw-watermark" className="cursor-pointer text-sm font-normal">
                {s(L.showWatermark)}
              </Label>
              <Switch
                id="sw-watermark"
                checked={config.showWatermark}
                onCheckedChange={(v) => setConfig((p) => ({ ...p, showWatermark: v }))}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="bg-gradient-to-r from-teal-700 to-emerald-600 text-white hover:from-teal-800 hover:to-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {s(L.savingSettings)}
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  {t("save")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default TemplateSettingsView;
