// Contact form → email to info@gremiolabs.com through Resend (https://resend.com).
// Needs RESEND_API_KEY in the Vercel project, and gremiolabs.com verified in Resend.
const TO = process.env.CONTACT_TO || 'info@gremiolabs.com';
const FROM = process.env.CONTACT_FROM || 'Gremio Labs web <web@gremiolabs.com>';
const LIMITS = { nombre: 100, correo: 200, empresa: 150, telefono: 50, mensaje: 3000 };

function clean(body) {
  const f = {};
  for (const [k, max] of Object.entries(LIMITS)) f[k] = String((body && body[k]) ?? '').trim().slice(0, max);
  if (!f.nombre) return { error: 'Escribe tu nombre.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo)) return { error: 'Revisa tu correo.' };
  return { data: f };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  // The page sends JSON. Without JavaScript the browser posts the form, so answer with a redirect back to the panel.
  const json = (req.headers['content-type'] || '').includes('application/json');
  const reply = (status, payload) => json
    ? res.status(status).json(payload)
    : res.redirect(303, status === 200 ? '/#gracias' : '/#error-contacto');

  if (req.body && req.body.sitio) return reply(200, { ok: true }); // honeypot: only bots fill the hidden field
  const { data, error } = clean(req.body);
  if (error) return reply(400, { error });
  if (!process.env.RESEND_API_KEY) return reply(500, { error: 'El formulario aún no está configurado.' });

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: data.correo, // "Reply" in the inbox answers the visitor directly
        subject: `Nueva conversación: ${data.nombre}${data.empresa ? ` · ${data.empresa}` : ''}`,
        text: [
          `Nombre: ${data.nombre}`,
          `Correo: ${data.correo}`,
          `Empresa: ${data.empresa || '—'}`,
          `WhatsApp / teléfono: ${data.telefono || '—'}`,
          '',
          'Mensaje:',
          data.mensaje || '—',
        ].join('\n'),
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  } catch (e) {
    console.error('contact: send failed:', e.message);
    return reply(502, { error: 'No pudimos enviar tu mensaje.' });
  }
  return reply(200, { ok: true });
}

module.exports = handler;
module.exports.clean = clean;
