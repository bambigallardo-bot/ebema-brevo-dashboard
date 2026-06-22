"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const REFRESH_MS = 60000;

const fmt = (n) =>
  typeof n === "number" ? n.toLocaleString("es-CL") : n ?? "—";
const fmtPct = (n) => (typeof n === "number" ? `${n}%` : "—");
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function Card({ label, value, accent }) {
  return (
    <div
      style={{
        background: "#131c30",
        border: "1px solid #1f2b45",
        borderRadius: 14,
        padding: "16px 18px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: "#8aa0bf", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#e6edf6" }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <section style={{ marginTop: 36 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h2 style={{ fontSize: 18, margin: 0 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const grid = (min) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: 14,
});

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  background: "#131c30",
  borderRadius: 14,
  overflow: "hidden",
};
const th = {
  textAlign: "left",
  padding: "10px 12px",
  color: "#8aa0bf",
  borderBottom: "1px solid #1f2b45",
  fontWeight: 600,
};
const td = { padding: "10px 12px", borderBottom: "1px solid #1f2b45" };

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

  const emailChart =
    email?.campaigns?.slice(0, 10).reverse().map((c) => ({
      name: c.name?.slice(0, 16) || "—",
      Apertura: c.openRate,
      Clic: c.clickRate,
    })) || [];

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Ebema · Dashboard Brevo</h1>
          <div style={{ color: "#8aa0bf", fontSize: 13, marginTop: 4 }}>
            {loading
              ? "Cargando…"
              : data?.updatedAt
              ? `Actualizado: ${new Date(data.updatedAt).toLocaleString("es-CL")} · auto-refresh 60s`
              : ""}
          </div>
        </div>
        <button
          onClick={load}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 16px",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Actualizar ahora
        </button>
      </header>

      {error && (
        <div
          style={{
            marginTop: 20,
            background: "#3b1620",
            border: "1px solid #6b2333",
            color: "#ffb4c0",
            padding: "12px 16px",
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* EMAIL */}
      <Section title="📧 Email marketing">
        {data?.errors?.email && (
          <div style={{ color: "#ffb4c0", fontSize: 13, marginBottom: 10 }}>
            {data.errors.email}
          </div>
        )}
        <div style={grid(150)}>
          <Card label="Enviados" value={fmt(email?.totals?.sent)} />
          <Card label="Entregados" value={fmt(email?.totals?.delivered)} />
          <Card label="Tasa apertura" value={fmtPct(email?.totals?.openRate)} accent="#4ade80" />
          <Card label="Tasa clic" value={fmtPct(email?.totals?.clickRate)} accent="#60a5fa" />
          <Card label="Tasa rebote" value={fmtPct(email?.totals?.bounceRate)} accent="#f87171" />
          <Card label="Bajas" value={fmt(email?.totals?.unsubs)} />
        </div>

        {emailChart.length > 0 && (
          <div style={{ background: "#131c30", borderRadius: 14, padding: 16, marginTop: 14, height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emailChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2b45" />
                <XAxis dataKey="name" tick={{ fill: "#8aa0bf", fontSize: 11 }} />
                <YAxis tick={{ fill: "#8aa0bf", fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2b45" }} />
                <Legend />
                <Bar dataKey="Apertura" fill="#4ade80" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Clic" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {email?.campaigns?.length > 0 && (
          <div style={{ marginTop: 14, overflowX: "auto" }}>
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
                {email.campaigns.slice(0, 25).map((c) => (
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
        )}
      </Section>

      {/* CONTACTOS / LISTAS */}
      <Section title="👥 Contactos y listas">
        {data?.errors?.lists && (
          <div style={{ color: "#ffb4c0", fontSize: 13, marginBottom: 10 }}>
            {data.errors.lists}
          </div>
        )}
        <div style={grid(180)}>
          <Card label="Total contactos" value={fmt(lists?.totalContacts)} accent="#a78bfa" />
          <Card label="N° de listas" value={fmt(lists?.listCount)} />
        </div>
        {lists?.lists?.length > 0 && (
          <div style={{ marginTop: 14, overflowX: "auto" }}>
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
        )}
      </Section>

      {/* WHATSAPP */}
      <Section title="💬 WhatsApp (campañas)">
        {data?.errors?.whatsapp && (
          <div style={{ color: "#f5c97b", fontSize: 13, marginBottom: 10 }}>
            WhatsApp no disponible o sin campañas: {data.errors.whatsapp}
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
        {wa?.campaigns?.length > 0 && (
          <div style={{ marginTop: 14, overflowX: "auto" }}>
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
                {wa.campaigns.slice(0, 25).map((c) => (
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
        )}
      </Section>

      <footer style={{ marginTop: 50, color: "#5b6b84", fontSize: 12, textAlign: "center" }}>
        Datos vía API de Brevo · Ebema
      </footer>
    </main>
  );
}
