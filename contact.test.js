// node contact.test.js — checks the contact function's validation and fallbacks without sending email.
const assert = require('node:assert');
const handler = require('./api/contact');
const { clean } = handler;

assert.deepEqual(clean({ nombre: ' Ana ', correo: 'ana@x.mx' }).data, { nombre: 'Ana', correo: 'ana@x.mx', empresa: '', telefono: '', mensaje: '' });
assert.equal(clean({ correo: 'ana@x.mx' }).error, 'Escribe tu nombre.');
assert.equal(clean({ nombre: 'Ana', correo: 'ana@x' }).error, 'Revisa tu correo.');
assert.equal(clean(undefined).error, 'Escribe tu nombre.');
assert.equal(clean({ nombre: 'Ana', correo: 'a@b.co', mensaje: 'x'.repeat(5000) }).data.mensaje.length, 3000);

// Minimal stand-in for Vercel's request/response helpers.
const call = (body, contentType = 'application/json', method = 'POST') => new Promise(done => {
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(payload) { done({ code: this.code, payload }); },
    end() { done({ code: this.code }); },
    redirect(code, to) { done({ code, to }); },
  };
  handler({ method, headers: { 'content-type': contentType }, body }, res);
});

(async () => {
  delete process.env.RESEND_API_KEY;
  assert.deepEqual(await call({}, 'application/json', 'GET'), { code: 405 });
  assert.deepEqual(await call({ sitio: 'spam', nombre: 'Bot' }), { code: 200, payload: { ok: true } });
  assert.deepEqual(await call({ nombre: 'Ana', correo: 'mal' }), { code: 400, payload: { error: 'Revisa tu correo.' } });
  assert.deepEqual(await call({ nombre: 'Ana', correo: 'ana@x.mx' }), { code: 500, payload: { error: 'El formulario aún no está configurado.' } });
  assert.deepEqual(await call({ nombre: 'Ana', correo: 'mal' }, 'application/x-www-form-urlencoded'), { code: 303, to: '/#error-contacto' });
  assert.deepEqual(await call({ sitio: 'spam' }, 'application/x-www-form-urlencoded'), { code: 303, to: '/#gracias' });

  // With a key: check what goes to Resend, and that a Resend failure becomes a 502.
  process.env.RESEND_API_KEY = 're_test';
  let sent;
  global.fetch = async (url, opts) => { sent = { url, opts }; return { ok: true }; };
  assert.deepEqual(await call({ nombre: 'Ana', correo: 'ana@x.mx', empresa: 'ACME', mensaje: 'Hola' }), { code: 200, payload: { ok: true } });
  const mail = JSON.parse(sent.opts.body);
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(sent.opts.headers.Authorization, 'Bearer re_test');
  assert.deepEqual(mail.to, ['info@gremiolabs.com']);
  assert.equal(mail.reply_to, 'ana@x.mx');
  assert.equal(mail.subject, 'Nueva conversación: Ana · ACME');
  assert.match(mail.text, /Mensaje:\nHola$/);
  global.fetch = async () => ({ ok: false, status: 403, text: async () => 'domain not verified' });
  const origError = console.error; console.error = () => {};
  assert.deepEqual(await call({ nombre: 'Ana', correo: 'ana@x.mx' }), { code: 502, payload: { error: 'No pudimos enviar tu mensaje.' } });
  console.error = origError;
  console.log('contact: all checks passed');
})();
