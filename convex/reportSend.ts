"use node";
// Node runtime: full Intl/ICU (timezone-correct day/week/month boundaries) and
// fetch for the Resend API. Build + send the daily owner report.

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildReport, renderReportEmail } from "./lib/report";

export const sendDaily = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: boolean; reason?: string }> => {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.REPORT_TO ?? "helo@popoyo.co";
    const from = process.env.REPORT_FROM ?? "Popoyo Moto <reports@popoyo.co>";
    if (!apiKey) {
      console.warn("RESEND_API_KEY not set — skipping daily report email.");
      return { sent: false, reason: "no_api_key" };
    }

    const d = await ctx.runQuery(internal.report.data, {});
    const report = buildReport({ nowMs: Date.now(), ...d });
    const { subject, text, html } = renderReportEmail(report);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
    }
    console.log(`Daily report sent to ${to} for ${report.dateISO}.`);
    return { sent: true };
  },
});
