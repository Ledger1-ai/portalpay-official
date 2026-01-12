"use client";

import Link from "next/link";
import React from "react";
import {
  Volume2,
  VolumeX,
  Globe,
  Zap,
  ShieldCheck,
  Code2,
  Network,
  Scale,
  CheckCircle2,
  Settings,
  QrCode,
  Smartphone,
  PieChart
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useTheme } from "@/contexts/ThemeContext";
import GeometricAnimation from "@/components/landing/GeometricAnimation";
import { cachedFetch } from "@/lib/client-api-cache";
import BrandText from "@/components/brand-text";

export default function GetStartedPage() {
  const brand = useBrand();
  const { theme: siteTheme } = useTheme();
  const [isMuted, setIsMuted] = React.useState(true);
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [containerBrandKey, setContainerBrandKey] = React.useState<string>("");
  const [containerType, setContainerType] = React.useState<string>("");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const heroRef = React.useRef<HTMLDivElement>(null);

  // Fetch container identity to get brandKey for partner containers
  React.useEffect(() => {
    let cancelled = false;
    cachedFetch("/api/site/container", { cache: "no-store" })
      .then((ci: any) => {
        if (cancelled) return;
        setContainerBrandKey(String(ci?.brandKey || "").trim());
        setContainerType(String(ci?.containerType || "").trim());
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  // Detect partner container
  const isPartnerContainer = React.useMemo(() => {
    const ctFromState = containerType.toLowerCase();
    const ctFromAttr = typeof document !== "undefined"
      ? (document.documentElement.getAttribute("data-pp-container-type") || "").toLowerCase()
      : "";
    return ctFromState === "partner" || ctFromAttr === "partner";
  }, [containerType]);

  // Compute display brand name
  const displayBrandName = React.useMemo(() => {
    try {
      const raw = String(siteTheme?.brandName || "").trim();
      const generic = /^ledger\d*$/i.test(raw) || /^partner\d*$/i.test(raw) || /^default$/i.test(raw);
      const treatAsGeneric = generic || (isPartnerContainer && /^portalpay$/i.test(raw));
      const key = containerBrandKey || String((brand as any)?.key || "").trim();
      const titleizedKey = key ? key.charAt(0).toUpperCase() + key.slice(1) : "PortalPay";
      return (!raw || treatAsGeneric) ? titleizedKey : raw;
    } catch {
      const key = containerBrandKey || String((brand as any)?.key || "").trim();
      return key ? key.charAt(0).toUpperCase() + key.slice(1) : "PortalPay";
    }
  }, [siteTheme?.brandName, containerBrandKey, (brand as any)?.key, isPartnerContainer]);

  const toggleMute = async () => {
    if (!videoRef.current) return;
    try {
      const newMutedState = !isMuted;
      if (!newMutedState) videoRef.current.volume = 1.0;
      videoRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      if (videoRef.current.paused) await videoRef.current.play();
    } catch (error) {
      console.error('Toggle mute failed:', error);
    }
  };

  React.useEffect(() => {
    const handleScroll = () => {
      if (!heroRef.current) return;
      const heroHeight = heroRef.current.offsetHeight;
      const scrollY = window.scrollY;
      const progress = Math.min(scrollY / (heroHeight * 0.75), 1);
      setScrollProgress(progress);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Animation values
  const contentOpacity = Math.min(scrollProgress / 0.2, 1);
  const contentScale = 1 + (Math.min(Math.max(scrollProgress - 0.2, 0) / 0.3, 1) * 0.15);
  const contentFadeOut = 1 - Math.min(Math.max(scrollProgress - 0.5, 0) / 0.3, 1);
  const blurAmount = scrollProgress * 20;
  const overlayOpacity = scrollProgress * 0.7;

  // Dynamic Styles
  const primaryColor = siteTheme?.primaryColor || '#35ff7c'; // Use theme primary or Basalt Green default
  const heroGradientStyle = {
    backgroundImage: `linear-gradient(to right, ${primaryColor}, ${siteTheme?.secondaryColor || '#FF6B35'})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent'
  };

  return (
    <div className="min-h-screen relative bg-black">
      {/* Background Layer */}
      <div className="fixed top-0 left-0 w-full h-screen overflow-hidden z-0">
        {isPartnerContainer ? (
          <div
            className="absolute inset-0 transition-all duration-300"
            style={{
              filter: `blur(${blurAmount}px)`,
              transform: `scale(${1 + scrollProgress * 0.1})`,
            }}
          >
            <GeometricAnimation className="w-full h-full" />
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
            style={{
              filter: `blur(${blurAmount}px)`,
              transform: `scale(${1 + scrollProgress * 0.1})`,
            }}
          >
            <source
              src="https://engram1.blob.core.windows.net/portalpay/Videos/PortalPay25LQ.mp4"
              type="video/mp4"
            />
          </video>
        )}
        {/* Dynamic Overlay only - No static dimming at start */}
        <div
          className="absolute inset-0 bg-black transition-opacity duration-300"
          style={{ opacity: overlayOpacity }}
        />
      </div>

      {/* Mute Button */}
      {!isPartnerContainer && (
        <button
          onClick={toggleMute}
          className="fixed bottom-8 right-8 z-50 p-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors"
        >
          {isMuted ? <VolumeX className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
        </button>
      )}

      {/* HERO */}
      <section ref={heroRef} className="relative h-[200vh] w-full -mt-20">
        <div
          className="fixed top-0 left-0 w-full h-screen flex flex-col items-center justify-center text-center px-4 transition-all duration-300 z-10"
          style={{
            opacity: contentOpacity * contentFadeOut,
            transform: `scale(${contentScale})`,
          }}
        >
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-black/30 backdrop-blur-xl border border-white/10 shadow-2xl mb-10 ring-1 ring-white/5">
            <img
              src={(() => {
                if (!isPartnerContainer) return "/Surge.png";
                const symbol = String((brand.logos?.symbol || "")).trim();
                const app = String((brand.logos?.app || "")).trim();
                if (symbol) return symbol;
                if (app) return app;
                return "/Surge.png";
              })()}
              alt={`${brand.name} Logo`}
              className="w-16 h-16 object-contain drop-shadow-lg"
            />
          </div>

          <h1 className="text-6xl md:text-9xl font-black tracking-tighter mb-8 text-white max-w-6xl leading-[0.9]">
            SOVEREIGN <br />
            COMMERCE
            <span className="block text-4xl md:text-6xl mt-4 font-bold tracking-normal opacity-90" style={heroGradientStyle}>
              FOR THE DIGITAL AGE
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-white/90 mb-12 max-w-3xl leading-relaxed font-light">
            Powered by the <strong className="text-white">Universal Commerce Protocol (UCP)</strong>.
            <span className="block mt-2">The internet's missing payment layer is finally here.</span>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/admin"
              className="px-8 py-4 text-lg rounded-lg text-white hover:scale-105 transition-transform shadow-2xl font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              Start the Revolution
            </Link>
            <Link
              href="#protocol"
              className="px-8 py-4 text-lg rounded-lg bg-white/10 backdrop-blur-sm border border-white/30 text-white hover:bg-white/20 transition-colors font-semibold"
            >
              Explore the Protocol
            </Link>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <div className="relative z-10 bg-black text-white">

        {/* LIBERATION / MANIFESTO */}
        <section className="py-24 md:py-32 px-6 border-b border-white/10 bg-neutral-950">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <span className="font-mono text-sm tracking-wider uppercase mb-4 block" style={{ color: primaryColor }}>
                  /// STATUS: LIBERATED
                </span>
                <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight">
                  Freedom from <br />
                  <span className="text-neutral-500">Rent-Seekers.</span>
                </h2>
                <p className="text-xl text-neutral-400 mb-6 leading-relaxed">
                  They own the rails. They own the data. They own your business.
                  Legacy payment processors are gatekeepers of global prosperity.
                </p>
                <p className="text-xl text-white font-medium">
                  We built new rails. <BrandText /> is not just a payment processor.
                  It is a declaration of financial independence.
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 blur-3xl rounded-full opacity-30" style={{ background: primaryColor }} />
                <div className="relative bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
                  <div className="flex items-center gap-4 mb-6 border-b border-white/10 pb-6">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-sm text-neutral-400">Old System</div>
                      <div className="text-lg font-bold">Permissioned & Taxed</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: `${primaryColor}40` }}>
                      <Globe className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-sm text-neutral-400">New System (UCP)</div>
                      <div className="text-lg font-bold text-white">Permissionless & Free</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* UCP & x402 PROTOCOL */}
        <section id="protocol" className="py-24 md:py-32 px-6 bg-black relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('/hex-pattern.svg')] opacity-5 pointer-events-none" />
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <span className="inline-block px-4 py-1.5 rounded-full border border-white/10 bg-white/5 font-mono text-sm mb-6 text-[var(--primary)]">
                HTTP 402: PAYMENT REQUIRED
              </span>
              <h2 className="text-4xl md:text-6xl font-black mb-6">
                The Universal Commerce Protocol
              </h2>
              <p className="text-xl text-neutral-400 max-w-3xl mx-auto">
                Standardizing value transfer like HTTP standardized information.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Code2, title: "x402 Standard", text: "The missing HTTP status code. Programmatic payment requirements for any digital resource." },
                { icon: Network, title: "Interoperable", text: "Connect once, trade everywhere. Across chains, wallets, and apps." },
                { icon: Scale, title: "Trustless Settlement", text: "No middlemen. Smart contracts handle settlement instantly. Code is law." }
              ].map((item, i) => (
                <div key={i} className="group relative bg-neutral-900/50 border border-white/10 rounded-2xl p-8 hover:border-[var(--primary)]/50 transition-colors">
                  <div className="absolute top-0 right-0 p-8 opacity-10 font-mono text-6xl font-bold group-hover:text-[var(--primary)] transition-colors">
                    0{i + 1}
                  </div>
                  <item.icon className="w-12 h-12 text-[var(--primary)] mb-6" />
                  <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                  <p className="text-neutral-400 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TACTICAL EXECUTION (How it Works - Restored & Styled) */}
        <section className="py-24 md:py-32 px-6 bg-neutral-950 border-t border-white/10">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black mb-6">Tactical Execution</h2>
              <p className="text-xl text-neutral-400 max-w-3xl mx-auto">
                Four simple steps to sovereign wealth generation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: Settings, title: "Configure", text: "Set your brand, colors, logo, and revenue splits in the admin panel." },
                { icon: QrCode, title: "Generate", text: "Create receipt IDs and print QR codes from your POS system." },
                { icon: Smartphone, title: "Scan & Pay", text: "Customers scan the QR code and pay with any wallet." },
                { icon: PieChart, title: "Reconcile", text: "Real-time analytics and instant on-chain settlement." }
              ].map((step, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg mb-6 text-white" style={{ backgroundColor: primaryColor }}>
                    {i + 1}
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-white flex items-center gap-2">
                    <step.icon className="w-5 h-5 text-white/70" /> {step.title}
                  </h3>
                  <p className="text-neutral-400 text-sm">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SOVEREIGN ARSENAL (Features - Restored & Styled) */}
        <section className="py-24 md:py-32 px-6 bg-black relative">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-black mb-6">The Sovereign Arsenal</h2>
              <p className="text-xl text-neutral-400 max-w-3xl mx-auto">
                Everything you need to compete and win in the digital economy.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  title: "QR Code Payments",
                  desc: "Print QR codes on POS receipts. Customers scan and pay.",
                  items: ["Works with existing printers", "Mobile-first experience", "No new hardware"]
                },
                {
                  title: "Multi-Token Support",
                  desc: "Accept stablecoins, ETH, or community tokens on Base.",
                  items: ["USDC & USDT", "cbBTC & cbXRP", "Low gas fees"]
                },
                {
                  title: "White-Label Branding",
                  desc: "Your colors, your logo. Customers see you, not us.",
                  items: ["Custom logo & colors", "Branded checkout", "Custom fonts"]
                },
                {
                  title: "Revenue Splits",
                  desc: "Programmatic profit sharing on-chain.",
                  items: ["Automated distribution", "Partnership friendly", "Smart rotation"]
                },
                {
                  title: "Real-Time Analytics",
                  desc: "Watch your volume and trends instantly.",
                  items: ["Live dashboard", "USD volume tracking", "Customer insights"]
                },
                {
                  title: "Web3 Security",
                  desc: "Account abstraction and gas sponsorship.",
                  items: ["Secure connection", "Gasless for users", "Verified settlement"]
                }
              ].map((feature, i) => (
                <div key={i} className="bg-neutral-900/50 border border-white/10 rounded-2xl p-8 hover:border-[var(--primary)]/30 transition-colors">
                  <h3 className="text-2xl font-bold mb-4 text-white">{feature.title}</h3>
                  <p className="text-neutral-400 mb-6">{feature.desc}</p>
                  <ul className="space-y-3">
                    {feature.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-neutral-300">
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: primaryColor }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-32 px-6 text-center border-t border-white/10 bg-neutral-950">
          <h2 className="text-5xl md:text-7xl font-black mb-8 leading-tight">
            Claim Your <br />
            <span style={{ color: primaryColor }}>Sovereignty.</span>
          </h2>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto mb-12">
            The tools for financial freedom are now in your hands.
            Join the network that is rewriting the rules of global commerce.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link
              href="/admin"
              className="px-10 py-5 text-xl rounded-xl text-white hover:scale-105 transition-transform shadow-2xl font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              Start Building
            </Link>
            <Link
              href="/terminal"
              className="px-10 py-5 text-xl rounded-xl border border-white/20 hover:bg-white/10 transition-colors font-semibold"
            >
              Enter Terminal
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
