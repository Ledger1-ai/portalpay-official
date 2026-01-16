"use client";

import dynamic from "next/dynamic";

// Dynamically import home content with SSR disabled to avoid ThirdwebProvider context issues
const HomeContent = dynamic(() => import("@/components/landing/home-content"), {
  loading: () => (
    <div className="min-h-screen p-6 md:p-8 flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  ),
});

export default function Home() {
  return <HomeContent />;
}
