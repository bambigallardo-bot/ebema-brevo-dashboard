import { BetaAnalyticsDataClient } from "@google-analytics/data";

let _client;
function getClient() {
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  if (_client) return _client;
  const creds = JSON.parse(raw);
  _client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: creds.client_email,
      private_key: (creds.private_key || "").replace(/\\n/g, "\n"),
    },
  });
  return _client;
}

// Devuelve { utm_campaign: clics } para tráfico de WhatsApp en el último año.
// Si GA no está configurado, devuelve null (el dashboard sigue funcionando).
export async function getWhatsappClicksByCampaign() {
  const propertyId = process.env.GA4_PROPERTY_ID; // ej. "123456789"
  const client = getClient();
  if (!client || !propertyId) return null;

  // Métrica de "clic": por defecto sesiones originadas en links de WhatsApp.
  // Se puede cambiar a un evento específico con GA_CLICK_METRIC.
  const metric = process.env.GA_CLICK_METRIC || "sessions";
  // Filtro de canal WhatsApp (utm_source o utm_medium contiene "whatsapp").
  const waValue = process.env.GA_WHATSAPP_VALUE || "whatsapp";

  const [resp] = await client.runReport({
    property: `properties/${propertyId.replace(/^properties\//, "")}`,
    dateRanges: [{ startDate: "365daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionCampaignName" }],
    metrics: [{ name: metric }],
    dimensionFilter: {
      orGroup: {
        expressions: [
          { filter: { fieldName: "sessionSource", stringFilter: { matchType: "CONTAINS", value: waValue, caseSensitive: false } } },
          { filter: { fieldName: "sessionMedium", stringFilter: { matchType: "CONTAINS", value: waValue, caseSensitive: false } } },
        ],
      },
    },
    limit: 1000,
  });

  const map = {};
  for (const row of resp.rows || []) {
    const name = row.dimensionValues?.[0]?.value || "";
    const val = Number(row.metricValues?.[0]?.value) || 0;
    if (name) map[name] = (map[name] || 0) + val;
  }
  return map;
}
