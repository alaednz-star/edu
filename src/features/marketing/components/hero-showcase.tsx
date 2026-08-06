import { useEffect, useRef, useState } from "react";
import { CalendarCheck2, ClipboardCheck, LayoutGrid, UserPlus } from "lucide-react";
import { OverviewMock } from "./mockups";
import { useI18n } from "@/hooks/use-i18n";

const floatingCards = [
  {
    icon: UserPlus,
    titleKey: "landing.hero.card.registrations.title",
    detailKey: "landing.hero.card.registrations.detail",
    tone: "primary" as const,
    position: "start-[-2%] top-[6%] sm:start-[-3%] lg:start-[-8%]",
    motion: "animate-float",
    depth: 26,
  },
  {
    icon: ClipboardCheck,
    titleKey: "landing.hero.card.attendance.title",
    detailKey: "landing.hero.card.attendance.detail",
    tone: "success" as const,
    position: "end-[-2%] top-[-4%] sm:end-[-3%] lg:end-[-8%]",
    motion: "animate-float-delayed",
    depth: 38,
  },
  {
    icon: LayoutGrid,
    titleKey: "landing.hero.card.groups.title",
    detailKey: "landing.hero.card.groups.detail",
    tone: "primary" as const,
    position: "start-[-2%] -bottom-[5%] sm:start-[-3%] lg:start-[-8%]",
    motion: "animate-float-slow",
    depth: 32,
  },
  {
    icon: CalendarCheck2,
    titleKey: "landing.hero.card.schedule.title",
    detailKey: "landing.hero.card.schedule.detail",
    tone: "accent" as const,
    position: "end-[-2%] -bottom-[7%] sm:end-[-3%] lg:end-[-8%]",
    motion: "animate-float",
    depth: 44,
  },
];

const toneStyles = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  accent: "bg-accent-soft text-accent-foreground",
} as const;

export function HeroShowcase() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        setPointer({ x: Math.max(-0.5, Math.min(0.5, x)), y: Math.max(-0.5, Math.min(0.5, y)) });
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      setPointer({ x: 0, y: 0 });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    node.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={containerRef} className="perspective-hero relative mx-auto w-full max-w-5xl">
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute -inset-x-16 -top-24 bottom-0 opacity-70 blur-2xl"
      />

      <div
        className="relative transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: `rotateX(${8 - pointer.y * 8}deg) rotateY(${pointer.x * 10}deg) translateY(${pointer.y * -8}px)`,
          transformStyle: "preserve-3d",
        }}
      >
        <OverviewMock />

        {floatingCards.map((card) => (
          <div
            key={card.titleKey}
            aria-hidden
            className={`pointer-events-none absolute hidden w-max lg:block ${card.position}`}
            style={{
              transform: `translate3d(${pointer.x * card.depth}px, ${pointer.y * card.depth}px, ${card.depth}px)`,
            }}
          >
            <div
              className={`glass-panel flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${card.motion}`}
            >
              <span
                className={`grid size-8 place-items-center rounded-xl ${toneStyles[card.tone]}`}
              >
                <card.icon className="size-4" />
              </span>
              <div>
                <p className="text-[11px] font-semibold leading-tight">{t(card.titleKey)}</p>
                <p className="text-[10px] text-muted-foreground">{t(card.detailKey)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
