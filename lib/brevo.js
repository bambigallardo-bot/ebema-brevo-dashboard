const BASE = "https://api.brevo.com/v3";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function brevoGet(path, attempt = 0) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("Falta la variable BREVO_API_KEY");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "api-key": key, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Reintenta errores transitorios: bloqueo por IP no propagado, rate-limit o 5xx.
    const transient =
      /unauthorized|unrecognised|unrecognized/i.test(text) ||
      res.status === 429 ||
      res.status >= 500;
    if (transient && attempt < 4) {
      await sleep(500 * (attempt + 1));
      return brevoGet(path, attempt + 1);
    }
    const err = new Error(`Brevo ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10; // 1 decimal
}

// ---------- Email ----------
async function getEmail() {
  const data = await brevoGet(
    "/emailCampaigns?statistics=globalStats&limit=50&offset=0&sort=desc"
  );
  const campaigns = (data.campaigns || []).map((c) => {
    const s = (c.statistics && c.statistics.globalStats) || {};
    const sent = s.sent || 0;
    const delivered = s.delivered || 0;
    const opens = s.uniqueViews || 0;
    const clicks = s.uniqueClicks || 0;
    const bounces = (s.softBounces || 0) + (s.hardBounces || 0);
    const unsubs = s.unsubscriptions || 0;
    return {
      id: c.id,
      name: c.name,
      date: c.sentDate || c.scheduledAt || null,
      sent,
      delivered,
      opens,
      clicks,
      bounces,
      unsubs,
      openRate: pct(opens, delivered),
      clickRate: pct(clicks, delivered),
      bounceRate: pct(bounces, sent),
    };
  });

  const sum = (k) => campaigns.reduce((a, c) => a + (c[k] || 0), 0);
  const sent = sum("sent");
  const delivered = sum("delivered");
  const opens = sum("opens");
  const clicks = sum("clicks");
  const bounces = sum("bounces");
  const unsubs = sum("unsubs");

  return {
    totals: {
      sent,
      delivered,
      openRate: pct(opens, delivered),
      clickRate: pct(clicks, delivered),
      bounceRate: pct(bounces, sent),
      unsubs,
    },
    campaigns,
  };
}

// ---------- Contactos / Listas ----------
async function getLists() {
  const data = await brevoGet("/contacts/lists?limit=50&offset=0&sort=desc");
  const lists = (data.lists || []).map((l) => ({
    id: l.id,
    name: l.name,
    subscribers: l.totalSubscribers || l.uniqueSubscribers || 0,
    blacklisted: l.totalBlacklisted || 0,
  }));

  let totalContacts = 0;
  try {
    const c = await brevoGet("/contacts?limit=1&offset=0");
    totalContacts = c.count || 0;
  } catch (_) {
    totalContacts = lists.reduce((a, l) => a + l.subscribers, 0);
  }

  return { totalContacts, listCount: lists.length, lists };
}

// ---------- WhatsApp (campañas masivas) ----------
async function getWhatsapp() {
  const data = await brevoGet(
    "/whatsappCampaigns?limit=50&offset=0&sort=desc"
  );
  const campaigns = (data.campaigns || []).map((c) => {
    const s =
      (c.statistics && c.statistics.globalStats) ||
      c.statistics ||
      c.stats ||
      {};
    const sent = s.sent || 0;
    const delivered = s.delivered || 0;
    const read = s.read || s.seen || 0;
    const clicks = s.clicks || s.uniqueClicks || 0;
    const errors = s.error || s.errors || s.failed || 0;
    return {
      id: c.id,
      name: c.campaignName || c.name,
      date: c.scheduledAt || c.sentDate || null,
      sent,
      delivered,
      read,
      clicks,
      errors,
      deliveryRate: pct(delivered, sent),
      readRate: pct(read, delivered),
    };
  });

  const sum = (k) => campaigns.reduce((a, c) => a + (c[k] || 0), 0);
  const sent = sum("sent");
  const delivered = sum("delivered");
  const read = sum("read");
  const clicks = sum("clicks");
  const errors = sum("errors");

  return {
    totals: {
      sent,
      delivered,
      read,
      clicks,
      errors,
      deliveryRate: pct(delivered, sent),
      readRate: pct(read, delivered),
    },
    campaigns,
  };
}

export async function getDashboard() {
  const [email, lists, whatsapp] = await Promise.allSettled([
    getEmail(),
    getLists(),
    getWhatsapp(),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    email: email.status === "fulfilled" ? email.value : null,
    lists: lists.status === "fulfilled" ? lists.value : null,
    whatsapp: whatsapp.status === "fulfilled" ? whatsapp.value : null,
    errors: {
      email: email.status === "rejected" ? String(email.reason) : null,
      lists: lists.status === "rejected" ? String(lists.reason) : null,
      whatsapp:
        whatsapp.status === "rejected" ? String(whatsapp.reason) : null,
    },
  };
}
