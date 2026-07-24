import { mutation } from "./_generated/server";
import { DEFAULT_SEASON, DEFAULT_SEASON_RATES } from "./lib/season";

export const all = mutation({
  args: {},
  handler: async (ctx) => {
    // config — only zelle and bank transfers carry the legal beneficiary name
    // (those are the channels where it's needed for the recipient lookup).
    // defaultCollector follows the spec: cash → Karen, every other method
    // routes to JJ by default. Per-payment override always wins.
    const paymentMethods = [
      { id: "cash", label: "Cash on delivery", sub: "USD or córdobas at hand-off", detail: ["Payment on delivery in USD or córdobas."], enabled: true, defaultCollector: "Karen" as const },
      { id: "venmo", label: "Venmo", sub: "@justina-lydia", detail: ["Send to @justina-lydia."], enabled: true, url: "https://venmo.com/u/justina-lydia", defaultCollector: "JJ" as const },
      { id: "zelle", label: "Zelle", sub: "6469340781", detail: ["Phone: 646 934 0781", "Recipient: Justyna Janczyszyn"], enabled: true, defaultCollector: "JJ" as const },
      { id: "paypal", label: "PayPal", sub: "paypal.me/JustinaLydia", detail: ["Friends & Family preferred (no fee)."], enabled: true, url: "https://www.paypal.com/paypalme/JustinaLydia", defaultCollector: "JJ" as const },
      { id: "wise", label: "Wise", sub: "wise.com/pay/me/justynaj102", detail: ["Open the pay link to send via Wise."], enabled: true, url: "https://wise.com/pay/me/justynaj102", defaultCollector: "JJ" as const },
      { id: "revolut", label: "Revolut", sub: "@justynshx", detail: ["Send to @justynshx via Revolut."], enabled: true, url: "https://revolut.me/justynshx", defaultCollector: "JJ" as const },
      { id: "card", label: "Debit/credit card", sub: "Any Visa or Mastercard", detail: ["Pay with any debit or credit card on the hosted Revolut page — no account needed."], enabled: true, url: "https://revolut.me/justynshx", defaultCollector: "JJ" as const },
      { id: "applepay", label: "Apple Pay", sub: "One tap on iPhone", detail: ["Tap Apple Pay on the hosted Revolut page."], enabled: true, url: "https://revolut.me/justynshx", defaultCollector: "JJ" as const },
      { id: "transfer-usd", label: "Bank transfer · USD", sub: "US routing — details by email", detail: ["Pick this option and we'll email you the wire details (beneficiary, routing, account number) within a few minutes."], enabled: true, defaultCollector: "JJ" as const },
      { id: "transfer-eur", label: "Bank transfer · EUR", sub: "IBAN — details by email", detail: ["Pick this option and we'll email you the IBAN and beneficiary details within a few minutes."], enabled: true, defaultCollector: "JJ" as const },
    ];
    const cfg = await ctx.db.query("config").first();
    if (!cfg) {
      await ctx.db.insert("config", {
        season: DEFAULT_SEASON,
        seasonRates: DEFAULT_SEASON_RATES,
        dailyRate: DEFAULT_SEASON_RATES[DEFAULT_SEASON].daily,
        weeklyRate: DEFAULT_SEASON_RATES[DEFAULT_SEASON].weekly,
        monthlyRate: DEFAULT_SEASON_RATES[DEFAULT_SEASON].monthly,
        deliveryStart: 7,
        deliveryEnd: 20,
        deposit: 100,
        contractTerms: "",
        paymentMethods,
        jjSharePercentage: 70,
        karenSharePercentage: 30,
        businessName: "Karen & JJ Moto Rental",
        currency: "USD",
        timezone: "America/Managua",
      });
    } else {
      // Re-apply payment methods on every seed run so edits propagate without
      // a manual DB patch. Back-fill business defaults for older rows.
      const patch: Record<string, unknown> = { paymentMethods };
      // Seasonal pricing back-fill: whatever rates the row already carries
      // become the preset for the season it looks like, so seeding never
      // changes the live price list.
      if (cfg.season === undefined || cfg.seasonRates === undefined) {
        const current = {
          daily: cfg.dailyRate,
          weekly: cfg.weeklyRate,
          monthly: cfg.monthlyRate,
        };
        const season =
          cfg.season ??
          (current.daily <= DEFAULT_SEASON_RATES.low.daily ? "low" : "high");
        patch.season = season;
        patch.seasonRates =
          cfg.seasonRates ?? { ...DEFAULT_SEASON_RATES, [season]: current };
      }
      if (cfg.jjSharePercentage === undefined) patch.jjSharePercentage = 70;
      if (cfg.karenSharePercentage === undefined) patch.karenSharePercentage = 30;
      if (cfg.businessName === undefined) patch.businessName = "Karen & JJ Moto Rental";
      if (cfg.currency === undefined) patch.currency = "USD";
      if (cfg.timezone === undefined) patch.timezone = "America/Managua";
      await ctx.db.patch(cfg._id, patch);
    }

    // bikes
    const seedBikes = [
      { slug: "genesis-red", name: "Genesis KLIK", color: "Red", type: "Electric" as const, plate: "RI 50272", range: "70 km range", image: "assets/genesis-red.png", isActive: true },
      { slug: "genesis-blue", name: "Genesis KLIK", color: "Blue", type: "Electric" as const, plate: "RI 50273", range: "70 km range", image: "assets/genesis-blue.png", isActive: true },
      { slug: "yamaha-xt", name: "Yamaha XT 125", color: "White", type: "Gas" as const, plate: "RI 46495", range: "125cc · 4-speed", image: "assets/yamaha-xt125.png", isActive: true },
    ];
    for (const b of seedBikes) {
      const existing = await ctx.db.query("bikes").withIndex("by_slug", (q) => q.eq("slug", b.slug)).first();
      if (!existing) await ctx.db.insert("bikes", b);
    }

    // reviews
    // Real Google reviews (verbatim), captured 2026-05-04. `publishedAt` is
    // the actual post date — derived once from the relative age Google showed
    // at capture time, so it stays put instead of drifting every day. The
    // Places sync (reviews.refresh) overwrites these with Google's exact
    // publishTime as soon as GOOGLE_PLACES_API_KEY is configured.
    const seedReviews = [
      { googleId: "g-sean",                       name: "Sean",                          rating: 5, text: "Good prices, convenient and timely drop off and pick up, great bike. Highly recommended. Thanks!", date: "2026-04-30" },
      { googleId: "g-leila-chan-currie",          name: "Leila Chan Currie",             rating: 5, text: "Super smooth and easy rental! Very happy with the moto I got, and the people were really sweet and helpful. A few of my friends also rented and had no issues either. Go for it!", date: "2026-04-28" },
      { googleId: "g-paul-mala",                  name: "Paul MALA",                     rating: 5, text: "Great experience! The owners are accommodating and the vehicles are of excellent quality!", date: "2026-03-05" },
      { googleId: "g-corentin-francois",          name: "Corentin FRANCOIS",             rating: 5, text: "Super responsive and accommodating, quality motorcycles. A big thank you for the recommendations and good advice, I highly recommend them!", date: "2026-03-03" },
      { googleId: "g-joao-pedro-correa",          name: "João Pedro Corrêa dos Santos",  rating: 5, text: "Impeccable service and the motorcycle is also in excellent condition. They deliver the motorcycle to your accommodation with a full tank. Always attentive to anything you need.", date: "2026-03-01" },
      { googleId: "g-jana-schilling",             name: "Jana Schilling",                rating: 5, text: "Highly recommend Karen's Moto Rental. Smooth process, excellent bike, and very kind people. They delivered the bike on time, came back for any adjustment I needed & were super helpful. One of the best rental experiences I've had. Thank you Karen & Dani!!", date: "2026-02-03" },
      { googleId: "g-melanie-velasquez-gallo",    name: "Melanie Velasquez Gallo",       rating: 5, text: "JJ and Karen are wonderful. They rented us their motorcycle, which was brand new and ran perfectly. Besides the excellent rental service, they took us to the bus stop and recommended a friend who could pick us up in Managua.", date: "2025-12-05" },
      { googleId: "g-katherinevanessa-tovalvega", name: "Katherinevanessa Tovalvega",    rating: 5, text: "The best rentals in Popoyo! Quality service. Highly recommend 😀😀", date: "2025-09-06" },
      { googleId: "g-rotem-leibovitz",            name: "רותם ליבוביץ",                  rating: 5, text: "Dani is amazing guy, loyal and friendly! He helped me many times and his service was so good and nice! I am highly recommending to rent from Dani!", date: "2025-08-07" },
      { googleId: "g-guillaume-gelderblom",       name: "Guillaume Gelderblom",          rating: 5, text: "Good scooters, easy to ride, good communication with Karen. Was great and fun to travel around Popoyo. Muchas Gracias.", date: "2025-08-06" },
      { googleId: "g-deric-cheng",                name: "Deric Cheng",                   rating: 5, text: "These motos were high quality, reliable, and the team was extremely responsive whenever I had any issues ☺️ Would strongly recommend!", date: "2025-08-05" },
      { googleId: "g-lou-nkpa",                   name: "Lou Nkpa",                      rating: 5, text: "Great experience with them. It's a local family business with very reasonable prices and great service!", date: "2025-08-04" },
      { googleId: "g-animatronik-eventos",        name: "Animatronik Eventos",           rating: 5, text: "Impeccable service. They delivered my motorcycle and picked it up from Hacienda Iguana immediately and at no extra cost.", date: "2025-08-03" },
      { googleId: "g-harel-elyakim",              name: "הראל אליקים",                   rating: 5, text: "Highest level of service available. Highly recommended!", date: "2025-08-02" },
      { googleId: "g-yuval-elboim",               name: "יובל אלבוים",                   rating: 5, text: "Excellent bikes, good owners, highly recommended", date: "2025-08-01" },
      { googleId: "g-roei-taieb",                 name: "Roei Taieb",                    rating: 5, text: "Perfect, the best motorcycle for Popoyo 🙌", date: "2025-07-31" },
    ];
    const NOW = Date.now();
    const wantedIds = new Set(seedReviews.map((r) => r.googleId));

    // Wipe any existing reviews that aren't in the canonical list (clears
    // the old fake "seed-N" entries and lets us re-run safely).
    const existingAll = await ctx.db.query("reviews").collect();
    for (const r of existingAll) {
      if (!wantedIds.has(r.googleId)) await ctx.db.delete(r._id);
    }

    for (const r of seedReviews) {
      const { date, ...row } = r;
      const publishedAt = Date.parse(`${date}T12:00:00Z`);
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_googleId", (q) => q.eq("googleId", r.googleId))
        .first();
      if (existing) {
        // Drop the stale relative string on rows written before publishedAt.
        await ctx.db.patch(existing._id, {
          ...row,
          publishedAt,
          when: undefined,
          fetchedAt: NOW,
        });
      } else {
        await ctx.db.insert("reviews", { ...row, publishedAt, fetchedAt: NOW });
      }
    }

    return "ok";
  },
});
