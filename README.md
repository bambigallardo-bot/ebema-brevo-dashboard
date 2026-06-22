# Ebema · Dashboard Brevo

Dashboard web (Next.js) con métricas de **Email marketing**, **Contactos/Listas** y **WhatsApp** desde la API de Brevo. Auto-refresh cada 60s. Pensado para desplegar en **Vercel** con link público.

## 1. Probar en local

```bash
cd ebema-brevo-dashboard
npm install
cp .env.example .env.local   # y pega tu BREVO_API_KEY
npm run dev
```

Abre http://localhost:3000

## 2. Subir a GitHub

```bash
git init
git add .
git commit -m "Dashboard Brevo Ebema"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ebema-brevo-dashboard.git
git push -u origin main
```

## 3. Desplegar en Vercel

1. Entra a https://vercel.com → **Add New → Project** → importa el repo.
2. En **Environment Variables** agrega:
   - `BREVO_API_KEY` = tu clave de Brevo (¡obligatoria!)
   - *(opcional)* `DASHBOARD_USER` y `DASHBOARD_PASSWORD` para proteger el link.
     Si las dejas vacías, el link queda **abierto**.
3. **Deploy**. Vercel te entrega el link público (ej. `ebema-brevo.vercel.app`).

> La `BREVO_API_KEY` vive solo en el servidor de Vercel; nunca llega al navegador.

## Variables de entorno

| Variable             | Obligatoria | Descripción                                  |
| -------------------- | ----------- | -------------------------------------------- |
| `BREVO_API_KEY`      | Sí          | API key v3 de Brevo                          |
| `DASHBOARD_USER`     | No          | Usuario para proteger el dashboard (Basic)   |
| `DASHBOARD_PASSWORD` | No          | Contraseña para proteger el dashboard        |
