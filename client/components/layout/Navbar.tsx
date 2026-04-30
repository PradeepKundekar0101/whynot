"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { Search, Heart, MessageCircle, Bell, Gift, User, Settings, ShoppingBag, LogOut, Video, TrendingUp } from "lucide-react";
import { Wallet } from "lucide-react";
import { NavbarPopover } from "./NavbarPopover";

export function Navbar() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleBecomeSeller = async () => {
    if (enrolling) return;
    setEnrolling(true);
    try {
      const res = await apiFetch("/auth/enable-seller", { method: "POST" });
      if (res.ok) {
        await refreshUser();
        router.push("/seller/dashboard");
      }
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight">whatnot</Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/" className="px-3 py-1.5 text-sm font-medium rounded-full bg-black text-white">Home</Link>
            <Link href="/browse" className="px-3 py-1.5 text-sm font-medium rounded-full text-muted-foreground hover:bg-secondary">Browse</Link>
          </nav>
        </div>

        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search for anything..."
              className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary border-none text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {user.isSellerEnabled ? (
                <Link
                  href="/seller/dashboard"
                  className="hidden lg:inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Video className="h-4 w-4" />
                  Seller Dashboard
                </Link>
              ) : (
                <button
                  onClick={handleBecomeSeller}
                  disabled={enrolling}
                  className="hidden lg:inline-flex px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {enrolling ? "Enabling..." : "Become a Seller"}
                </button>
              )}
              <NavbarPopover
                icon={<Heart className="h-5 w-5" />}
                label="Saved shows"
                title="Saved shows"
              >
                <Heart className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium">No saved shows yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tap the heart on any show to save it for later.
                </p>
              </NavbarPopover>
              <NavbarPopover
                icon={<MessageCircle className="h-5 w-5" />}
                label="Messages"
                title="Messages"
              >
                <MessageCircle className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Conversations with sellers and buyers will appear here.
                </p>
              </NavbarPopover>
              <NavbarPopover
                icon={<Bell className="h-5 w-5" />}
                label="Notifications"
                title="Notifications"
              >
                <Bell className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium">You&rsquo;re all caught up</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Show reminders, win confirmations, and seller updates will land here.
                </p>
              </NavbarPopover>
              <NavbarPopover
                icon={<Gift className="h-5 w-5" />}
                label="Rewards"
                title="Rewards"
              >
                <Gift className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium">No rewards yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Earn rewards by referring friends and shopping live shows.
                </p>
              </NavbarPopover>
              <Link
                href="/wallet"
                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition-colors text-sm font-semibold"
                title="Wallet balance"
              >
                <Wallet className="h-4 w-4" />
                ${(user.walletBalance / 100).toFixed(2)}
              </Link>
              {/* Avatar with dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground"
                  title={`Logged in as ${user.username}`}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    user.displayName.charAt(0).toUpperCase()
                  )}
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-10 w-52 bg-white border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-sm font-semibold truncate">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                    </div>
                    <Link
                      href={`/profile/${user.username}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      <User className="h-4 w-4" /> Profile
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                    <Link
                      href="/orders"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      <ShoppingBag className="h-4 w-4" /> Orders
                    </Link>
                    <Link
                      href="/wallet"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary transition-colors"
                    >
                      <Wallet className="h-4 w-4" /> Wallet
                    </Link>
                    {user.isSellerEnabled && (
                      <>
                        <Link
                          href="/seller/dashboard"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary transition-colors"
                        >
                          <Video className="h-4 w-4" /> Seller Dashboard
                        </Link>
                        <Link
                          href="/seller/earnings"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary transition-colors"
                        >
                          <TrendingUp className="h-4 w-4" /> Earnings
                        </Link>
                      </>
                    )}
                    <div className="border-t border-border mt-1">
                      <button
                        onClick={() => { setMenuOpen(false); logout(); }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-secondary transition-colors w-full text-left"
                      >
                        <LogOut className="h-4 w-4" /> Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="px-4 py-1.5 text-sm font-semibold rounded-full border border-border hover:bg-secondary transition-colors">Log In</Link>
              <Link href="/signup" className="px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
