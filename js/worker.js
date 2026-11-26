/* Hilograma MyD - Web Worker de calculo. Solo recibe pixeles y parametros;
 * no hace peticiones de red ni guarda nada. */
'use strict';
importScripts('engine.js');

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg || msg.type !== 'run') return;
  try {
    const it = self.HiloEngine.generate(msg.input);
    for (;;) {
      const r = it.next();
      if (r.done) { self.postMessage({ type: 'done', job: msg.job, result: r.value }); break; }
      self.postMessage({ type: 'progress', job: msg.job, p: r.value });
    }
  } catch (err) {
    self.postMessage({ type: 'error', job: msg.job, message: String(err && err.message || err) });
  } finally {
    // borra la referencia a los pixeles en cuanto termina
    if (msg.input && msg.input.rgba && msg.input.rgba.fill) msg.input.rgba.fill(0);
  }
};
