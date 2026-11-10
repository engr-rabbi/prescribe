"use client";

import React, { useState } from "react";
import {
  FilePlus2,
  FileText,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { useI18n, type DictKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore, type View } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LanguageToggle } from "@/components/shell/language-toggle";

interface NavItem {
  view: View;
  labelKey: DictKey;
  icon: LucideIcon;
  superAdminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { view: "dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { view: "prescription-editor", labelKey: "newPrescription", icon: FilePlus2 },
  { view: "patients", labelKey: "patients", icon: Users },
  { view: "prescriptions", labelKey: "prescriptions", icon: FileText },
  { view: "profile", labelKey: "profile", icon: Stethoscope },
  { view: "templates", labelKey: "templates", icon: LayoutTemplate },
  { view: "admin", labelKey: "admin", icon: ShieldCheck, superAdminOnly: true },
];

const ROLE_BADGE_CLASS: Record<string, string> = {
  SUPER_ADMIN: "border-transparent bg-emerald-100 text-emerald-800",
  DOCTOR: "border-transparent bg-teal-100 text-teal-800",
  ASSISTANT: "border-transparent bg-slate-100 text-slate-700",
};

const SIDEBAR_TEXT = {
  collapse: { en: "Collapse sidebar", bn: "সাইডবার ছোট করুন" },
  expand: { en: "Expand sidebar", bn: "সাইডবার বড় করুন" },
  navigation: { en: "Open navigation", bn: "মেনু খুলুন" },
} as const;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Application shell: collapsible desktop sidebar, mobile sheet nav, top bar. */
export function AppShell({ children }: { children?: React.ReactNode }) {
  const { t, lang } = useI18n();
  const { view, setView, user, openEditor, setUser, setAuthChecked } = useAppStore();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = NAV_ITEMS.filter((i) => !i.superAdminOnly || user?.role === "SUPER_ADMIN");

  const navigate = (item: NavItem) => {
    if (item.labelKey === "newPrescription") {
      openEditor(null, null);
    } else {
      setView(item.view);
    }
    setMobileOpen(false);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Local session is cleared regardless of the response.
    }
    setUser(null);
    setAuthChecked(false);
    setView("dashboard");
  };

  const roleLabel = user
    ? user.role === "SUPER_ADMIN"
      ? t("superAdmin")
      : user.role === "DOCTOR"
        ? t("doctor")
        : t("assistant")
    : "";

  const toggleLabel = collapsed ? SIDEBAR_TEXT.expand[lang] : SIDEBAR_TEXT.collapse[lang];

  /** One navigation entry. `rail` = icon-only desktop rail (label moves into a tooltip). */
  const renderNavButtons = (onNavigate: (item: NavItem) => void, rail: boolean) => (
    <>
      {items.map((item) => {
        const active = view === item.view;
        const Icon = item.icon;
        const label = t(item.labelKey);
        const button = (
          <button
            key={item.view}
            type="button"
            onClick={() => onNavigate(item)}
            aria-current={active ? "page" : undefined}
            aria-label={rail ? label : undefined}
            className={cn(
              "group relative flex w-full items-center rounded-lg py-2.5 text-sm font-medium",
              "transition-[background-color,color,padding,gap] duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-1",
              rail ? "justify-center gap-0 px-0" : "gap-3 px-3",
              active
                ? "bg-teal-50 text-teal-800"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            {/* active marker */}
            <span
              aria-hidden
              className={cn(
                "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-teal-600",
                "transition-opacity duration-200",
                active ? "opacity-100" : "opacity-0"
              )}
            />
            <Icon
              className={cn(
                "size-5 shrink-0 transition-colors duration-200",
                active ? "text-teal-600" : "text-slate-400 group-hover:text-slate-600"
              )}
            />
            <span
              className={cn(
                "truncate whitespace-nowrap transition-[max-width,opacity] duration-300 ease-in-out motion-reduce:transition-none",
                rail ? "max-w-0 opacity-0" : "max-w-[11rem] opacity-100"
              )}
              aria-hidden={rail || undefined}
            >
              {label}
            </span>
          </button>
        );
        if (!rail) return button;
        return (
          <Tooltip key={item.view}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-slate-50">
        {/* Desktop sidebar (collapsible) */}
        <aside
          id="app-sidebar"
          data-collapsed={collapsed}
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-slate-200 bg-white lg:flex",
            "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
            collapsed ? "w-[4.5rem]" : "w-64"
          )}
        >
          <div
            className={cn(
              "flex h-16 shrink-0 items-center border-b border-slate-200",
              collapsed ? "justify-center px-0" : "gap-2.5 px-4"
            )}
          >
            {!collapsed ? (
              <>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                  <Stethoscope className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold leading-tight text-slate-900">
                    {t("appName")}
                  </p>
                  <p className="truncate text-[11px] leading-tight text-slate-500">
                    {t("appTagline")}
                  </p>
                </div>
              </>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  aria-controls="app-sidebar"
                  className="size-9 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                >
                  {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {toggleLabel}
              </TooltipContent>
            </Tooltip>
          </div>

          <nav
            className={cn(
              "flex-1 space-y-1 overflow-y-auto overflow-x-hidden py-4 transition-[padding] duration-300",
              collapsed ? "px-2.5" : "px-3"
            )}
          >
            {renderNavButtons(navigate, collapsed)}
          </nav>

          <div className={cn("border-t border-slate-200 p-3", collapsed && "px-2.5")}>
            {user ? (
              collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="mx-auto flex size-10 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700"
                      aria-label={user.name}
                    >
                      {initialsOf(user.name)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    {user.name}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                    {initialsOf(user.name)}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{user.email}</p>
                  </div>
                </div>
              )
            ) : null}
          </div>
        </aside>

        {/* Main column */}
        <div
          className={cn(
            "flex min-h-screen flex-col transition-[padding] duration-300 ease-in-out motion-reduce:transition-none",
            collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"
          )}
        >
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-white/75 sm:gap-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              {/* Mobile / tablet hamburger + sheet nav */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label={SIDEBAR_TEXT.navigation[lang]}
                  >
                    <Menu className="size-5 text-slate-600" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 gap-0 p-0">
                  <SheetHeader className="border-b border-slate-200">
                    <SheetTitle className="flex items-center gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-teal-600 text-white">
                        <Stethoscope className="size-5" />
                      </span>
                      <span className="text-base">{t("appName")}</span>
                    </SheetTitle>
                  </SheetHeader>
                  <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                    {renderNavButtons(navigate, false)}
                  </nav>
                  <div className="border-t border-slate-200 p-4">
                    <LanguageToggle />
                  </div>
                </SheetContent>
              </Sheet>

              {/* App name (mobile) */}
              <div className="flex items-center gap-2 lg:hidden">
                <span className="flex size-8 items-center justify-center rounded-lg bg-teal-600 text-white">
                  <Stethoscope className="size-4" />
                </span>
                <span className="truncate text-sm font-semibold text-slate-900">
                  {t("appName")}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <LanguageToggle />
              <Separator orientation="vertical" className="hidden !h-6 sm:block" />
              {user ? (
                <div className="hidden min-w-0 items-center gap-2 sm:flex">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                    {initialsOf(user.name)}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="max-w-[140px] truncate text-sm font-medium text-slate-900">
                      {user.name}
                    </p>
                    <Badge
                      className={cn(
                        "mt-0.5 px-1.5 py-0 text-[10px]",
                        ROLE_BADGE_CLASS[user.role] ?? ROLE_BADGE_CLASS.ASSISTANT
                      )}
                    >
                      {roleLabel}
                    </Badge>
                  </div>
                </div>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleLogout()}
                title={t("logout")}
                aria-label={t("logout")}
                className="hover:bg-rose-50 hover:text-rose-600"
              >
                <LogOut className="size-4 text-slate-500" />
              </Button>
            </div>
          </header>

          {/* Page content — the prescription editor goes full-bleed for the split view */}
          <main
            className={cn(
              "flex-1",
              view === "prescription-editor"
                ? "h-[calc(100vh-4rem)] flex-none overflow-hidden p-0 sm:p-0 lg:p-0"
                : "p-4 sm:p-6 lg:p-8"
            )}
          >
            <div
              className={cn(
                "mx-auto w-full",
                view === "prescription-editor" ? "h-full max-w-none" : "max-w-7xl"
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default AppShell;
