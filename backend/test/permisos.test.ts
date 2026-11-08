import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { consultar } from "../src/db.ts";
import { permisoQueExige, permisosDe, puede, ROLES_USUARIO } from "../src/permisos.ts";
import { cargarEmpleadosDePrueba, iniciar, REGISTRO } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

const CLAVE = "clave-de-prueba-1";

/** Cada prueba usa su API con el administrador que registra la empresa y los 6 empleados de ejemplo. */
async function conEmpresa(prueba: (api: Cliente, admin: string) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api, await entrar(api, REGISTRO.email));
  } finally {
    await api.cerrar();
  }
}

/** Inicia sesión con ese correo y deja la cookie puesta; devuelve la cookie para volver a usarla. */
async function entrar(api: Cliente, email: string, clave = CLAVE): Promise<string> {
  api.usarCookie(null);
  const r = await api.post("/api/auth/entrar", { email, clave });
  assert.equal(r.status, 200, `entrar ${email}: ${r.texto}`);
  api.usarCookie(r.cookie);
  return r.cookie!;
}

/** Como el administrador, crea un usuario con ese rol; la cookie queda en el administrador. */
async function crearUsuario(api: Cliente, admin: string, email: string, rol: string) {
  api.usarCookie(admin);
  const r = await api.post("/api/usuarios", { email, clave: CLAVE, rol });
  assert.equal(r.status, 201, r.texto);
  return r.json as { id: number; email: string; rol: string };
}

describe("tabla de permisos", () => {
  it("el administrador puede todo; el aprobador, consultar y avanzar roles; el lector, solo consultar", () => {
    assert.deepEqual([...permisosDe("lector")], ["ver"]);
    assert.deepEqual([...permisosDe("aprobador")], ["ver", "validar", "aprobar", "publicar"]);
    for (const p of ["ver", "editar", "validar", "aprobar", "publicar", "pagar", "usuarios"] as const) {
      assert.equal(puede("administrador", p), true, p);
    }
    assert.equal(puede("aprobador", "pagar"), false);
    assert.equal(puede("aprobador", "editar"), false);
  });

  it("cada ruta pide el permiso que le toca, y lo desconocido pide «editar»", () => {
    const casos: [string, string, string][] = [
      ["GET", "/empleados", "ver"],
      ["GET", "/roles/3/csv", "ver"],
      ["POST", "/simulacion", "ver"],
      ["POST", "/empleados", "editar"],
      ["PUT", "/regimenes/LOSEP", "editar"],
      ["DELETE", "/roles/3", "editar"],
      ["POST", "/roles/generar", "editar"],
      ["PATCH", "/empleados/1/estado", "editar"],
      ["POST", "/roles/3/validar", "validar"],
      ["POST", "/roles/3/aprobar", "aprobar"],
      ["POST", "/roles/3/publicar", "publicar"],
      ["POST", "/roles/3/pagar", "pagar"],
      ["POST", "/roles/3/PAGAR/", "pagar"],
      ["GET", "/usuarios", "usuarios"],
      ["PATCH", "/usuarios/2", "usuarios"],
      ["GET", "/Usuarios/", "usuarios"],
      ["POST", "/ruta-nueva-que-nadie-conoce", "editar"],
      ["PUT", "/roles/3/aprobar", "editar"], // el paso del ciclo solo vale con POST
    ];
    for (const [metodo, ruta, esperado] of casos) {
      assert.equal(permisoQueExige(metodo, ruta), esperado, `${metodo} ${ruta}`);
    }
  });
});

describe("permisos en la API", () => {
  // [método, ruta, cuerpo, roles que NO deben recibir 403]. Quien sí puede recibe 400/404 por el cuerpo vacío.
  const RUTAS: [string, string, object, string[]][] = [
    ["GET", "/api/empleados", {}, ["administrador", "aprobador", "lector"]],
    ["GET", "/api/roles", {}, ["administrador", "aprobador", "lector"]],
    ["GET", "/api/cuenta", {}, ["administrador", "aprobador", "lector"]],
    ["POST", "/api/simulacion", {}, ["administrador", "aprobador", "lector"]],
    ["POST", "/api/empleados", {}, ["administrador"]],
    ["PUT", "/api/empleados/1", {}, ["administrador"]],
    ["PATCH", "/api/empleados/1/estado", {}, ["administrador"]],
    ["DELETE", "/api/empleados/999", {}, ["administrador"]],
    ["PUT", "/api/regimenes/LOSEP", {}, ["administrador"]],
    ["PUT", "/api/parametros/2026", {}, ["administrador"]],
    ["POST", "/api/escala", {}, ["administrador"]],
    ["POST", "/api/puestos", {}, ["administrador"]],
    ["PUT", "/api/cuenta", {}, ["administrador"]],
    ["POST", "/api/roles/generar", {}, ["administrador"]],
    ["DELETE", "/api/roles/999", {}, ["administrador"]],
    ["POST", "/api/roles/999/validar", {}, ["administrador", "aprobador"]],
    ["POST", "/api/roles/999/aprobar", {}, ["administrador", "aprobador"]],
    ["POST", "/api/roles/999/publicar", {}, ["administrador", "aprobador"]],
    ["POST", "/api/roles/999/pagar", {}, ["administrador"]],
    ["GET", "/api/usuarios", {}, ["administrador"]],
    ["POST", "/api/usuarios", {}, ["administrador"]],
    ["PATCH", "/api/usuarios/999", {}, ["administrador"]],
    ["DELETE", "/api/usuarios/999", {}, ["administrador"]],
  ];

  it("cada rol recibe 403 exactamente en lo que no puede hacer", () =>
    conEmpresa(async (api, admin) => {
      for (const rol of ROLES_USUARIO) {
        const correo = `${rol}@empresa.com`;
        if (rol !== "administrador") await crearUsuario(api, admin, correo, rol);
        await entrar(api, rol === "administrador" ? REGISTRO.email : correo);
        for (const [metodo, ruta, cuerpo, permitidos] of RUTAS) {
          const r = await (metodo === "GET" ? api.get(ruta) : metodo === "DELETE" ? api.del(ruta)
            : metodo === "PUT" ? api.put(ruta, cuerpo) : metodo === "PATCH" ? api.patch(ruta, cuerpo) : api.post(ruta, cuerpo));
          assert.equal(r.status === 403, !permitidos.includes(rol), `${rol} ${metodo} ${ruta} -> ${r.status}`);
        }
      }
    }));

  it("el 403 dice qué rol tiene quien lo recibe", () =>
    conEmpresa(async (api, admin) => {
      await crearUsuario(api, admin, "lector@empresa.com", "lector");
      await entrar(api, "lector@empresa.com");
      const r = await api.post("/api/empleados", {});
      assert.equal(r.status, 403);
      assert.deepEqual(r.json.errores, ["Tu rol (lector) no permite hacer esto."]);
    }));

  it("/auth/yo informa el rol y los permisos de quien entró", () =>
    conEmpresa(async (api, admin) => {
      assert.equal((await api.get("/api/auth/yo")).json.rol, "administrador");
      await crearUsuario(api, admin, "lector@empresa.com", "lector");
      await entrar(api, "lector@empresa.com");
      const yo = (await api.get("/api/auth/yo")).json;
      assert.equal(yo.rol, "lector");
      assert.deepEqual(yo.permisos, ["ver"]);
    }));

  it("un lector consulta un rol completo, pero no puede moverlo", () =>
    conEmpresa(async (api, admin) => {
      const { id } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json;
      await crearUsuario(api, admin, "lector@empresa.com", "lector");
      await entrar(api, "lector@empresa.com");
      assert.equal((await api.get(`/api/roles/${id}`)).status, 200);
      assert.equal((await api.get(`/api/roles/${id}/historial`)).status, 200);
      assert.equal((await api.get(`/api/roles/${id}/csv`)).status, 200);
      assert.equal((await api.post(`/api/roles/${id}/validar`)).status, 403);
    }));

  it("el aprobador lleva el rol de validado a publicado; el pago es del administrador", () =>
    conEmpresa(async (api, admin) => {
      const { id } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json;
      await crearUsuario(api, admin, "aprobador@empresa.com", "aprobador");
      await entrar(api, "aprobador@empresa.com");
      assert.equal((await api.post(`/api/roles/${id}/validar`)).json.valido, true);
      assert.equal((await api.post(`/api/roles/${id}/aprobar`)).json.estado, "aprobado");
      assert.equal((await api.post(`/api/roles/${id}/publicar`)).json.estado, "publicado");
      assert.equal((await api.post(`/api/roles/${id}/pagar`)).status, 403);

      api.usarCookie(admin);
      assert.equal((await api.post(`/api/roles/${id}/pagar`)).json.estado, "pagado");
      const historial = (await api.get(`/api/roles/${id}/historial`)).json;
      assert.deepEqual(
        historial.map((h: { usuario: string }) => h.usuario),
        [REGISTRO.email, "aprobador@empresa.com", "aprobador@empresa.com", "aprobador@empresa.com", REGISTRO.email],
      );
    }));
});

describe("usuarios de la cuenta", () => {
  it("el administrador crea un usuario, que entra con el rol asignado, y lo ve en la lista", () =>
    conEmpresa(async (api, admin) => {
      const nuevo = await crearUsuario(api, admin, "  Ana@Empresa.COM ", "aprobador");
      assert.equal(nuevo.email, "ana@empresa.com");
      const lista = (await api.get("/api/usuarios")).json;
      assert.deepEqual(lista.roles, ["administrador", "aprobador", "lector"]);
      assert.deepEqual(lista.usuarios.map((u: { email: string; rol: string }) => [u.email, u.rol]), [
        [REGISTRO.email, "administrador"], ["ana@empresa.com", "aprobador"],
      ]);
      assert.ok(lista.usuarios.every((u: object) => !("claveHash" in u) && !("clave_hash" in u)));
      await entrar(api, "ana@empresa.com");
      assert.equal((await api.get("/api/auth/yo")).json.rol, "aprobador");
    }));

  it("rechaza datos inválidos y un correo repetido, incluso de otra empresa", () =>
    conEmpresa(async (api, admin) => {
      const malo = await api.post("/api/usuarios", { email: "no-es-correo", clave: "corta", rol: "jefe" });
      assert.equal(malo.status, 400);
      assert.equal(malo.json.errores.length, 3);
      await crearUsuario(api, admin, "ana@empresa.com", "lector");
      assert.equal((await api.post("/api/usuarios", { email: "ANA@empresa.com", clave: CLAVE, rol: "lector" })).status, 409);
      // El correo del propio administrador de otra empresa también está en uso.
      await api.registrar({ ruc: "1790011674001", email: "otra@empresa.com", empresa: "Otra S.A." });
      assert.equal((await api.post("/api/usuarios", { email: "ana@empresa.com", clave: CLAVE, rol: "lector" })).status, 409);
    }));

  it("un cambio de rol vale de inmediato, con la misma cookie", () =>
    conEmpresa(async (api, admin) => {
      const lector = await crearUsuario(api, admin, "ana@empresa.com", "lector");
      const cookieLector = await entrar(api, "ana@empresa.com");
      assert.equal((await api.post("/api/empleados", {})).status, 403);

      api.usarCookie(admin);
      assert.equal((await api.patch(`/api/usuarios/${lector.id}`, { rol: "administrador" })).json.rol, "administrador");
      api.usarCookie(cookieLector);
      assert.equal((await api.post("/api/empleados", {})).status, 400); // ya no es 403: llegó a validar el cuerpo
      api.usarCookie(admin);
      await api.patch(`/api/usuarios/${lector.id}`, { rol: "lector" });
      api.usarCookie(cookieLector);
      assert.equal((await api.post("/api/empleados", {})).status, 403);
    }));

  it("un usuario eliminado pierde el acceso al instante, aunque su cookie siga vigente", () =>
    conEmpresa(async (api, admin) => {
      const usuario = await crearUsuario(api, admin, "ana@empresa.com", "lector");
      const cookie = await entrar(api, "ana@empresa.com");
      assert.equal((await api.get("/api/empleados")).status, 200);

      api.usarCookie(admin);
      assert.equal((await api.del(`/api/usuarios/${usuario.id}`)).status, 204);
      api.usarCookie(cookie);
      assert.equal((await api.get("/api/empleados")).status, 401);
      assert.equal((await api.get("/api/auth/yo")).json.autenticado, false);
    }));

  it("cambiar la contraseña invalida la anterior", () =>
    conEmpresa(async (api, admin) => {
      const usuario = await crearUsuario(api, admin, "ana@empresa.com", "lector");
      api.usarCookie(admin);
      assert.equal((await api.patch(`/api/usuarios/${usuario.id}`, { clave: "otra-clave-larga-9" })).status, 200);
      api.usarCookie(null);
      assert.equal((await api.post("/api/auth/entrar", { email: "ana@empresa.com", clave: CLAVE })).status, 401);
      assert.equal((await api.post("/api/auth/entrar", { email: "ana@empresa.com", clave: "otra-clave-larga-9" })).status, 200);
      api.usarCookie(admin);
      assert.equal((await api.patch(`/api/usuarios/${usuario.id}`, { clave: "corta" })).status, 400);
      assert.equal((await api.patch(`/api/usuarios/${usuario.id}`, {})).status, 400);
    }));

  it("la cuenta conserva al menos un administrador", () =>
    conEmpresa(async (api, admin) => {
      const yo = (await api.get("/api/usuarios")).json.usuarios[0];
      // Ni degradarse ni eliminarse siendo el único.
      const degradar = await api.patch(`/api/usuarios/${yo.id}`, { rol: "lector" });
      assert.equal(degradar.status, 409);
      assert.match(degradar.json.errores[0], /al menos un administrador/);
      assert.equal((await api.del(`/api/usuarios/${yo.id}`)).status, 409);

      // Con otro administrador se puede degradar a uno; el último vuelve a quedar protegido.
      const otro = await crearUsuario(api, admin, "otro@empresa.com", "administrador");
      assert.equal((await api.patch(`/api/usuarios/${yo.id}`, { rol: "lector" })).status, 200);
      await entrar(api, "otro@empresa.com");
      assert.equal((await api.patch(`/api/usuarios/${otro.id}`, { rol: "lector" })).status, 409);
      assert.equal((await api.get("/api/usuarios")).json.usuarios.length, 2);
    }));

  it("nadie se elimina a sí mismo", () =>
    conEmpresa(async (api, admin) => {
      await crearUsuario(api, admin, "otro@empresa.com", "administrador");
      const yo = (await api.get("/api/usuarios")).json.usuarios[0];
      const r = await api.del(`/api/usuarios/${yo.id}`);
      assert.equal(r.status, 409);
      assert.match(r.json.errores[0], /propio usuario/);
    }));

  it("una empresa no ve ni toca los usuarios de otra", () =>
    conEmpresa(async (api, admin) => {
      const ana = await crearUsuario(api, admin, "ana@empresa.com", "lector");
      await api.registrar({ ruc: "1790011674001", email: "otra@empresa.com", empresa: "Otra S.A." });
      assert.deepEqual((await api.get("/api/usuarios")).json.usuarios.map((u: { email: string }) => u.email), ["otra@empresa.com"]);
      assert.equal((await api.patch(`/api/usuarios/${ana.id}`, { rol: "administrador" })).status, 404);
      assert.equal((await api.del(`/api/usuarios/${ana.id}`)).status, 404);
    }));

  it("crear, cambiar de rol, cambiar la contraseña y eliminar quedan en la auditoría, sin la contraseña", () =>
    conEmpresa(async (api, admin) => {
      const ana = await crearUsuario(api, admin, "ana@empresa.com", "lector");
      await api.patch(`/api/usuarios/${ana.id}`, { rol: "aprobador", clave: "otra-clave-larga-9" });
      await api.del(`/api/usuarios/${ana.id}`);
      const filas = await consultar(api.db, "SELECT accion, usuario_email, detalle FROM audit_logs WHERE entidad = 'usuario' ORDER BY id");
      assert.deepEqual(filas.map((f) => f.accion), [
        "usuario.creado", "usuario.rol_cambiado", "usuario.clave_cambiada", "usuario.eliminado",
      ]);
      assert.ok(filas.every((f) => f.usuario_email === REGISTRO.email));
      assert.deepEqual(JSON.parse(String(filas[1].detalle)), { email: "ana@empresa.com", de: "lector", a: "aprobador" });
      assert.ok(filas.every((f) => !String(f.detalle).includes("clave")));
    }));
});

describe("separación de funciones", () => {
  it("con la regla activa, quien generó el rol no lo aprueba ni lo publica", () =>
    conEmpresa(async (api, admin) => {
      await crearUsuario(api, admin, "aprobador@empresa.com", "aprobador");
      api.usarCookie(admin);
      const yo = (await api.put("/api/cuenta", { empresa: REGISTRO.empresa, ruc: REGISTRO.ruc, separarFunciones: true })).json;
      assert.equal(yo.separarFunciones, true);

      const { id } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json;
      assert.equal((await api.post(`/api/roles/${id}/validar`)).json.valido, true); // validar no se restringe
      const propio = await api.post(`/api/roles/${id}/aprobar`);
      assert.equal(propio.status, 403);
      assert.match(propio.json.errores[0], /separación de funciones/);

      await entrar(api, "aprobador@empresa.com");
      assert.equal((await api.post(`/api/roles/${id}/aprobar`)).status, 200);
      api.usarCookie(admin);
      assert.equal((await api.post(`/api/roles/${id}/publicar`)).status, 403);
      await entrar(api, "aprobador@empresa.com");
      assert.equal((await api.post(`/api/roles/${id}/publicar`)).status, 200);
      api.usarCookie(admin);
      assert.equal((await api.post(`/api/roles/${id}/pagar`)).status, 200); // pagar no se restringe
    }));

  it("sin la regla (lo normal), la misma persona puede hacerlo todo", () =>
    conEmpresa(async (api) => {
      const { id } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json;
      for (const paso of ["validar", "aprobar", "publicar", "pagar"]) {
        assert.equal((await api.post(`/api/roles/${id}/${paso}`)).status, 200, paso);
      }
    }));

  it("editar solo el nombre y el RUC no apaga la regla, y el valor debe ser verdadero o falso", () =>
    conEmpresa(async (api) => {
      await api.put("/api/cuenta", { empresa: REGISTRO.empresa, ruc: REGISTRO.ruc, separarFunciones: true });
      const r = await api.put("/api/cuenta", { empresa: "Nuevo Nombre S.A.", ruc: REGISTRO.ruc });
      assert.equal(r.json.separarFunciones, true);
      assert.equal((await api.put("/api/cuenta", { empresa: REGISTRO.empresa, ruc: REGISTRO.ruc, separarFunciones: "si" })).status, 400);
      assert.equal((await api.get("/api/cuenta")).json.separarFunciones, true);
    }));
});
