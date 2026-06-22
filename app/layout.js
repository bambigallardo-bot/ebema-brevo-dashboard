export const metadata = {
  title: "Ebema · Dashboard Brevo",
  description: "Métricas en tiempo real de email, listas y WhatsApp",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0b1220",
          color: "#e6edf6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
