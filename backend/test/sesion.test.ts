import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { crearSesion } from "../src/auth.ts";
import { iniciar, REGISTRO, SECRETO_PRUEBA } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

describe("API con cuentas y sesión", () => {
  let api: Cliente;
  const entrar = (email: string, clave: string) => api.post("/api/auth/entrar", { email, clave });

  before(async () => {
    api = await iniciar({ sinSesion: true });
    assert.equal((await api.registrar()).status, 201);
    api.usarCookie(null);
  });
  after(() => api.cerrar());

  it("sin sesión, la API privada responde 401", async () => {
    api.usarCookie(null);
    for (const ruta of [
      "/api/empleados", "/api/roles", "/api/puestos", "/api/escala", "/api/regimenes", "/api/cuenta", "/api/inexistente",
    ]) {
      const r = await api.get(ruta);
      assert.equal(r.status, 401, ruta);
      assert.deepEqual(r.json, { errores: ["Inicia sesión para continuar."] });
    }
  });

  it("sin sesión tampoco se puede escribir ni borrar", async () => {
    api.usarCookie(null);
    assert.equal((await api.del("/api/empleados/1")).status, 401);
    assert.equal((await api.del("/api/roles/1")).status, 401);
    assert.equal((await api.put("/api/parametros/2026", {})).status, 401);
    assert.equal((await api.put("/api/cuenta", {})).status, 401);
    assert.equal((await api.post("/api/empleados/demo")).status, 401);
    assert.equal((await api.post("/api/roles/generar", {})).status, 401);
  });

  it("cambiar mayúsculas o añadir una barra no evita la protección", async () => {
    api.usarCookie(null);
    assert.equal((await api.get("/API/Empleados")).status, 401);
    assert.equal((await api.get("/api/empleados/")).status, 401);
    assert.equal((await api.put("/api/PARAMETROS/2026", {})).status, 401);
    assert.equal((await api.get("/api/parametros/2026")).status, 401);
  });

  it("la página de inicio sigue funcionando sin sesión, con las reglas de la plantilla", async () => {
    api.usarCookie(null);
    const p = await api.get("/api/parametros");
    assert.equal(p.status, 200);
    assert.equal(p.json.sbu, 482);
    assert.equal((await api.get("/api/parametros/")).status, 200);
    const sim = await api.post("/api/simulacion", { sueldo: 1200 });
    assert.equal(sim.status, 200);
    assert.ok(sim.json.netoPagar > 0);
  });

  it("`/yo` dice que no hay sesión", async () => {
    api.usarCookie(null);
    const r = await api.get("/api/auth/yo");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { autenticado: false, email: null, empresa: null });
  });

  it("rechaza correo o contraseña incorrectos con el mismo mensaje", async () => {
    api.usarCookie(null);
    const mal = ["Correo o contraseña incorrectos."];
    const claveMala = await entrar(REGISTRO.email, "otra");
    const correoMalo = await entrar("otro@empresa.com", REGISTRO.clave);
    assert.equal(claveMala.status, 401);
    assert.equal(correoMalo.status, 401);
    assert.deepEqual(claveMala.json.errores, mal);
    assert.deepEqual(correoMalo.json.errores, mal);
    assert.equal(claveMala.cookie, null);
  });

  it("ignora cuerpos que no son texto sin fallar", async () => {
    api.usarCookie(null);
    assert.equal((await api.post("/api/auth/entrar", { email: { $ne: "" }, clave: 1 })).status, 401);
    assert.equal((await api.post("/api/auth/entrar", [])).status, 401);
  });

  it("con las credenciales correctas entra, con una cookie que el navegador no puede leer", async () => {
    api.usarCookie(null);
    const r = await entrar(REGISTRO.email, REGISTRO.clave);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, {
      autenticado: true, email: REGISTRO.email, empresa: { nombre: REGISTRO.empresa, ruc: REGISTRO.ruc },
    });
    const cookie = r.cabeceras.getSetCookie()[0];
    assert.match(cookie, /^rol_sesion=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=28800/);
  });

  it("el correo no distingue mayúsculas ni espacios al entrar", async () => {
    api.usarCookie(null);
    assert.equal((await entrar(`  ${REGISTRO.email.toUpperCase()} `, REGISTRO.clave)).status, 200);
  });

  it("con la sesión, la API privada responde y `/yo` la reconoce", async () => {
    api.usarCookie((await entrar(REGISTRO.email, REGISTRO.clave)).cookie);
    assert.equal((await api.get("/api/empleados")).status, 200);
    assert.equal((await api.get("/api/roles")).status, 200);
    const yo = (await api.get("/api/auth/yo")).json;
    assert.equal(yo.autenticado, true);
    assert.equal(yo.email, REGISTRO.email);
    assert.equal((await api.get("/api/inexistente")).status, 404);
  });

  it("rechaza una cookie alterada, firmada con otro secreto, vencida o de un usuario que no existe", async () => {
    const buena = crearSesion(1, 2, SECRETO_PRUEBA);
    const otraFirma = crearSesion(1, 2, "x".repeat(40));
    const vencida = crearSesion(1, 2, SECRETO_PRUEBA, Date.now() - 9 * 60 * 60 * 1000);
    for (const token of [`${buena}x`, otraFirma, vencida, "basura"]) {
      api.usarCookie(`rol_sesion=${token}`);
      assert.equal((await api.get("/api/empleados")).status, 401, token);
    }
    api.usarCookie(`rol_sesion=${buena}`);
    assert.equal((await api.get("/api/empleados")).status, 200);
    // La firma es válida pero el usuario 99 no existe: no se reconoce al preguntar por la sesión.
    api.usarCookie(`rol_sesion=${crearSesion(99, 2, SECRETO_PRUEBA)}`);
    assert.equal((await api.get("/api/auth/yo")).json.autenticado, false);
  });

  it("salir borra la cookie", async () => {
    const r = await api.post("/api/auth/salir");
    assert.equal(r.status, 204);
    assert.match(r.cabeceras.getSetCookie()[0], /^rol_sesion=;.*Expires=Thu, 01 Jan 1970/i);
  });

  it("las respuestas de la API no se guardan en caché y llevan cabeceras de seguridad", async () => {
    api.usarCookie(null);
    const r = await api.get("/api/parametros");
    assert.equal(r.cabeceras.get("cache-control"), "no-store");
    assert.equal(r.cabeceras.get("x-content-type-options"), "nosniff");
    assert.equal(r.cabeceras.get("x-frame-options"), "DENY");
    assert.equal(r.cabeceras.get("referrer-policy"), "same-origin");
    assert.equal(r.cabeceras.get("x-powered-by"), null);
  });

  // Va al final: agota los intentos de la IP de pruebas.
  it("tras cinco fallos seguidos bloquea los intentos, incluso con la clave correcta", async () => {
    api.usarCookie(null);
    for (let i = 0; i < 5; i++) await entrar(REGISTRO.email, "mala");
    const r = await entrar(REGISTRO.email, REGISTRO.clave);
    assert.equal(r.status, 429);
    assert.match(r.cabeceras.get("retry-after") ?? "", /^\d+$/);
    assert.equal(r.cookie, null);
  });
});
