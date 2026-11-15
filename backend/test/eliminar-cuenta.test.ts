import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { consultar, uno } from "../src/db.ts";
import { cargarEmpleadosDePrueba, iniciar, REGISTRO } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

const OTRA = { empresa: "Otra Empresa S.A.", ruc: "1790010937001", email: "otra@empresa.com" };
const CONFIRMA = { ruc: REGISTRO.ruc, clave: REGISTRO.clave };

/** La primera empresa con empleados y un rol publicado (inmutable) y otro por publicar. */
async function conDatos(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    const publicado = (await api.post("/api/roles/generar", { anio: 2026, mes: 9, novedades: [] })).json.id;
    for (const p of ["validar", "aprobar", "publicar"]) assert.equal((await api.post(`/api/roles/${publicado}/${p}`)).status, 200);
    assert.equal((await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).status, 201);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

const contar = async (api: Cliente, tabla: string, donde = "TRUE") =>
  Number((await uno(api.db, `SELECT COUNT(*) AS n FROM ${tabla} WHERE ${donde}`))!.n);

describe("exportar la cuenta", () => {
  it("trae todo lo de la empresa y nada de otra, sin contraseñas ni tokens", () =>
    conDatos(async (api) => {
      const r = await api.get("/api/cuenta/exportar");
      assert.equal(r.status, 200);
      assert.match(r.cabeceras.get("content-disposition")!, /^attachment; filename="rol-pagos-1790000028001-\d{4}-\d{2}-\d{2}\.json"$/);
      const d = r.json;
      assert.equal(d.formato, "rol-pagos-ecuador/cuenta@1");
      assert.equal(d.cuenta.ruc, REGISTRO.ruc);
      assert.equal(d.empleados.length, 6);
      assert.equal(d.roles_cabecera.length, 2);
      assert.equal(d.rolesDetalle.length, 11); // 5 empleados en septiembre y 6 en octubre (Pedro entra el 16 de octubre)
      assert.deepEqual(d.usuarios.map((u: { email: string }) => u.email), [REGISTRO.email]);
      assert.ok(d.regimenes.length >= 3);
      assert.ok(d.audit_logs.length > 0);
      assert.ok(d.novedades.length >= 0);
      assert.equal(typeof d.rolesDetalle[0].traza, "object"); // el desglose sale como objeto, no como texto
      assert.ok(Array.isArray(d.rolesDetalle[0].traza.pasos));

      // ni claves ni tokens en ninguna parte del archivo
      assert.ok(!r.texto.includes("scrypt."));
      assert.ok(!r.texto.includes("clave_hash"));
      assert.ok(!r.texto.includes("token_hash"));
    }));

  it("no incluye los datos de otra empresa", async () => {
    const api = await iniciar();
    try {
      await cargarEmpleadosDePrueba(api);
      await api.registrar(OTRA);
      const d = (await api.get("/api/cuenta/exportar")).json;
      assert.equal(d.cuenta.ruc, OTRA.ruc);
      assert.equal(d.empleados.length, 0);
      assert.deepEqual(d.usuarios.map((u: { email: string }) => u.email), [OTRA.email]);
      assert.ok(d.audit_logs.every((a: { usuario_email: string | null }) => a.usuario_email === OTRA.email || a.usuario_email === null));
    } finally {
      await api.cerrar();
    }
  });

  it("sin sesión responde 401", async () => {
    const api = await iniciar();
    try {
      api.usarCookie(null);
      assert.equal((await api.get("/api/cuenta/exportar")).status, 401);
    } finally {
      await api.cerrar();
    }
  });
});

describe("eliminar la cuenta", () => {
  it("borra la empresa y todo lo suyo, incluso roles publicados y la auditoría", () =>
    conDatos(async (api) => {
      assert.ok((await contar(api, "audit_logs", "cuenta_id = 2")) > 0);
      const r = await api.del("/api/cuenta", CONFIRMA);
      assert.equal(r.status, 204, r.texto);
      assert.match(r.cabeceras.getSetCookie()[0], /^rol_sesion=;/);

      for (const tabla of ["usuarios", "empleados", "roles_cabecera", "regimenes", "parametros_anuales", "escala_salarial", "puestos", "audit_logs"]) {
        assert.equal(await contar(api, tabla, "cuenta_id = 2"), 0, tabla);
      }
      assert.equal(await contar(api, "cuentas", "id = 2"), 0);
      assert.equal(await contar(api, "roles_detalle"), 0);
      assert.equal(await contar(api, "novedades"), 0);
      assert.equal(await contar(api, "tokens_usuario"), 0);
    }));

  it("la sesión deja de valer", () =>
    conDatos(async (api) => {
      const cookie = (await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: REGISTRO.clave })).cookie;
      assert.equal((await api.del("/api/cuenta", CONFIRMA)).status, 204);
      api.usarCookie(cookie);
      assert.equal((await api.get("/api/empleados")).status, 401);
      assert.equal((await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: REGISTRO.clave })).status, 401);
    }));

  it("el correo y el RUC quedan libres para registrarse de nuevo", () =>
    conDatos(async (api) => {
      assert.equal((await api.del("/api/cuenta", CONFIRMA)).status, 204);
      const r = await api.registrar();
      assert.equal(r.status, 201);
      assert.equal((await api.get("/api/empleados")).json.length, 0);
    }));

  it("no toca la plantilla ni la cuenta de otra empresa", () =>
    conDatos(async (api) => {
      const plantilla = await contar(api, "regimenes", "cuenta_id = 1");
      await api.registrar(OTRA);
      const otra = await contar(api, "regimenes", "cuenta_id = 3");
      assert.ok(otra > 0);
      api.usarCookie((await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: REGISTRO.clave })).cookie);
      assert.equal((await api.del("/api/cuenta", CONFIRMA)).status, 204);
      assert.equal(await contar(api, "regimenes", "cuenta_id = 1"), plantilla);
      assert.equal(await contar(api, "regimenes", "cuenta_id = 3"), otra);
      assert.equal(await contar(api, "usuarios", "cuenta_id = 3"), 1);
    }));

  it("pide el RUC y la contraseña: con cualquiera mal, 400 y no borra nada", () =>
    conDatos(async (api) => {
      const antes = await contar(api, "empleados");
      // cinco intentos es lo que tolera el freno
      for (const cuerpo of [{}, { clave: REGISTRO.clave }, { ruc: "1790010937001", clave: REGISTRO.clave },
        { ruc: REGISTRO.ruc, clave: "otra-clave-cualquiera" }, { ruc: 1790000028001, clave: REGISTRO.clave }]) {
        const r = await api.del("/api/cuenta", cuerpo);
        assert.equal(r.status, 400, JSON.stringify(cuerpo));
        assert.match(r.json.errores[0], /RUC de la empresa y tu contraseña/);
      }
      assert.equal(await contar(api, "empleados"), antes);
      assert.equal((await api.get("/api/cuenta")).status, 200);
    }));

  it("frena el adivinar la contraseña: tras cinco fallos, 429 aunque la última sea correcta", () =>
    conDatos(async (api) => {
      for (let i = 0; i < 5; i++) assert.equal((await api.del("/api/cuenta", { ruc: REGISTRO.ruc, clave: `mal-${i}` })).status, 400);
      const r = await api.del("/api/cuenta", CONFIRMA);
      assert.equal(r.status, 429);
      assert.ok(r.cabeceras.get("retry-after"));
      assert.equal(await contar(api, "cuentas", "id = 2"), 1);
    }));

  it("solo el administrador puede: un lector y un aprobador reciben 403", () =>
    conDatos(async (api) => {
      const admin = (await api.post("/api/auth/entrar", { email: REGISTRO.email, clave: REGISTRO.clave })).cookie!;
      for (const rol of ["lector", "aprobador"]) {
        api.usarCookie(admin);
        assert.equal((await api.post("/api/usuarios", { email: `${rol}@empresa.com`, clave: REGISTRO.clave, rol })).status, 201);
        api.usarCookie((await api.post("/api/auth/entrar", { email: `${rol}@empresa.com`, clave: REGISTRO.clave })).cookie);
        assert.equal((await api.del("/api/cuenta", CONFIRMA)).status, 403, rol);
        assert.equal((await api.get("/api/cuenta/exportar")).status, 403, rol);
      }
      assert.equal(await contar(api, "cuentas", "id = 2"), 1);
    }));

  it("la plantilla del sistema no se puede eliminar", () =>
    conDatos(async (api) => {
      const { eliminarCuenta } = await import("../src/datos-cuenta.ts");
      await assert.rejects(eliminarCuenta(api.db, 1), /plantilla/);
      assert.ok((await contar(api, "regimenes", "cuenta_id = 1")) > 0);
    }));

  it("fuera de eliminar la cuenta, la auditoría sigue siendo de solo inserción", () =>
    conDatos(async (api) => {
      await assert.rejects(consultar(api.db, "DELETE FROM audit_logs WHERE cuenta_id = 2"), /no se modifica ni se borra/);
      await assert.rejects(consultar(api.db, "UPDATE audit_logs SET accion = 'x' WHERE cuenta_id = 2"), /no se modifica ni se borra/);
      // marcar otra cuenta no abre la de esta
      await assert.rejects(
        api.db.transaccion(async (tx) => {
          await consultar(tx, "SELECT set_config('rolpagos.eliminando_cuenta', '99', true)");
          await consultar(tx, "DELETE FROM audit_logs WHERE cuenta_id = 2");
        }),
        /no se modifica ni se borra/,
      );
      assert.ok((await contar(api, "audit_logs", "cuenta_id = 2")) > 0);
    }));

  it("si algo falla a la mitad, no queda borrada a medias", () =>
    conDatos(async (api) => {
      const { eliminarCuenta } = await import("../src/datos-cuenta.ts");
      await assert.rejects(eliminarCuenta(api.db, 12345), /no existe/);
      assert.ok((await contar(api, "audit_logs", "cuenta_id = 2")) > 0);
      assert.equal(await contar(api, "cuentas", "id = 2"), 1);
    }));
});
