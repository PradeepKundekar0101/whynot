"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full p-6">
        <h1 className="text-2xl font-bold mb-6">Account Settings</h1>

        <div className="space-y-6">
          {/* Profile section */}
          <div className="rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold mb-4">Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  defaultValue={user.displayName}
                  disabled
                  className="w-full h-10 px-3 rounded-lg border border-input bg-muted text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  type="text"
                  defaultValue={user.username}
                  disabled
                  className="w-full h-10 px-3 rounded-lg border border-input bg-muted text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  defaultValue={user.email}
                  disabled
                  className="w-full h-10 px-3 rounded-lg border border-input bg-muted text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea
                  defaultValue={user.bio || ""}
                  disabled
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-muted text-sm resize-none"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">Profile editing will be available soon.</p>
          </div>

          {/* Seller section */}
          <div className="rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold mb-4">Seller Status</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {user.isSellerEnabled ? "Seller features enabled" : "Seller features disabled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user.isSellerEnabled
                    ? "You can go live and sell items."
                    : "Enable seller mode to start streaming and selling."}
                </p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                user.isSellerEnabled ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
              }`}>
                {user.isSellerEnabled ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          {/* Danger zone */}
          <div className="rounded-xl border border-destructive/30 p-6">
            <h2 className="text-lg font-semibold text-destructive mb-4">Danger Zone</h2>
            <p className="text-sm text-muted-foreground mb-4">Account deletion is not yet available.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
