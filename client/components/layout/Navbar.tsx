"use client";

import Link from "next/link";
import { Search, Heart, MessageCircle, Bell, Gift } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            whatnot
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/" className="px-3 py-1.5 text-sm font-medium rounded-full bg-black text-white">
              Home
            </Link>
            <Link href="/browse" className="px-3 py-1.5 text-sm font-medium rounded-full text-muted-foreground hover:bg-secondary">
              Browse
            </Link>
          </nav>
        </div>

        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for anything..."
              className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary border-none text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="hidden lg:inline-flex px-4 py-1.5 text-sm font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
            Become a Seller
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <Heart className="h-5 w-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <MessageCircle className="h-5 w-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <Bell className="h-5 w-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-secondary">
            <Gift className="h-5 w-5" />
          </button>
          <Link href="/login">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
              ?
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
