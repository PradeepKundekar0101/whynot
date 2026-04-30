"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useAuth } from "@/hooks/useAuth";

export default function ProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { user } = useAuth();

  // For now, only show own profile
  const isOwnProfile = user?.username === username;
  const profileUser = isOwnProfile ? user : null;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full p-6">
        {profileUser ? (
          <div>
            {/* Profile header */}
            <div className="flex items-center gap-4 mb-6">
              {profileUser.avatarUrl ? (
                <img src={profileUser.avatarUrl} alt="" className="w-20 h-20 rounded-full" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-2xl font-bold text-primary-foreground">
                  {profileUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold">{profileUser.displayName}</h1>
                <p className="text-muted-foreground">@{profileUser.username}</p>
                {profileUser.bio && <p className="text-sm mt-1">{profileUser.bio}</p>}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-border p-4 text-center">
                <p className="text-xl font-bold">0</p>
                <p className="text-xs text-muted-foreground">Followers</p>
              </div>
              <div className="rounded-xl border border-border p-4 text-center">
                <p className="text-xl font-bold">0</p>
                <p className="text-xs text-muted-foreground">Following</p>
              </div>
              <div className="rounded-xl border border-border p-4 text-center">
                <p className="text-xl font-bold">{profileUser.isSellerEnabled ? "Seller" : "Buyer"}</p>
                <p className="text-xs text-muted-foreground">Role</p>
              </div>
            </div>

            {/* Member since */}
            <p className="text-sm text-muted-foreground">
              Member since {new Date(profileUser.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-lg font-semibold mb-2">@{username}</p>
            <p className="text-sm text-muted-foreground">Profile not found or not available yet.</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
