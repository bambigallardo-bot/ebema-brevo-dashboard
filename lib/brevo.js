import { getWhatsappClicksByCampaign } from "./ga";

const BASE = "https://api.brevo.com/v3";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Caché en memoria para no golpear la API de Brevo en cada visita (evita 429).
let _cache = { at: 0, data: null };
const CACHE_MS = Number(process.env.DASHBOARD_CACHE_MS || 120000);

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
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 600 * Math.pow(2, attempt);
      await sleep(wait);
      return brevoGet(path, attempt + 1);
    }
    const err = new Error(`Brevo ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Trae TODAS las páginas de un listado de Brevo (campañas, listas, etc.).
async function brevoGetAll(pathBase, key, limit = 50) {
  const all = [];
  let offset = 0;
  for (let i = 0; i < 60; i++) {
    const sep = pathBase.includes("?") ? "&" : "?";
    const data = await brevoGet(`${pathBase}${sep}limit=${limit}&offset=${offset}`);
    const batch = data[key] || [];
    all.push(...batch);
    const count = data.count || 0;
    offset += limit;
    if (batch.length < limit || (count && offset >= count)) break;
    await sleep(250); // espacia las páginas para no gatillar rate limit (429)
  }
  return all;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10; // 1 decimal
}

// ---------- Email ----------
async function getEmail() {
  const raw = await brevoGetAll("/emailCampaigns?statistics=globalStats&sort=desc", "campaigns");
  const campaigns = raw.map((c) => {
    const s = (c.statistics && c.statistics.globalStats) || {};
    const sent = s.sent || 0;
    const delivered = s.delivered || 0;
    const opens = s.uniqueViews || 0;
    const opensTotal = s.viewed || s.trackableViews || opens;
    const clicks = s.uniqueClicks || 0;
    const softBounces = s.softBounces || 0;
    const hardBounces = s.hardBounces || 0;
    const bounces = softBounces + hardBounces;
    const unsubs = s.unsubscriptions || 0;
    return {
      id: c.id,
      name: c.name,
      subject: c.subject || "",
      sender: (c.sender && (c.sender.name || c.sender.email)) || "",
      listIds: (c.recipients && c.recipients.listIds) || [],
      date: c.sentDate || c.scheduledAt || null,
      sent,
      delivered,
      opens,
      opensTotal,
      clicks,
      softBounces,
      hardBounces,
      bounces,
      unsubs,
      openRate: pct(opens, delivered),
      clickRate: pct(clicks, delivered),
      bounceRate: pct(bounces, sent),
      deliveryRate: pct(delivered, sent),
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
  const raw = await brevoGetAll("/contacts/lists?sort=desc", "lists");
  const lists = raw.map((l) => ({
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
  const raw = await brevoGetAll("/whatsappCampaigns?sort=desc", "campaigns");
  const campaigns = raw.map((c) => {
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
  const now = Date.now();
  if (_cache.data && now - _cache.at < CACHE_MS) return _cache.data;

  // Secuencial (no en paralelo) para no gatillar el rate limit de Brevo.
  const settle = async (fn) => {
    try {
      return { status: "fulfilled", value: await fn() };
    } catch (e) {
      return { status: "rejected", reason: e };
    }
  };
  const email = await settle(getEmail);
  await sleep(400);
  const lists = await settle(getLists);
  await sleep(400);
  const whatsapp = await settle(getWhatsapp);

  const emailVal = email.status === "fulfilled" ? email.value : null;
  const listsVal = lists.status === "fulfilled" ? lists.value : null;

  // Asocia el nombre de la(s) lista(s) a cada correo (la "BBDD" del reporte).
  if (emailVal && listsVal) {
    const nameById = {};
    for (const l of listsVal.lists) nameById[l.id] = l.name;
    for (const c of emailVal.campaigns) {
      c.segment = (c.listIds || []).map((id) => nameById[id]).filter(Boolean).join(", ");
    }
  }

  const waVal = whatsapp.status === "fulfilled" ? whatsapp.value : null;

  // Clics de WhatsApp desde Google Analytics (match por utm_campaign).
  let analyticsError = null;
  if (waVal) {
    try {
      const gaMap = await getWhatsappClicksByCampaign();
      if (gaMap) {
        const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
        const entries = Object.entries(gaMap).map(([k, v]) => [norm(k), v]);
        for (const c of waVal.campaigns) {
          const n = norm(c.name);
          let clicks = 0;
          for (const [k, v] of entries) {
            if (n && (k === n || k.includes(n) || n.includes(k))) clicks += v;
          }
          c.clicks = clicks;
        }
        waVal.totals.clicks = waVal.campaigns.reduce((a, c) => a + (c.clicks || 0), 0);
        waVal.clicksSource = "analytics";
        waVal.gaInfo = {
          campaigns: Object.keys(gaMap).length,
          totalClicks: Object.values(gaMap).reduce((a, v) => a + v, 0),
          matched: waVal.campaigns.filter((c) => (c.clicks || 0) > 0).length,
          names: Object.entries(gaMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 60)
            .map(([name, clicks]) => ({ name, clicks })),
        };
      }
    } catch (e) {
      analyticsError = String((e && e.message) || e);
    }
  }

  const result = {
    updatedAt: new Date().toISOString(),
    email: emailVal,
    lists: listsVal,
    whatsapp: waVal,
    errors: {
      email: email.status === "rejected" ? String(email.reason) : null,
      lists: lists.status === "rejected" ? String(lists.reason) : null,
      whatsapp:
        whatsapp.status === "rejected" ? String(whatsapp.reason) : null,
      analytics: analyticsError,
    },
  };

  // Solo cachea si la data crítica vino bien (no cachear errores 429/transitorios).
  if (!result.errors.email && !result.errors.lists) {
    _cache = { at: Date.now(), data: result };
  }
  return result;
}
