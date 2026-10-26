import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { html } from "hono/html";

// Sandbox "third-party system" for recorder/engine tests (docs/12): a login page and a simple
// entry form. It knows nothing about DG Complete. Port 4100.

const PORT = Number(process.env.SANDBOX_PORT ?? 4100);
const USER = { username: "demo", password: "demo1234" };
const app = new Hono();

const page = (title: string, body: ReturnType<typeof html>) => html`<!doctype html>
  <html lang="el">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title} · Sandbox</title>
      <style>
        body { font: 1rem/1.5 system-ui, sans-serif; background: #f3f2f1; margin: 0; padding: 2rem 1rem; }
        main { max-width: 28rem; margin: 0 auto; background: #fff; border-radius: 0.5rem; padding: 1.5rem; }
        label { display: block; margin-top: 0.75rem; font-weight: 600; }
        input { width: 100%; box-sizing: border-box; padding: 0.5rem; margin-top: 0.25rem; }
        button { margin-top: 1rem; padding: 0.5rem 1rem; background: #0078d4; color: #fff; border: 0; border-radius: 0.25rem; }
        .error { color: #a4262c; }
      </style>
    </head>
    <body><main>${body}</main></body>
  </html>`;

app.get("/", (c) => c.redirect(c.req.header("cookie")?.includes("sandbox_session=1") ? "/entries/new" : "/login"));

app.get("/login", (c) =>
  c.html(
    page(
      "Σύνδεση",
      html`<h1>Σύνδεση</h1>
        ${c.req.query("error") ? html`<p class="error" data-testid="login-error">Λάθος στοιχεία σύνδεσης</p>` : ""}
        <form method="post" action="/login">
          <label for="username">Όνομα χρήστη</label><input id="username" name="username" autocomplete="username" />
          <label for="password">Κωδικός</label><input id="password" name="password" type="password" autocomplete="current-password" />
          <button type="submit">Είσοδος</button>
        </form>`,
    ),
  ),
);

app.post("/login", async (c) => {
  const form = await c.req.parseBody();
  if (form.username !== USER.username || form.password !== USER.password) return c.redirect("/login?error=1");
  c.header("Set-Cookie", "sandbox_session=1; Path=/; HttpOnly; SameSite=Lax");
  return c.redirect("/entries/new");
});

app.get("/entries/new", (c) => {
  if (!c.req.header("cookie")?.includes("sandbox_session=1")) return c.redirect("/login");
  return c.html(
    page(
      "Νέα καταχώριση",
      html`<p data-testid="user-menu">Συνδεδεμένος: demo</p>
        <h1>Νέα καταχώριση</h1>
        <form method="post" action="/entries">
          <label for="afm">ΑΦΜ</label><input id="afm" name="afm" inputmode="numeric" />
          <label for="name">Επωνυμία</label><input id="name" name="name" />
          <label for="amount">Ποσό</label><input id="amount" name="amount" inputmode="decimal" />
          <button type="submit">Αποθήκευση</button>
        </form>
        <p><a href="https://example.com/" data-testid="external-help">Οδηγίες (άλλο domain)</a></p>`,
    ),
  );
});

app.post("/entries", async (c) => {
  const form = await c.req.parseBody();
  if (!/^\d{9}$/.test(String(form.afm ?? ""))) {
    return c.html(page("Σφάλμα", html`<p class="error" data-testid="entry-error">Μη έγκυρο ΑΦΜ</p><a href="/entries/new">Πίσω</a>`), 422);
  }
  const id = Math.floor(Math.random() * 900000 + 100000);
  return c.html(page("Αποθηκεύτηκε", html`<p data-testid="entry-id">Αριθμός καταχώρισης: ${id}</p><a href="/entries/new">Νέα καταχώριση</a>`));
});

// A list of records (READ / GET): a table with headers.
app.get("/customers", (c) => {
  if (!c.req.header("cookie")?.includes("sandbox_session=1")) return c.redirect("/login");
  const rows = [["C001", "Alpha Α.Ε.", "094014201"], ["C002", "Beta Ο.Ε.", "099369820"], ["C003", "Gamma Ι.Κ.Ε.", "800000000"], ["C004", "Delta Μ.Ε.Π.Ε.", "998765432"]];
  return c.html(
    page(
      "Πελάτες",
      html`<p data-testid="user-menu">Συνδεδεμένος: demo</p>
        <h1>Πελάτες</h1>
        <table data-testid="customers" style="width:100%"><thead><tr><th>Κωδικός</th><th>Επωνυμία</th><th>ΑΦΜ</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`)}</tbody></table>`,
    ),
  );
});

// Document with lines (multiple records on one page): «Προσθήκη γραμμής» adds a row lines[i][…].
app.get("/invoices/new", (c) => {
  if (!c.req.header("cookie")?.includes("sandbox_session=1")) return c.redirect("/login");
  return c.html(
    page(
      "Νέο παραστατικό",
      html`<p data-testid="user-menu">Συνδεδεμένος: demo</p>
        <h1>Νέο παραστατικό</h1>
        <form method="post" action="/invoices">
          <label for="customer">Πελάτης</label>
          <select id="customer" name="customer"><option value="">—</option><option value="C1">Alpha Α.Ε.</option><option value="C2">Beta Ο.Ε.</option></select>
          <table id="lines" style="width:100%;margin-top:1rem"><thead><tr><th>Είδος</th><th>Ποσότητα</th></tr></thead>
            <tbody><tr><td><input name="lines[0][item]" aria-label="Είδος" /></td><td><input name="lines[0][qty]" aria-label="Ποσότητα" inputmode="numeric" /></td></tr></tbody>
          </table>
          <button type="button" id="add-line" onclick="(function(){var b=document.querySelector('#lines tbody');var i=b.rows.length;var r=b.insertRow();r.innerHTML='<td><input name=&quot;lines['+i+'][item]&quot; aria-label=&quot;Είδος&quot; /></td><td><input name=&quot;lines['+i+'][qty]&quot; aria-label=&quot;Ποσότητα&quot; /></td>';})()">Προσθήκη γραμμής</button>
          <button type="submit">Καταχώριση</button>
        </form>`,
    ),
  );
});

app.post("/invoices", async (c) => {
  const form = await c.req.parseBody({ all: true });
  const lines = Object.keys(form).filter((k) => /^lines\[\d+\]\[item\]$/.test(k) && String(form[k]).trim()).length;
  if (!form.customer) return c.html(page("Σφάλμα", html`<p class="error" data-testid="entry-error">Επιλέξτε πελάτη</p>`), 422);
  const id = Math.floor(Math.random() * 90000 + 10000);
  return c.html(page("Καταχωρήθηκε", html`<p data-testid="invoice-id">Παραστατικό ${id}</p><p data-testid="lines-count">${lines} γραμμές</p>`));
});

app.get("/health", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: PORT }, (info) => console.log(`[sandbox] http://localhost:${info.port}`));
