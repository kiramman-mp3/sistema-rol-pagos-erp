import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { consultar, uno } from "../src/db.ts";
import { crearToken, gastarToken } from "../src/recuperacion.ts";
import { iniciar, REGISTRO } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

async function con(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

/** El token del último enlace que salió por correo. */
const ultimoToken = (api: Cliente, pantalla: string) => {
  const m = api.correos.at(-1)?.texto.match(new RegExp(`https://rol\\.prueba\\.ec/${pantalla}\\?token=([\\w-]+)`));
  assert.ok(m, `no hay un enlace de ${pantalla} en el último correo`);
  return m[1];
};

const usuarioId = async (api: Cliente) => Number((await uno(api.db, "SELECT id FROM usuarios WHERE email = ?", REGISTRO.email))!.id);

describe("verificar el correo", () => {
  it("al registrarse sale un correo con el enlace y el correo queda sin verificar", () =>
    con(async (api) => {
      assert.equal(api.correos.length, 1);
      assert.equal(api.correos[0].para, REGISTRO.email);
      assert.equal((await api.get("/api/auth/yo")).json.emailVerificado, false);
    }));

  it("el enlace verifica el correo y solo sirve una vez", () =>
    con(async (api) => {
      const token = ultimoToken(api, "verificar");
      assert.equal((await api.post("/api/auth/verificar", { token })).status, 204);
      assert.equal((await api.get("/api/auth/yo")).json.emailVerificado, true);
      const otra = await api.post("/api/auth/verificar", { token });
      assert.equal(otra.status, 400);
      assert.match(otra.json.errores[0], /no es válido o ya venció/);
    }));

  it("un correo que no sale no impide registrarse", async () => {
    const api = await iniciar({ sinSesion: true });
    try {
      api.fallaElCorreo(true);
      assert.equal((await api.registrar()).status, 201);
      assert.equal(api.correos.length, 1); // lo intentó
    } finally {
      await api.cerrar();
    }
  });

  it("se puede pedir otro enlace, y el anterior deja de valer", () =>
    con(async (api) => {
      const primero = ultimoToken(api, "verificar");
      assert.equal((await api.post("/api/auth/reenviar-verificacion")).status, 202);
      assert.equal(api.correos.length, 2);
      assert.equal((await api.post("/api/auth/verificar", { token: primero })).status, 400);
      assert.equal((await api.post("/api/auth/verificar", { token: ultimoToken(api, "verificar") })).status, 204);
      assert.equal((await api.post("/api/auth/reenviar-verificacion")).status, 409); // ya verificado
    }));

  it("reenviar exige sesión", () =>
    con(async (api) => {
      api.usarCookie(null);
      assert.equal((await api.post("/api/auth/reenviar-verificacion")).status, 401);
    }));
});

describe("recuperar la contraseña", () => {
  it("el enlace permite elegir otra contraseña, y con ella se entra", () =>
    con(async (api) => {
      api.usarCookie(null);
      const r = await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      assert.equal(r.status, 202);
      assert.equal(api.correos.length, 2); // el de verificación del registro y este
      assert.match(api.correos[1].asunto, /Restablecer/);

      const token = ultimoToken(api, "restablecer");
      assert.equal((await api.post("/api/auth/restablecer", { token, clave: "otra-clave-nueva-9" })).status, 204);

      assert.equal((await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: REGISTRO.clave })).status, 401);
      assert.equal((await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: "otra-clave-nueva-9" })).status, 200);
    }));

  it("restablecer también deja verificado el correo, y queda en la auditoría", () =>
    con(async (api) => {
      await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      await api.post("/api/auth/restablecer", { token: ultimoToken(api, "restablecer"), clave: "otra-clave-nueva-9" });
      assert.equal((await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: "otra-clave-nueva-9" })).status, 200);
      assert.equal((await api.get("/api/auth/yo")).json.emailVerificado, true);
      const filas = await consultar(api.db, "SELECT accion, usuario_email FROM audit_logs WHERE accion = 'usuario.clave_restablecida'");
      assert.equal(filas.length, 1);
      assert.equal(filas[0].usuario_email, REGISTRO.email);
    }));

  it("responde igual exista o no el correo, y no manda nada si no existe", () =>
    con(async (api) => {
      const antes = api.correos.length;
      const existe = await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      const noExiste = await api.post("/api/auth/recuperar", { email: "nadie@empresa.com" });
      const vacio = await api.post("/api/auth/recuperar", {});
      assert.deepEqual([noExiste.status, noExiste.json], [existe.status, existe.json]);
      assert.equal(vacio.status, 202);
      assert.equal(api.correos.length, antes + 1);
    }));

  it("el enlace solo sirve una vez y un enlace nuevo anula el anterior", () =>
    con(async (api) => {
      await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      const viejo = ultimoToken(api, "restablecer");
      await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      const nuevo = ultimoToken(api, "restablecer");
      assert.notEqual(viejo, nuevo);
      assert.equal((await api.post("/api/auth/restablecer", { token: viejo, clave: "otra-clave-nueva-9" })).status, 400);
      assert.equal((await api.post("/api/auth/restablecer", { token: nuevo, clave: "otra-clave-nueva-9" })).status, 204);
      assert.equal((await api.post("/api/auth/restablecer", { token: nuevo, clave: "una-tercera-clave-7" })).status, 400);
    }));

  it("un token de verificación no sirve para restablecer la contraseña", () =>
    con(async (api) => {
      const token = ultimoToken(api, "verificar");
      assert.equal((await api.post("/api/auth/restablecer", { token, clave: "otra-clave-nueva-9" })).status, 400);
      assert.equal((await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: REGISTRO.clave })).status, 200);
    }));

  it("rechaza una contraseña corta sin gastar el enlace", () =>
    con(async (api) => {
      await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      const token = ultimoToken(api, "restablecer");
      const corta = await api.post("/api/auth/restablecer", { token, clave: "corta" });
      assert.equal(corta.status, 400);
      assert.match(corta.json.errores[0], /al menos 10 caracteres/);
      assert.equal((await api.post("/api/auth/restablecer", { token, clave: "otra-clave-nueva-9" })).status, 204);
    }));

  it("rechaza tokens inventados, vacíos o de otro tipo", () =>
    con(async (api) => {
      for (const token of [undefined, null, "", "x".repeat(40), 12345, "a".repeat(500)]) {
        assert.equal((await api.post("/api/auth/restablecer", { token, clave: "otra-clave-nueva-9" })).status, 400, String(token));
      }
    }));

  it("un enlace vencido no sirve", () =>
    con(async (api) => {
      const hace2Horas = Date.now() - 2 * 60 * 60 * 1000;
      const token = await crearToken(api.db, await usuarioId(api), "recuperar", hace2Horas);
      assert.equal((await api.post("/api/auth/restablecer", { token, clave: "otra-clave-nueva-9" })).status, 400);
    }));

  it("la base guarda el hash del token, no el token", () =>
    con(async (api) => {
      await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      const token = ultimoToken(api, "restablecer");
      const filas = await consultar(api.db, "SELECT token_hash FROM tokens_usuario");
      assert.ok(filas.length >= 2);
      assert.ok(filas.every((f) => f.token_hash !== token && String(f.token_hash).length === 64));
    }));

  it("dos peticiones con el mismo token no pueden usarlo las dos", () =>
    con(async (api) => {
      const token = await crearToken(api.db, await usuarioId(api), "recuperar");
      const r = await Promise.allSettled([gastarToken(api.db, token, "recuperar"), gastarToken(api.db, token, "recuperar")]);
      assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    }));

  it("frena el abuso: tras cinco solicitudes desde la misma conexión, 429", () =>
    con(async (api) => {
      api.usarCookie(null);
      for (let i = 0; i < 5; i++) assert.equal((await api.post("/api/auth/recuperar", { email: "nadie@empresa.com" })).status, 202);
      const r = await api.post("/api/auth/recuperar", { email: REGISTRO.email });
      assert.equal(r.status, 429);
      assert.ok(r.cabeceras.get("retry-after"));
    }));

  it("si el correo falla, igual responde 202 (no revela si el correo existe)", () =>
    con(async (api) => {
      api.fallaElCorreo(true);
      assert.equal((await api.post("/api/auth/recuperar", { email: REGISTRO.email })).status, 202);
    }));
});
