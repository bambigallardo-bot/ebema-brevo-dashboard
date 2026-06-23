"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const REFRESH_MS = 60000;
const COLORS = ["#60a5fa", "#4ade80", "#a78bfa", "#f472b6", "#fbbf24", "#22d3ee", "#fb923c", "#94a3b8"];

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("es-CL") : n ?? "—");
const fmtPct = (n) => (typeof n === "number" ? `${n}%` : "—");
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const shortDate = (d) => (d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "—");
const weekday = (d) => (d ? new Date(d).toLocaleDateString("es-CL", { weekday: "long" }) : "—");
const hourMin = (d) => (d ? new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "—");
const brevoUrl = (id) => `https://app.brevo.com/camp/report/${id}`;
const monthKey = (d) => {
  if (!d) return "sin-fecha";
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
  if (key === "sin-fecha") return "Sin fecha";
  const [y, m] = key.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ---------------- UI helpers ----------------
function Card({ label, value, accent }) {
  return (
    <div style={{ background: "#131c30", border: "1px solid #1f2b45", borderRadius: 14, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#8aa0bf", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#e6edf6" }}>{value}</div>
    </div>
  );
}

function Mini({ label, value, color }) {
  return (
    <div style={{ background: "#0b1220", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "#8aa0bf" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || "#e6edf6" }}>{value}</div>
    </div>
  );
}

function Section({ title, children, subtitle }) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>{title}</h2>
      {subtitle && <div style={{ color: "#8aa0bf", fontSize: 13, margin: "4px 0 0" }}>{subtitle}</div>}
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

const grid = (min) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14 });
const panel = { background: "#131c30", border: "1px solid #1f2b45", borderRadius: 14, padding: 16 };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#131c30", borderRadius: 14, overflow: "hidden" };
const th = { textAlign: "left", padding: "10px 12px", color: "#8aa0bf", borderBottom: "1px solid #1f2b45", fontWeight: 600 };
const td = { padding: "10px 12px", borderBottom: "1px solid #1f2b45" };
const toneColor = { good: "#4ade80", warn: "#fbbf24", bad: "#f87171", info: "#60a5fa" };

function Insight({ emoji, title, text, tone }) {
  return (
    <div style={{ ...panel, borderLeft: `3px solid ${toneColor[tone] || "#60a5fa"}` }}>
      <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 6 }}>
        <span style={{ marginRight: 6 }}>{emoji}</span>{title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

function Funnel({ steps }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const first = steps[0]?.value || 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, i) => {
        const w = Math.max((s.value / max) * 100, 2);
        const pctFirst = first ? Math.round((s.value / first) * 1000) / 10 : 0;
        return (
          <div key={s.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: "#cdd9ee" }}>{s.label}</span>
              <span style={{ color: "#8aa0bf" }}>
                {fmt(s.value)} {i > 0 && <span style={{ color: "#5b6b84" }}>· {pctFirst}%</span>}
              </span>
            </div>
            <div style={{ background: "#0b1220", borderRadius: 8, height: 22, overflow: "hidden" }}>
              <div style={{ width: `${w}%`, height: "100%", background: COLORS[i % COLORS.length], borderRadius: 8, transition: "width .4s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Conclusiones automáticas (estilo reporte semanal) ----------------
function emailConclusion(c, avgOpen) {
  const p = [];
  p.push(
    `Enviada el ${fmtDate(c.date)} (${weekday(c.date)}, ${hourMin(c.date)})${c.segment ? ` al segmento ${c.segment}` : ""}, presentó un índice de entrega de ${c.deliveryRate}%, con ${fmt(c.delivered)} de ${fmt(c.sent)} correos entregados.`
  );
  const cmp = avgOpen ? (c.openRate >= avgOpen ? "por sobre" : "por debajo") : null;
  p.push(
    `La tasa de apertura fue de ${c.openRate}% (${fmt(c.opens)} aperturas)${cmp ? `, ubicándose ${cmp} de tu promedio (${avgOpen}%)` : ""}.`
  );
  if (c.clicks > 0) p.push(`Generó ${fmt(c.clicks)} clics (${c.clickRate}%), reflejando interés en la oferta.`);
  else p.push(`No registró clics, lo que sugiere revisar el llamado a la acción y la propuesta de valor.`);
  if (c.bounces > 0)
    p.push(
      `Los rebotes alcanzaron ${c.bounceRate}% (${fmt(c.softBounces)} suaves${c.hardBounces ? `, ${fmt(c.hardBounces)} duros` : ""})${c.hardBounces > 0 ? "; conviene depurar las direcciones duras de la base" : ", manteniéndose en rango controlado"}.`
    );
  if (c.unsubs > 0) p.push(`Se registraron ${fmt(c.unsubs)} bajas.`);
  return p.join(" ");
}

function waConclusion(c) {
  const p = [];
  p.push(`Enviada el ${fmtDate(c.date)}, logró una tasa de entrega de ${c.deliveryRate}%, con ${fmt(c.delivered)} de ${fmt(c.sent)} mensajes entregados.`);
  p.push(`Registró ${fmt(c.read)} lecturas (${c.readRate}%)${c.readRate >= 50 ? ", un alto nivel de visibilidad" : ""}.`);
  if (c.clicks > 0) p.push(`Obtuvo ${fmt(c.clicks)} clics.`);
  if (c.errors > 0) p.push(`Hubo ${fmt(c.errors)} errores de entrega.`);
  return p.join(" ");
}

// ---------------- Insights engine ----------------
function buildInsights(data) {
  const out = [];
  const e = data?.email, w = data?.whatsapp, l = data?.lists;
  const camps = (e?.campaigns || []).filter((c) => c.sent >= 20);

  if (camps.length) {
    const bestOpen = [...camps].sort((a, b) => b.openRate - a.openRate)[0];
    const bestClick = [...camps].sort((a, b) => b.clickRate - a.clickRate)[0];
    out.push({ emoji: "🏆", tone: "good", title: "Mejor correo por apertura", text: `«${bestOpen.name}» logró ${bestOpen.openRate}% de apertura (${fmt(bestOpen.opens)} aperturas).` });
    out.push({ emoji: "🖱️", tone: "good", title: "Mejor correo por clics", text: `«${bestClick.name}» logró ${bestClick.clickRate}% de clic. Replica su asunto y oferta.` });
  }
  if (e?.totals) {
    const o = e.totals.openRate;
    out.push({ emoji: o >= 30 ? "✅" : "⚠️", tone: o >= 30 ? "good" : "warn", title: "Apertura vs. referencia retail", text: `Tu apertura promedio es ${o}%. El sector retail ronda 30–35%. ${o >= 30 ? "Estás en buen nivel." : "Hay espacio para mejorar el asunto y la hora de envío."}` });
    const c = e.totals.clickRate;
    out.push({ emoji: c >= 2.5 ? "✅" : "⚠️", tone: c >= 2 ? "good" : "warn", title: "Clics vs. referencia", text: `Tu tasa de clic es ${c}% (referencia 2–3%). ${c >= 2 ? "Buen engagement." : "Prueba CTAs más claros y menos enlaces compitiendo."}` });
    if (e.totals.bounceRate > 2) out.push({ emoji: "🧹", tone: "warn", title: "Rebote alto", text: `Rebote de ${e.totals.bounceRate}%. Sobre 2% conviene limpiar la base de direcciones inválidas para cuidar tu reputación de envío.` });
  }
  if (camps.length >= 4) {
    const sorted = [...camps].sort((a, b) => new Date(b.date) - new Date(a.date));
    const half = Math.floor(sorted.length / 2);
    const avg = (arr) => arr.reduce((s, c) => s + c.openRate, 0) / arr.length;
    const diff = Math.round((avg(sorted.slice(0, half)) - avg(sorted.slice(half))) * 10) / 10;
    out.push({ emoji: diff >= 0 ? "📈" : "📉", tone: diff >= 0 ? "good" : "warn", title: "Tendencia de apertura", text: `Tus campañas recientes ${diff >= 0 ? "subieron" : "bajaron"} ${Math.abs(diff)} pts de apertura frente a las anteriores.` });
  }
  if (w?.totals?.readRate && e?.totals?.openRate) {
    const better = w.totals.readRate > e.totals.openRate;
    out.push({ emoji: "💬", tone: "info", title: "WhatsApp vs. Email", text: `WhatsApp se lee ${w.totals.readRate}% vs. ${e.totals.openRate}% de apertura en email. ${better ? "WhatsApp tiene mucho mejor alcance: úsalo para lo urgente o de alto valor." : "El email te rinde más en lectura."}` });
  }
  if (l?.lists?.length) {
    const top = [...l.lists].sort((a, b) => b.subscribers - a.subscribers)[0];
    const pctTop = l.totalContacts ? Math.round((top.subscribers / l.totalContacts) * 100) : 0;
    out.push({ emoji: "👥", tone: "info", title: "Concentración de la base", text: `El ${pctTop}% de tus contactos (${fmt(top.subscribers)}) está en «${top.name}». Segmentar el resto puede mejorar resultados.` });
  }
  return out;
}

// ---------------- Motor de mejoras y predicción ----------------
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const wAvgOpen = (arr) => {
  const d = arr.reduce((a, c) => a + (c.delivered || 0), 0);
  const o = arr.reduce((a, c) => a + (c.opens || 0), 0);
  return d ? Math.round((o / d) * 1000) / 10 : 0;
};
function groupRate(camps, keyFn) {
  const m = {};
  for (const c of camps) {
    const k = keyFn(c);
    if (!k) continue;
    m[k] = m[k] || { o: 0, d: 0, n: 0 };
    m[k].o += c.opens || 0;
    m[k].d += c.delivered || 0;
    m[k].n += 1;
  }
  return Object.entries(m)
    .map(([k, v]) => ({ k: cap(k), rate: v.d ? Math.round((v.o / v.d) * 1000) / 10 : 0, n: v.n }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.rate - a.rate);
}

// Qué mejorar / qué estamos haciendo mal
function buildImprovements(data) {
  const out = [];
  const e = data?.email;
  const l = data?.lists;
  const t = e?.totals;
  if (t) {
    if (t.openRate < 30)
      out.push({ emoji: "📬", tone: "warn", title: "Subir las aperturas", text: `La apertura promedio (${t.openRate}%) está bajo el rango del retail (30–35%). Foco en el asunto, un remitente reconocible y la hora de envío.` });
    if (t.clickRate < 2)
      out.push({ emoji: "👆", tone: "warn", title: "Mejorar los clics", text: `La tasa de clic (${t.clickRate}%) está bajo la referencia (2–3%). Usa un CTA claro, un solo botón principal y menos enlaces compitiendo.` });
    if (t.bounceRate > 2)
      out.push({ emoji: "🧹", tone: "warn", title: "Limpiar la base", text: `El rebote (${t.bounceRate}%) supera el ideal (2%). Hay direcciones inválidas que conviene depurar para cuidar la entregabilidad.` });
    if (t.unsubs > 0 && t.delivered && t.unsubs / t.delivered > 0.005)
      out.push({ emoji: "🚪", tone: "warn", title: "Cuidar las bajas", text: `Las bajas (${fmt(t.unsubs)}) están algo altas. Revisa frecuencia de envío y relevancia del contenido por segmento.` });
  }
  if (l?.lists?.length) {
    const top = [...l.lists].sort((a, b) => b.subscribers - a.subscribers)[0];
    const pctTop = l.totalContacts ? Math.round((top.subscribers / l.totalContacts) * 100) : 0;
    if (pctTop >= 60)
      out.push({ emoji: "🎯", tone: "warn", title: "Diversificar la base", text: `El ${pctTop}% de los contactos está en «${top.name}». Estás muy concentrado en una lista; segmentar el resto abre oportunidades.` });
  }
  if (out.length === 0)
    out.push({ emoji: "✅", tone: "good", title: "Vas por buen camino", text: "Tus métricas están en rangos sanos. Mantén la consistencia y sigue testeando asuntos y horarios." });
  return out;
}

// Recomendaciones predictivas (mejor día, horario y asuntos)
function subjectTips(camps) {
  const out = [];
  const valid = camps.filter((c) => c.subject && c.sent >= 20);
  if (valid.length < 5) return out;
  const features = [
    { label: "con emoji", test: (c) => /\p{Extended_Pictographic}/u.test(c.subject) },
    { label: "que mencionan precio u oferta", test: (c) => /\$|\bdesde\b|oferta|descuento|gratis|precio/i.test(c.subject) },
    { label: "con urgencia (últimos días, hoy, ahora)", test: (c) => /últim|hoy|ahora|aprovecha|queda|no te lo/i.test(c.subject) },
    { label: "cortos (≤40 caracteres)", test: (c) => c.subject.length <= 40 },
    { label: "en forma de pregunta", test: (c) => c.subject.includes("?") },
  ];
  for (const f of features) {
    const withF = valid.filter(f.test);
    const without = valid.filter((c) => !f.test(c));
    if (withF.length >= 3 && without.length >= 3) {
      const rw = wAvgOpen(withF);
      const ro = wAvgOpen(without);
      const diff = Math.round((rw - ro) * 10) / 10;
      if (Math.abs(diff) >= 3)
        out.push({
          emoji: "✍️",
          tone: diff > 0 ? "good" : "warn",
          title: `Asuntos ${f.label}`,
          text: diff > 0
            ? `Abren ${diff} pts más (${rw}% vs ${ro}%). Conviene usarlos más seguido.`
            : `Abren ${Math.abs(diff)} pts menos (${rw}% vs ${ro}%). Mejor evitarlos o replantearlos.`,
        });
    }
  }
  const top = [...valid].sort((a, b) => b.openRate - a.openRate)[0];
  if (top) out.push({ emoji: "⭐", tone: "good", title: "Asunto que mejor funcionó", text: `«${top.subject}» logró ${top.openRate}%. Inspírate en su estilo para los próximos envíos.` });
  return out;
}

function buildPredictions(data) {
  const out = [];
  const camps = (data?.email?.campaigns || []).filter((c) => c.date && c.sent >= 20);
  if (camps.length >= 4) {
    const wd = groupRate(camps, (c) => new Date(c.date).toLocaleDateString("es-CL", { weekday: "long" }));
    if (wd.length >= 2)
      out.push({ emoji: "📅", tone: "info", title: "Mejor día para enviar", text: `Históricamente los ${wd[0].k} rinden mejor (${wd[0].rate}% de apertura) y los ${wd[wd.length - 1].k} peor (${wd[wd.length - 1].rate}%). Programa lo importante en ${wd[0].k}.` });
    const tod = groupRate(camps, (c) => {
      const h = new Date(c.date).getHours();
      return h < 12 ? "la mañana" : h < 19 ? "la tarde" : "la noche";
    });
    if (tod.length >= 2)
      out.push({ emoji: "⏰", tone: "info", title: "Mejor horario", text: `Los envíos en ${tod[0].k} promedian ${tod[0].rate}% de apertura, tu mejor franja. Apunta a ese horario la próxima vez.` });
  }
  out.push(...subjectTips(camps));
  return out;
}

// ---------------- Ficha expandible por correo ----------------
function EmailCard({ c, avgOpen }) {
  const steps = [
    { label: "Enviados", value: c.sent },
    { label: "Entregados", value: c.delivered },
    { label: "Aperturas", value: c.opens },
    { label: "Clics", value: c.clicks },
  ];
  return (
    <details style={{ ...panel, padding: 0 }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 600 }}>{c.name}</span>
        <span style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <span style={{ color: "#8aa0bf", fontSize: 12 }}>{fmtDate(c.date)}</span>
          <span style={{ background: "#0b1220", color: "#4ade80", fontWeight: 700, padding: "4px 10px", borderRadius: 20, fontSize: 13 }}>{fmtPct(c.openRate)}</span>
        </span>
      </summary>
      <div style={{ padding: "0 16px 16px" }}>
        {/* Datos de envío */}
        <div style={{ ...grid(160), marginBottom: 14 }}>
          <Mini label="BBDD / Segmento" value={c.segment || "—"} />
          <Mini label="Remitente" value={c.sender || "—"} />
          <Mini label="Día y hora" value={`${weekday(c.date)} ${hourMin(c.date)}`} />
        </div>
        {c.subject && (
          <div style={{ background: "#0b1220", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#8aa0bf" }}>Asunto</div>
            <div style={{ fontSize: 14 }}>{c.subject}</div>
          </div>
        )}
        {/* Rendimiento */}
        <div style={{ ...grid(110), marginBottom: 14 }}>
          <Mini label="Entregas" value={fmt(c.delivered)} />
          <Mini label="% Entrega" value={fmtPct(c.deliveryRate)} color="#4ade80" />
          <Mini label="Apertura" value={fmtPct(c.openRate)} color="#4ade80" />
          <Mini label="Clic" value={fmtPct(c.clickRate)} color="#60a5fa" />
          <Mini label="Rebote" value={fmtPct(c.bounceRate)} color="#f87171" />
          <Mini label="Bajas" value={fmt(c.unsubs)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Funnel steps={steps} />
        </div>
        {/* Conclusión automática */}
        <div style={{ background: "#0b1220", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #a78bfa" }}>
          <div style={{ fontSize: 11, color: "#a78bfa", marginBottom: 6, fontWeight: 600 }}>📝 CONCLUSIÓN (automática)</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{emailConclusion(c, avgOpen)}</div>
        </div>
        <a href={brevoUrl(c.id)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, color: "#60a5fa", fontSize: 13 }}>Ver en Brevo ↗</a>
      </div>
    </details>
  );
}

function WaCard({ c }) {
  const steps = [
    { label: "Enviados", value: c.sent },
    { label: "Entregados", value: c.delivered },
    { label: "Leídos", value: c.read },
    { label: "Clics", value: c.clicks },
  ];
  return (
    <details style={{ ...panel, padding: 0 }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 600 }}>{c.name}</span>
        <span style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          <span style={{ color: "#8aa0bf", fontSize: 12 }}>{fmtDate(c.date)}</span>
          <span style={{ background: "#0b1220", color: "#60a5fa", fontWeight: 700, padding: "4px 10px", borderRadius: 20, fontSize: 13 }}>{fmtPct(c.readRate)} leído</span>
        </span>
      </summary>
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ ...grid(110), marginBottom: 14 }}>
          <Mini label="Enviados" value={fmt(c.sent)} />
          <Mini label="Entregados" value={fmt(c.delivered)} />
          <Mini label="% Entrega" value={fmtPct(c.deliveryRate)} color="#4ade80" />
          <Mini label="Leídos" value={fmt(c.read)} />
          <Mini label="% Leído" value={fmtPct(c.readRate)} color="#60a5fa" />
          <Mini label="Errores" value={fmt(c.errors)} color="#f87171" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Funnel steps={steps} />
        </div>
        <div style={{ background: "#0b1220", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #a78bfa" }}>
          <div style={{ fontSize: 11, color: "#a78bfa", marginBottom: 6, fontWeight: 600 }}>📝 CONCLUSIÓN (automática)</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{waConclusion(c)}</div>
        </div>
      </div>
    </details>
  );
}

// ---------------- Page ----------------
export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [compareIds, setCompareIds] = useState([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("month");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      setData(json);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const email = data?.email;
  const lists = data?.lists;
  const wa = data?.whatsapp;
  const avgOpen = email?.totals?.openRate;

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);
  const improvements = useMemo(() => (data ? buildImprovements(data) : []), [data]);
  const predictions = useMemo(() => (data ? buildPredictions(data) : []), [data]);

  const eCamps = email?.campaigns || [];
  const sumE = (k) => eCamps.reduce((a, c) => a + (c[k] || 0), 0);

  // Inicializa el comparador con los 3 de mayor apertura
  useEffect(() => {
    if (eCamps.length && compareIds.length === 0) {
      const top3 = [...eCamps].filter((c) => c.sent >= 20).sort((a, b) => b.openRate - a.openRate).slice(0, 3).map((c) => c.id);
      if (top3.length) setCompareIds(top3);
    }
  }, [eCamps, compareIds.length]);

  const toggleCompare = (id) =>
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));

  const timeline = useMemo(
    () =>
      [...eCamps].filter((c) => c.sent >= 1).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-12).map((c) => ({ name: shortDate(c.date), Apertura: c.openRate, Clic: c.clickRate })),
    [eCamps]
  );

  const topOpen = useMemo(() => [...eCamps].filter((c) => c.sent >= 20).sort((a, b) => b.openRate - a.openRate).slice(0, 5), [eCamps]);

  const compareData = useMemo(
    () => compareIds.map((id) => eCamps.find((c) => c.id === id)).filter(Boolean).map((c) => ({ name: (c.name || "").slice(0, 18), Apertura: c.openRate, Clic: c.clickRate, Rebote: c.bounceRate })),
    [compareIds, eCamps]
  );

  const fichas = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byDate = sortKey === "date" || sortKey === "month";
    return [...eCamps]
      .filter((c) => c.date && (!q || (c.name || "").toLowerCase().includes(q) || (c.subject || "").toLowerCase().includes(q)))
      .sort((a, b) => (byDate ? new Date(b.date) - new Date(a.date) : (b[sortKey] || 0) - (a[sortKey] || 0)));
  }, [eCamps, search, sortKey]);

  // Agrupa las fichas por mes (más reciente primero) para navegar toda la data.
  const fichasPorMes = useMemo(() => {
    const map = new Map();
    for (const c of fichas) {
      const k = monthKey(c.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    return [...map.keys()].sort((a, b) => b.localeCompare(a)).map((k) => ({ key: k, label: monthLabel(k), items: map.get(k) }));
  }, [fichas]);

  const emailFunnel = email?.totals
    ? [
        { label: "Enviados", value: email.totals.sent },
        { label: "Entregados", value: email.totals.delivered },
        { label: "Aperturas", value: sumE("opens") },
        { label: "Clics", value: sumE("clicks") },
      ]
    : [];

  const waFunnel = wa?.totals
    ? [
        { label: "Enviados", value: wa.totals.sent },
        { label: "Entregados", value: wa.totals.delivered },
        { label: "Leídos", value: wa.totals.read },
        { label: "Clics", value: wa.totals.clicks },
      ]
    : [];

  const waPorMes = useMemo(() => {
    const map = new Map();
    for (const c of wa?.campaigns || []) {
      if (!c.date) continue;
      const k = monthKey(c.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    return [...map.keys()].sort((a, b) => b.localeCompare(a)).map((k) => ({ key: k, label: monthLabel(k), items: map.get(k) }));
  }, [wa]);

  const listPie = useMemo(() => {
    const ls = [...(lists?.lists || [])].filter((l) => l.subscribers > 0).sort((a, b) => b.subscribers - a.subscribers);
    const top = ls.slice(0, 6).map((l) => ({ name: l.name, value: l.subscribers }));
    const rest = ls.slice(6).reduce((a, l) => a + l.subscribers, 0);
    if (rest > 0) top.push({ name: "Otras", value: rest });
    return top;
  }, [lists]);

  const selStyle = { background: "#0b1220", color: "#e6edf6", border: "1px solid #1f2b45", borderRadius: 8, padding: "8px 10px", fontSize: 13 };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Ebema · Dashboard Brevo</h1>
          <div style={{ color: "#8aa0bf", fontSize: 13, marginTop: 4 }}>
            {loading ? "Cargando…" : data?.updatedAt ? `Actualizado: ${new Date(data.updatedAt).toLocaleString("es-CL")} · auto-refresh 60s${data?.stale ? " · mostrando última copia (Brevo ocupado)" : ""}` : ""}
          </div>
        </div>
        <button onClick={load} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontSize: 14 }}>Actualizar ahora</button>
      </header>

      {error && <div style={{ marginTop: 20, background: "#3b1620", border: "1px solid #6b2333", color: "#ffb4c0", padding: "12px 16px", borderRadius: 12 }}>{error}</div>}

      {/* RESUMEN EJECUTIVO */}
      {(insights.length > 0 || improvements.length > 0 || predictions.length > 0) && (
        <Section title="🧠 Resumen ejecutivo" subtitle="Análisis automático: cómo vamos, qué mejorar y qué hacer en la próxima campaña">
          {improvements.length > 0 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#cdd9ee", margin: "6px 0 10px" }}>🎯 Qué mejorar</div>
              <div style={grid(280)}>{improvements.map((it, i) => <Insight key={i} {...it} />)}</div>
            </>
          )}
          {predictions.length > 0 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#cdd9ee", margin: "22px 0 10px" }}>🔮 Recomendaciones para la próxima campaña</div>
              <div style={grid(280)}>{predictions.map((it, i) => <Insight key={i} {...it} />)}</div>
            </>
          )}
          {insights.length > 0 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#cdd9ee", margin: "22px 0 10px" }}>📌 Lo destacado</div>
              <div style={grid(280)}>{insights.map((it, i) => <Insight key={i} {...it} />)}</div>
            </>
          )}
        </Section>
      )}

      {/* EMAIL */}
      <Section title="📧 Email marketing">
        {data?.errors?.email && <div style={{ color: "#ffb4c0", fontSize: 13, marginBottom: 10 }}>{data.errors.email}</div>}
        <div style={grid(150)}>
          <Card label="Enviados" value={fmt(email?.totals?.sent)} />
          <Card label="Entregados" value={fmt(email?.totals?.delivered)} />
          <Card label="Tasa apertura" value={fmtPct(email?.totals?.openRate)} accent="#4ade80" />
          <Card label="Tasa clic" value={fmtPct(email?.totals?.clickRate)} accent="#60a5fa" />
          <Card label="Tasa rebote" value={fmtPct(email?.totals?.bounceRate)} accent="#f87171" />
          <Card label="Bajas" value={fmt(email?.totals?.unsubs)} />
        </div>

        <div style={{ ...grid(320), marginTop: 14 }}>
          {emailFunnel.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 8 }}>Embudo de conversión</div>
              <div style={panel}><Funnel steps={emailFunnel} /></div>
            </div>
          )}
          {timeline.length > 1 && (
            <div>
              <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 8 }}>Evolución (apertura y clic %)</div>
              <div style={{ ...panel, height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" tick={{ fill: "#8aa0bf", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#8aa0bf", fontSize: 11 }} unit="%" />
                    <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2b45" }} />
                    <Legend />
                    <Line type="monotone" dataKey="Apertura" stroke="#4ade80" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Clic" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {topOpen.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>🏆 Mejores correos (por apertura)</div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>#</th><th style={th}>Campaña</th><th style={th}>Fecha</th><th style={th}>Enviados</th><th style={th}>Apertura</th><th style={th}>Clic</th></tr></thead>
                <tbody>
                  {topOpen.map((c, i) => (
                    <tr key={c.id}>
                      <td style={{ ...td, color: "#fbbf24", fontWeight: 700 }}>{i + 1}</td>
                      <td style={td}>{c.name}</td>
                      <td style={td}>{fmtDate(c.date)}</td>
                      <td style={td}>{fmt(c.sent)}</td>
                      <td style={{ ...td, color: "#4ade80", fontWeight: 600 }}>{fmtPct(c.openRate)}</td>
                      <td style={td}>{fmtPct(c.clickRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* COMPARADOR */}
        {eCamps.length > 1 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🔍 Comparador de correos</div>
            <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 10 }}>Marca hasta 4 correos para compararlos lado a lado.</div>
            <div style={{ ...panel, maxHeight: 140, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {[...eCamps].filter((c) => c.sent >= 1).map((c) => {
                const on = compareIds.includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCompare(c.id)} style={{ background: on ? "#2563eb" : "#0b1220", color: on ? "#fff" : "#cdd9ee", border: "1px solid #1f2b45", borderRadius: 20, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    {on ? "✓ " : ""}{(c.name || "").slice(0, 30)}
                  </button>
                );
              })}
            </div>
            {compareData.length > 0 && (
              <div style={{ ...panel, height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                    <XAxis dataKey="name" tick={{ fill: "#8aa0bf", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#8aa0bf", fontSize: 11 }} unit="%" />
                    <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2b45" }} />
                    <Legend />
                    <Bar dataKey="Apertura" fill="#4ade80" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Clic" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Rebote" fill="#f87171" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* FICHAS POR CORREO */}
        {eCamps.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>🗂️ Ficha por correo ({fichas.length})</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input placeholder="Buscar correo…" value={search} onChange={(e) => setSearch(e.target.value)} style={selStyle} />
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selStyle}>
                  <option value="month">Agrupar por mes</option>
                  <option value="openRate">Ordenar: Apertura</option>
                  <option value="clickRate">Ordenar: Clic</option>
                  <option value="sent">Ordenar: Enviados</option>
                  <option value="date">Ordenar: Fecha</option>
                </select>
              </div>
            </div>
            {sortKey === "month" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {fichasPorMes.map((grp, gi) => (
                  <details key={grp.key} open={gi === 0}>
                    <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#cdd9ee", padding: "8px 0", borderBottom: "1px solid #1f2b45", marginBottom: 10 }}>
                      {grp.label} <span style={{ color: "#5b6b84", fontWeight: 400 }}>· {grp.items.length} correos</span>
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {grp.items.map((c) => <EmailCard key={c.id} c={c} avgOpen={avgOpen} />)}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {fichas.map((c) => <EmailCard key={c.id} c={c} avgOpen={avgOpen} />)}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* CONTACTOS / LISTAS */}
      <Section title="👥 Contactos y listas">
        {data?.errors?.lists && <div style={{ color: "#ffb4c0", fontSize: 13, marginBottom: 10 }}>{data.errors.lists}</div>}
        <div style={grid(180)}>
          <Card label="Total contactos" value={fmt(lists?.totalContacts)} accent="#a78bfa" />
          <Card label="N° de listas" value={fmt(lists?.listCount)} />
        </div>
        <div style={{ ...grid(320), marginTop: 14 }}>
          {listPie.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 8 }}>Distribución de contactos por lista</div>
              <div style={{ ...panel, height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={listPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {listPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2b45" }} formatter={(v) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {lists?.lists?.length > 0 && (
            <div>
              <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 8 }}>Detalle por lista</div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead><tr><th style={th}>Lista</th><th style={th}>Suscriptores</th><th style={th}>En lista negra</th></tr></thead>
                  <tbody>
                    {lists.lists.map((l) => (
                      <tr key={l.id}><td style={td}>{l.name}</td><td style={td}>{fmt(l.subscribers)}</td><td style={td}>{fmt(l.blacklisted)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* WHATSAPP */}
      <Section title="💬 WhatsApp (campañas)" subtitle={wa?.clicksSource === "analytics" ? "Clics medidos vía Google Analytics (utm_campaign)" : "Clics: conecta Google Analytics para medirlos (ver configuración)"}>
        {data?.errors?.whatsapp && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>WhatsApp no disponible o sin campañas: {data.errors.whatsapp}</div>}
        {data?.errors?.analytics && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>Analytics: {data.errors.analytics}</div>}
        {wa?.gaInfo && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: "#5b6b84", fontSize: 12 }}>GA: {wa.gaInfo.campaigns} campañas con datos, {fmt(wa.gaInfo.totalClicks)} sesiones en total · {wa.gaInfo.matched} campañas cruzadas</div>
            {wa.gaInfo.names?.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", color: "#5b6b84", fontSize: 12 }}>🔧 Ver nombres de campaña que ve GA (debug)</summary>
                <div style={{ ...panel, marginTop: 8, maxHeight: 220, overflowY: "auto", fontSize: 12 }}>
                  {wa.gaInfo.names.map((g, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", color: "#cdd9ee" }}>
                      <span>{g.name || "(sin nombre)"}</span>
                      <span style={{ color: "#8aa0bf" }}>{fmt(g.clicks)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        <div style={grid(150)}>
          <Card label="Enviados" value={fmt(wa?.totals?.sent)} />
          <Card label="Entregados" value={fmt(wa?.totals?.delivered)} />
          <Card label="% Entregado" value={fmtPct(wa?.totals?.deliveryRate)} accent="#4ade80" />
          <Card label="Leídos" value={fmt(wa?.totals?.read)} />
          <Card label="% Leído" value={fmtPct(wa?.totals?.readRate)} accent="#60a5fa" />
          <Card label="Errores" value={fmt(wa?.totals?.errors)} accent="#f87171" />
        </div>
        {waFunnel.length > 0 && (
          <div style={{ marginTop: 14, maxWidth: 560 }}>
            <div style={{ fontSize: 13, color: "#8aa0bf", marginBottom: 8 }}>Embudo de WhatsApp</div>
            <div style={panel}><Funnel steps={waFunnel} /></div>
          </div>
        )}
        {wa?.campaigns?.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>🗂️ Ficha por campaña de WhatsApp</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {waPorMes.map((grp, gi) => (
                <details key={grp.key} open={gi === 0}>
                  <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#cdd9ee", padding: "8px 0", borderBottom: "1px solid #1f2b45", marginBottom: 10 }}>
                    {grp.label} <span style={{ color: "#5b6b84", fontWeight: 400 }}>· {grp.items.length} campañas</span>
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {grp.items.map((c) => <WaCard key={c.id} c={c} />)}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </Section>

      <footer style={{ marginTop: 50, color: "#5b6b84", fontSize: 12, textAlign: "center" }}>Datos vía API de Brevo · Ebema</footer>
    </main>
  );
}
