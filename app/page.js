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

const fmt = (n) =>
  typeof n === "number" ? n.toLocaleString("es-CL") : n ?? "—";
const fmtPct = (n) => (typeof n === "number" ? `${n}%` : "—");
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "—";

// ---------------- UI helpers ----------------
function Card({ label, value, accent }) {
  return (
    <div style={{ background: "#131c30", border: "1px solid #1f2b45", borderRadius: 14, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#8aa0bf", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#e6edf6" }}>{value}</div>
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
    <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((s, i) => {
        const w = Math.max((s.value / max) * 100, 2);
        const pctFirst = first ? Math.round((s.value / first) * 1000) / 10 : 0;
        return (
          <div key={s.label}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: "#cdd9ee" }}>{s.label}</span>
              <span style={{ color: "#8aa0bf" }}>{fmt(s.value)} {i > 0 && <span style={{ color: "#5b6b84" }}>· {pctFirst}%</span>}</span>
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
    if (e.totals.bounceRate > 2)
      out.push({ emoji: "🧹", tone: "warn", title: "Rebote alto", text: `Rebote de ${e.totals.bounceRate}%. Sobre 2% conviene limpiar la base de direcciones inválidas para cuidar tu reputación de envío.` });
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
    out.push({ emoji: "💬", tone: "info", title: "WhatsApp vs. Email", text: `WhatsApp se lee ${w.totals.readRate}% vs. ${e.totals.openRate}% de apertura en email. ${better ? "WhatsApp tiene mucho mejor alcance de lectura: úsalo para lo urgente o de alto valor." : "El email te rinde más en lectura."}` });
  }

  if (l?.lists?.length) {
    const top = [...l.lists].sort((a, b) => b.subscribers - a.subscribers)[0];
    const pctTop = l.totalContacts ? Math.round((top.subscribers / l.totalContacts) * 100) : 0;
    out.push({ emoji: "👥", tone: "info", title: "Concentración de la base", text: `El ${pctTop}% de tus contactos (${fmt(top.subscribers)}) está en «${top.name}». Segmentar el resto puede mejorar resultados.` });
  }

  return out;
}

// ---------------- Page ----------------
export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const insights = useMemo(() => (data ? buildInsights(data) : []), [data]);

  const eCamps = email?.campaigns || [];
  const sumE = (k) => eCamps.reduce((a, c) => a + (c[k] || 0), 0);

  const timeline = useMemo(
    () =>
      [...eCamps]
        .filter((c) => c.sent >= 1)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-12)
        .map((c) => ({ name: shortDate(c.date), Apertura: c.openRate, Clic: c.clickRate })),
    [eCamps]
  );

  const topOpen = useMemo(
    () => [...eCamps].filter((c) => c.sent >= 20).sort((a, b) => b.openRate - a.openRate).slice(0, 5),
    [eCamps]
  );

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

  const listPie = useMemo(() => {
    const ls = [...(lists?.lists || [])].filter((l) => l.subscribers > 0).sort((a, b) => b.subscribers - a.subscribers);
    const top = ls.slice(0, 6).map((l) => ({ name: l.name, value: l.subscribers }));
    const rest = ls.slice(6).reduce((a, l) => a + l.subscribers, 0);
    if (rest > 0) top.push({ name: "Otras", value: rest });
    return top;
  }, [lists]);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Ebema · Dashboard Brevo</h1>
          <div style={{ color: "#8aa0bf", fontSize: 13, marginTop: 4 }}>
            {loading ? "Cargando…" : data?.updatedAt ? `Actualizado: ${new Date(data.updatedAt).toLocaleString("es-CL")} · auto-refresh 60s` : ""}
          </div>
        </div>
        <button onClick={load} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontSize: 14 }}>
          Actualizar ahora
        </button>
      </header>

      {error && (
        <div style={{ marginTop: 20, background: "#3b1620", border: "1px solid #6b2333", color: "#ffb4c0", padding: "12px 16px", borderRadius: 12 }}>{error}</div>
      )}

      {/* RESUMEN EJECUTIVO */}
      {insights.length > 0 && (
        <Section title="🧠 Resumen ejecutivo" subtitle="Conclusiones automáticas a partir de tus datos">
          <div style={grid(280)}>
            {insights.map((it, i) => (
              <Insight key={i} {...it} />
            ))}
          </div>
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
              <Funnel steps={emailFunnel} />
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
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Campaña</th>
                    <th style={th}>Fecha</th>
                    <th style={th}>Enviados</th>
                    <th style={th}>Apertura</th>
                    <th style={th}>Clic</th>
                  </tr>
                </thead>
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

        {eCamps.length > 0 && (
          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: "pointer", color: "#8aa0bf", fontSize: 14 }}>Ver todas las campañas ({eCamps.length})</summary>
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Campaña</th>
                    <th style={th}>Fecha</th>
                    <th style={th}>Enviados</th>
                    <th style={th}>Entregados</th>
                    <th style={th}>Apertura</th>
                    <th style={th}>Clic</th>
                    <th style={th}>Rebote</th>
                    <th style={th}>Bajas</th>
                  </tr>
                </thead>
                <tbody>
                  {eCamps.slice(0, 50).map((c) => (
                    <tr key={c.id}>
                      <td style={td}>{c.name}</td>
                      <td style={td}>{fmtDate(c.date)}</td>
                      <td style={td}>{fmt(c.sent)}</td>
                      <td style={td}>{fmt(c.delivered)}</td>
                      <td style={td}>{fmtPct(c.openRate)}</td>
                      <td style={td}>{fmtPct(c.clickRate)}</td>
                      <td style={td}>{fmtPct(c.bounceRate)}</td>
                      <td style={td}>{fmt(c.unsubs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
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
                      {listPie.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
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
                  <thead>
                    <tr>
                      <th style={th}>Lista</th>
                      <th style={th}>Suscriptores</th>
                      <th style={th}>En lista negra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lists.lists.map((l) => (
                      <tr key={l.id}>
                        <td style={td}>{l.name}</td>
                        <td style={td}>{fmt(l.subscribers)}</td>
                        <td style={td}>{fmt(l.blacklisted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* WHATSAPP */}
      <Section title="💬 WhatsApp (campañas)">
        {data?.errors?.whatsapp && <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>WhatsApp no disponible o sin campañas: {data.errors.whatsapp}</div>}
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
            <Funnel steps={waFunnel} />
          </div>
        )}

        {wa?.campaigns?.length > 0 && (
          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: "pointer", color: "#8aa0bf", fontSize: 14 }}>Ver campañas de WhatsApp ({wa.campaigns.length})</summary>
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>Campaña</th>
                    <th style={th}>Fecha</th>
                    <th style={th}>Enviados</th>
                    <th style={th}>Entregados</th>
                    <th style={th}>Leídos</th>
                    <th style={th}>Clics</th>
                    <th style={th}>Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {wa.campaigns.slice(0, 50).map((c) => (
                    <tr key={c.id}>
                      <td style={td}>{c.name}</td>
                      <td style={td}>{fmtDate(c.date)}</td>
                      <td style={td}>{fmt(c.sent)}</td>
                      <td style={td}>{fmt(c.delivered)}</td>
                      <td style={td}>{fmt(c.read)}</td>
                      <td style={td}>{fmt(c.clicks)}</td>
                      <td style={td}>{fmt(c.errors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </Section>

      <footer style={{ marginTop: 50, color: "#5b6b84", fontSize: 12, textAlign: "center" }}>Datos vía API de Brevo · Ebema</footer>
    </main>
  );
}
