import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { IconArrowRight, IconChat, IconMap, IconStar } from "../components/Icons";
import { BikeIllustration, bikeStyle, transmissionLabel, BikeRow } from "../components/BikeIllustration";
import { StarsRow } from "../components/Common";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { useI18n } from "../i18n/I18nContext";
import { assetUrl } from "../lib/assets";

type Review = {
  _id: string;
  name: string;
  rating: number;
  text: string;
  publishedAt?: number;
  when?: string;
};

// Reviews show the date they were actually posted ("12 March 2026"), never a
// relative "3 months ago" string — those are frozen at fetch time and go
// stale. `when` is the legacy field and only survives on un-refreshed rows.
function reviewDate(r: Review, intlLocale: string): string {
  if (typeof r.publishedAt === "number" && Number.isFinite(r.publishedAt)) {
    return new Date(r.publishedAt).toLocaleDateString(intlLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  return r.when ?? "";
}

function useIsMobile(): boolean {
  const [mob, setMob] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const onChange = (e: MediaQueryListEvent) => setMob(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mob;
}

function ReviewCard({ r, mobile }: { r: Review; mobile: boolean }) {
  const { t, intlLocale } = useI18n();
  return (
    <div style={{
      // Mobile: 86% of viewport width, snap-centred — original carousel feel.
      // Desktop: fixed 320px card so the row reads as a list of full cards.
      flex: mobile ? "0 0 86%" : "0 0 320px",
      width: mobile ? undefined : 320,
      maxWidth: 320,
      padding: 18,
      borderRadius: 18,
      background: "#fff",
      border: "1px solid var(--line)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      scrollSnapAlign: mobile ? "center" : "start",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", background: "#f3f3f3",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 13, color: "#444",
          }}>{r.name.split(" ").map(s => s[0]).join("").slice(0,2)}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{reviewDate(r, intlLocale)}</div>
          </div>
        </div>
        <StarsRow />
      </div>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{r.text}</p>
      <div style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>{t("home.reviewsSource")}</div>
    </div>
  );
}

// Mobile: auto-advancing carousel with pager dots (the original UX).
function ReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (!reviews.length) return;
    const t = setInterval(() => {
      setIdx((i) => {
        const n = (i + 1) % reviews.length;
        const el = ref.current;
        if (el) {
          const card = el.children[n] as HTMLElement | undefined;
          if (card) el.scrollTo({ left: card.offsetLeft - 16, behavior: "smooth" });
        }
        return n;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [reviews.length]);
  return (
    <>
      <div ref={ref} className="phone-scroll" style={{
        display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory",
        padding: "4px 16px 8px", scrollBehavior: "smooth",
      }}>
        {reviews.map((r) => <ReviewCard key={r._id} r={r} mobile />)}
      </div>
      <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 8 }}>
        {reviews.map((_, i) => (
          <div key={i} style={{
            width: i === idx ? 16 : 5, height: 5, borderRadius: 4,
            background: i === idx ? "var(--ink)" : "#d6d6d6", transition: "all .3s",
          }} />
        ))}
      </div>
    </>
  );
}

// Desktop: scrollable row of full-width cards (snap-aligned so nothing gets cut).
function ReviewsRow({ reviews }: { reviews: Review[] }) {
  return (
    <div className="phone-scroll" style={{
      display: "flex", gap: 12, overflowX: "auto", overflowY: "hidden",
      scrollSnapType: "x mandatory", scrollPaddingLeft: 16,
      padding: "4px 16px 8px", scrollBehavior: "smooth",
    }}>
      {reviews.map((r) => <ReviewCard key={r._id} r={r} mobile={false} />)}
    </div>
  );
}

function ReviewsList({ reviews, mobile }: { reviews: Review[]; mobile: boolean }) {
  const { t } = useI18n();
  if (!reviews.length) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, padding: "0 20px" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>{t("home.reviews")}</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>5.0</div>
        </div>
        <StarsRow size={15} />
      </div>
      {mobile ? <ReviewsCarousel reviews={reviews} /> : <ReviewsRow reviews={reviews} />}
    </div>
  );
}

function FeatureRow() {
  const { t } = useI18n();
  const items = [
    { emoji: "🏄", label: t("home.feature.surfRack") },
    { image: assetUrl("assets/helmet.png"), label: t("home.feature.helmets") },
    { emoji: "🏍️", label: t("home.feature.delivery") },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "0 20px" }}>
      {items.map((it) => (
        <div key={it.label} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          padding: "14px 8px", borderRadius: 14, background: "#fafafa", border: "1px solid var(--line)",
        }}>
          {it.image
            ? <img src={it.image} alt={it.label} style={{ width: 30, height: 30, objectFit: "contain" }} />
            : <div style={{ fontSize: 26, lineHeight: 1, fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}>{it.emoji}</div>
          }
          <div style={{ fontSize: 11.5, fontWeight: 500, textAlign: "center" }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function MotoMiniCard({ b, price, mobile }: { b: BikeRow; price: number; mobile: boolean }) {
  const { t } = useI18n();
  const s = bikeStyle(b.slug);
  return (
    <div style={{
      flex: mobile ? "0 0 70%" : undefined,
      maxWidth: mobile ? 240 : undefined,
      width: mobile ? undefined : "100%",
      scrollSnapAlign: mobile ? "start" : undefined,
      borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden", background: "#fff",
    }}>
      <div style={{ background: "#fafafa", padding: "12px 8px 0" }}>
        <BikeIllustration accent={s.accent} body={s.body} seat={s.seat} image={b.image} height={110} label={b.name} />
      </div>
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--line)" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {b.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {b.color}</span>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{transmissionLabel(b.type)}</div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>
          ${price}<span style={{ color: "var(--muted)", fontWeight: 400 }}> {t("home.perDay")}</span>
        </div>
      </div>
    </div>
  );
}

export function HomeScreen({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const config = useQuery(api.config.get);
  const bikes = (useQuery(api.bikes.list) ?? []) as BikeRow[];
  const reviews = (useQuery(api.reviews.fiveStar) ?? []) as Review[];
  const dailyRate = config?.dailyRate ?? 20;
  const weeklyRate = config?.weeklyRate ?? 120;
  const monthlyRate = config?.monthlyRate ?? 450;
  const mobile = useIsMobile();

  return (
    <div className="phone-scroll" style={{ height: "100%", overflowY: "auto", overflowX: "hidden", paddingBottom: 24 }}>
      <div style={{ padding: "14px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={assetUrl("assets/logo.png")} alt="Karen & JJ" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.1 }}>Karen & JJ</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{t("home.tagline")}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LocaleSwitcher />
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#fafafa", borderRadius: 999, border: "1px solid var(--line)" }}>
            <IconStar size={11} />
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>5.0</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px 0", display: "flex", gap: 10 }}>
        <a href="https://wa.me/50589750052" target="_blank" rel="noreferrer" style={footerLinkStyle("#25D366")}>
          <IconChat size={18} color="#fff" />
          <span>{t("home.whatsapp")}</span>
        </a>
        <a href="https://share.google/IXOC6DlEv7Zk9d18W" target="_blank" rel="noreferrer" style={footerLinkStyle("#1a73e8")}>
          <IconMap size={18} color="#fff" />
          <span>{t("home.findUs")}</span>
        </a>
      </div>

      <div style={{ paddingTop: 18 }}>
        <FeatureRow />
      </div>

      <div style={{ padding: "14px 20px 0", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={pricePillStyle}><b>${dailyRate}</b> {t("home.perDay")}</div>
        <div style={pricePillStyle}><b>${weeklyRate}</b> {t("home.perWeek")}</div>
        <div style={pricePillStyle}><b>${monthlyRate}</b> {t("home.perMonth")}</div>
      </div>

      <div style={{ padding: "24px 0 0" }}>
        {mobile ? (
          <div className="phone-scroll" style={{
            display: "flex", gap: 12, overflowX: "auto", padding: "4px 16px 4px",
            scrollSnapType: "x mandatory",
          }}>
            {bikes.map(b => <MotoMiniCard key={b._id} b={b} price={dailyRate} mobile />)}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            padding: "4px 16px 4px",
          }}>
            {bikes.map(b => <MotoMiniCard key={b._id} b={b} price={dailyRate} mobile={false} />)}
          </div>
        )}
      </div>

      <div style={{ padding: "24px 16px 0" }}>
        <button onClick={onStart} style={{
          width: "100%", padding: "17px 20px", borderRadius: 999, border: "none",
          background: "#25D366", color: "#fff", fontSize: 16, fontWeight: 600,
          boxShadow: "0 12px 32px rgba(37,211,102,0.32)", display: "inline-flex",
          alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer",
        }}>
          {t("home.rentCta")} <IconArrowRight size={18} color="#fff" />
        </button>
      </div>

      <div style={{ padding: "28px 0 0" }}>
        <ReviewsList reviews={reviews} mobile={mobile} />
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", padding: "20px 0 6px" }}>
        +505 8975 0052 · +505 7718 5403 · Popoyo, Nicaragua
      </div>
    </div>
  );
}

const pricePillStyle: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 999, background: "#fafafa",
  border: "1px solid var(--line)", fontSize: 13, color: "var(--ink-2)",
};

function footerLinkStyle(bg: string): React.CSSProperties {
  return {
    flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "14px 12px", borderRadius: 14, background: bg, color: "#fff",
    textDecoration: "none", fontSize: 14, fontWeight: 600,
  };
}
