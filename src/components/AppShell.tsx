import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, Package, Users, FileText, Wallet, Truck,
  ShoppingCart, HandCoins, Boxes, BarChart3, Settings, LogOut, Menu, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", en: "Dashboard", ur: "ڈیش بورڈ", icon: LayoutDashboard, adminOnly: false },
  { to: "/invoices/new", en: "New Invoice", ur: "نئی رسید", icon: FileText, adminOnly: false },
  { to: "/customers", en: "Customers", ur: "گاہک", icon: Users, adminOnly: false },
  { to: "/payments", en: "Payments", ur: "ادائیگیاں", icon: Wallet, adminOnly: false },
  { to: "/suppliers", en: "Suppliers", ur: "سپلائر", icon: Truck, adminOnly: false },
  { to: "/purchases/new", en: "New Purchase", ur: "نئی خریداری", icon: ShoppingCart, adminOnly: false },
  { to: "/supplier-payments", en: "Supplier Pay", ur: "سپلائر ادائیگی", icon: HandCoins, adminOnly: false },
  { to: "/items", en: "Items & Prices", ur: "اشیاء", icon: Package, adminOnly: false },
  { to: "/stock", en: "Stock", ur: "اسٹاک", icon: Boxes, adminOnly: false },
  { to: "/reports", en: "Reports", ur: "رپورٹس", icon: BarChart3, adminOnly: true },
  { to: "/settings", en: "Settings", ur: "ترتیبات", icon: Settings, adminOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { isAdmin, signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = navItems.filter((i) => !i.adminOnly || isAdmin);

  const SidebarContent = (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((item) => {
        const active = location.pathname === item.to ||
          (item.to !== "/" && location.pathname.startsWith(item.to));
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <div className="flex flex-col leading-tight">
              <span>{item.en}</span>
              <span className="urdu text-xs opacity-80">{item.ur}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar shrink-0">
        <div className="h-16 flex items-center gap-2 px-5 border-b">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">W</div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">Wholesale</div>
            <div className="urdu text-xs text-muted-foreground">ہول سیل</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{SidebarContent}</div>
        <div className="p-3 border-t space-y-2">
          <div className="text-xs px-3 text-muted-foreground truncate">
            {user?.email} · {isAdmin ? "Admin" : "Staff"}
          </div>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="h-4 w-4 mr-2" /> Logout / لاگ آؤٹ
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative flex w-72 max-w-[80%] flex-col bg-sidebar border-r">
            <div className="h-16 flex items-center justify-between px-5 border-b">
              <div className="font-semibold">Menu / مینو</div>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">{SidebarContent}</div>
            <div className="p-3 border-t">
              <Button variant="outline" size="sm" className="w-full" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
                <LogOut className="h-4 w-4 mr-2" /> Logout
              </Button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 border-b bg-background/80 backdrop-blur no-print">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2"><Menu className="h-5 w-5" /></button>
          <div className="font-semibold">Wholesale <span className="urdu text-sm text-muted-foreground">ہول سیل</span></div>
          <div className="w-9" />
        </header>
        <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
      </div>
    </div>
  );
}
