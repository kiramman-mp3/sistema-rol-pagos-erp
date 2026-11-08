import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { crearSesion, hashClave } from "../src/auth.ts";
import type { ConfigAuth } from "../src/auth.ts";
import { iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

const SECRETO = "t".repeat(40);

describe("API con inicio de sesión", () => {
  let api: Cliente;
  let auth: ConfigAuth;
  const entrar = (usuario: string, clave: string) => api.post("/api/auth/entrar", { usuario, clave });

  before(async () => {
    auth = { usuario: "admin", claveHash: await hashClave("clave-de-prueba"), secreto: SECRETO };
    api = await iniciar({ auth });
  });
  after(() => api.cerrar());

  it("sin sesión, la API privada responde 401", async () => {
    api.usarCookie(null);
    for (const ruta of ["/api/empleados", "/api/roles", "/api/puestos", "/api/escala", "/api/regimenes", "/api/inexistente"]) {
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

  it("la página de inicio sigue funcionando sin sesión: parámetros y simulación", async () => {
    api.usarCookie(null);
    assert.equal((await api.get("/api/parametros")).status, 200);
    assert.equal((await api.get("/api/parametros/")).status, 200);
    const sim = await api.post("/api/simulacion", { sueldo: 1200 });
    assert.equal(sim.status, 200);
    assert.ok(sim.json.netoPagar > 0);
  });

  it("`/yo` dice que no hay sesión", async () => {
    api.usarCookie(null);
    const r = await api.get("/api/auth/yo");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { autenticado: false, usuario: null, protegida: true });
  });

  it("rechaza usuario o contraseña incorrectos con el mismo mensaje", async () => {
    api.usarCookie(null);
    const mal = ["Usuario o contraseña incorrectos."];
    const claveMala = await entrar("admin", "otra");
    const usuarioMalo = await entrar("otro", "clave-de-prueba");
    assert.equal(claveMala.status, 401);
    assert.equal(usuarioMalo.status, 401);
    assert.deepEqual(claveMala.json.errores, mal);
    assert.deepEqual(usuarioMalo.json.errores, mal);
    assert.equal(claveMala.cookie, null);
  });

  it("ignora cuerpos que no son texto sin fallar", async () => {
    api.usarCookie(null);
    assert.equal((await api.post("/api/auth/entrar", { usuario: { $ne: "" }, clave: 1 })).status, 401);
    assert.equal((await api.post("/api/auth/entrar", [])).status, 401);
  });

  it("con las credenciales correctas entra, con una cookie que el navegador no puede leer", async () => {
    api.usarCookie(null);
    const r = await entrar("admin", "clave-de-prueba");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { autenticado: true, usuario: "admin", protegida: true });
    const cookie = r.cabeceras.getSetCookie()[0];
    assert.match(cookie, /^rol_sesion=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=28800/);
  });

  it("con la sesión, la API privada responde y `/yo` la reconoce", async () => {
    api.usarCookie(null);
    api.usarCookie((await entrar("admin", "clave-de-prueba")).cookie);
    assert.equal((await api.get("/api/empleados")).status, 200);
    assert.equal((await api.get("/api/roles")).status, 200);
    assert.deepEqual((await api.get("/api/auth/yo")).json, { autenticado: true, usuario: "admin", protegida: true });
    assert.equal((await api.get("/api/inexistente")).status, 404);
  });

  it("rechaza una cookie alterada, firmada con otro secreto o vencida", async () => {
    const buena = crearSesion("admin", SECRETO);
    const otraFirma = crearSesion("admin", "x".repeat(40));
    const vencida = crearSesion("admin", SECRETO, Date.now() - 9 * 60 * 60 * 1000);
    for (const token of [`${buena}x`, otraFirma, vencida, "basura"]) {
      api.usarCookie(`rol_sesion=${token}`);
      assert.equal((await api.get("/api/empleados")).status, 401, token);
    }
    api.usarCookie(`rol_sesion=${buena}`);
    assert.equal((await api.get("/api/empleados")).status, 200);
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
    for (let i = 0; i < 5; i++) await entrar("admin", "mala");
    const r = await entrar("admin", "clave-de-prueba");
    assert.equal(r.status, 429);
    assert.match(r.cabeceras.get("retry-after") ?? "", /^\d+$/);
    assert.equal(r.cookie, null);
  });
});

describe("API sin inicio de sesión configurado (trabajo local)", () => {
  let api: Cliente;
  before(async () => {
    api = await iniciar();
  });
  after(() => api.cerrar());

  it("deja usar la API y `/yo` avisa que no está protegida", async () => {
    assert.equal((await api.get("/api/empleados")).status, 200);
    assert.deepEqual((await api.get("/api/auth/yo")).json, { autenticado: true, usuario: null, protegida: false });
  });

  it("no se puede iniciar sesión si no hay configuración", async () => {
    assert.equal((await api.post("/api/auth/entrar", { usuario: "a", clave: "b" })).status, 400);
  });
});
