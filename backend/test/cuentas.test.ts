import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EMPLEADO, iniciar, REGISTRO } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

const OTRA = { empresa: "Otra Empresa Cía. Ltda.", ruc: "1790010937001", email: "otra@empresa.com", clave: "otra-clave-larga-2" };

/** Dos empresas en la misma API: A queda con la sesión abierta, y `cookieB` entra a B. */
async function conDosEmpresas(prueba: (api: Cliente, entrarComoA: () => void, entrarComoB: () => void) => Promise<void>) {
  const api = await iniciar({ sinSesion: true });
  try {
    const a = await api.registrar();
    const cookieA = a.cookie;
    const b = await api.registrar(OTRA);
    const cookieB = b.cookie;
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    await prueba(api, () => api.usarCookie(cookieA), () => api.usarCookie(cookieB));
  } finally {
    await api.cerrar();
  }
}

/** Primer puesto y primer grado del Código del Trabajo de la empresa con la sesión abierta. */
async function nivelDelAuxiliar(api: Cliente) {
  const puestos = (await api.get("/api/puestos")).json;
  const auxiliar = puestos.find((p: { nombre: string }) => p.nombre === "Auxiliar de guardalmacén");
  return { puestoId: auxiliar.id as number, escalaId: auxiliar.escalaId as number };
}

describe("registro de una empresa", () => {
  it("crea la cuenta, deja la sesión abierta y responde con los datos de la empresa", async () => {
    const api = await iniciar({ sinSesion: true });
    try {
      const r = await api.registrar({ email: "  Nomina@Empresa.COM " });
      assert.equal(r.status, 201);
      assert.deepEqual(r.json, {
        autenticado: true, email: "nomina@empresa.com", empresa: { nombre: REGISTRO.empresa, ruc: REGISTRO.ruc },
        rol: "administrador", permisos: ["ver", "editar", "validar", "aprobar", "publicar", "pagar", "usuarios"],
      });
      assert.match(r.cabeceras.getSetCookie()[0], /^rol_sesion=.*HttpOnly/i);
      assert.equal((await api.get("/api/empleados")).status, 200);
    } finally {
      await api.cerrar();
    }
  });

  it("la cuenta nueva recibe su propia copia de las reglas de ley, la escala y el orgánico", async () => {
    const api = await iniciar();
    try {
      assert.equal((await api.get("/api/regimenes")).json.length, 3);
      assert.equal((await api.get("/api/escala")).json.length, 33);
      assert.equal((await api.get("/api/puestos")).json.length, 5);
      const p = (await api.get("/api/parametros")).json;
      assert.equal(p.sbu, 482);
      assert.deepEqual(p.empresa, { nombre: REGISTRO.empresa, ruc: REGISTRO.ruc });
      assert.deepEqual((await api.get("/api/empleados")).json, []);
      assert.deepEqual((await api.get("/api/roles")).json, []);
    } finally {
      await api.cerrar();
    }
  });

  it("reporta juntos los datos inválidos", async () => {
    const api = await iniciar({ sinSesion: true });
    try {
      const r = await api.registrar({ empresa: "", ruc: "123", email: "no-es-correo", clave: "corta" });
      assert.equal(r.status, 400);
      assert.equal(r.json.errores.length, 4);
      assert.match(r.json.errores.join(" "), /empresa.*RUC.*correo.*contraseña/s);
      assert.equal(r.cookie, null);
      assert.equal((await api.post("/api/auth/registro", { ...REGISTRO, ruc: "1790010938001" })).status, 400); // verificador mal
      assert.equal((await api.post("/api/auth/registro", { ...REGISTRO, clave: "x".repeat(201) })).status, 400);
      assert.equal((await api.post("/api/auth/registro", { ...REGISTRO, empresa: { $ne: "" } })).status, 400);
    } finally {
      await api.cerrar();
    }
  });

  it("un correo ya registrado responde 409, sin importar mayúsculas, y no crea nada", async () => {
    const api = await iniciar({ sinSesion: true });
    try {
      assert.equal((await api.registrar()).status, 201);
      const repetido = await api.registrar({ email: REGISTRO.email.toUpperCase(), empresa: "Otra" });
      assert.equal(repetido.status, 409);
      assert.deepEqual(repetido.json.errores, ["Ya existe una cuenta con ese correo."]);
      assert.equal(repetido.cookie, null);
    } finally {
      await api.cerrar();
    }
  });

  it("limita los registros desde una misma conexión", async () => {
    const api = await iniciar({ sinSesion: true });
    try {
      for (let i = 0; i < 5; i++) assert.equal((await api.registrar({ email: `empresa${i}@correo.com` })).status, 201);
      const r = await api.registrar({ email: "una-mas@correo.com" });
      assert.equal(r.status, 429);
      assert.match(r.cabeceras.get("retry-after") ?? "", /^\d+$/);
    } finally {
      await api.cerrar();
    }
  });
});

describe("datos de la empresa", () => {
  it("se leen y se editan, validando nombre y RUC", async () => {
    const api = await iniciar();
    try {
      assert.deepEqual((await api.get("/api/cuenta")).json, { nombre: REGISTRO.empresa, ruc: REGISTRO.ruc, separarFunciones: false });
      const r = await api.put("/api/cuenta", { empresa: "Nuevo Nombre S.A.", ruc: "1790010937001" });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json, { nombre: "Nuevo Nombre S.A.", ruc: "1790010937001", separarFunciones: false });
      assert.equal((await api.get("/api/parametros")).json.empresa.nombre, "Nuevo Nombre S.A.");
      assert.equal((await api.put("/api/cuenta", { empresa: "X", ruc: "1" })).status, 400);
      assert.equal((await api.get("/api/cuenta")).json.nombre, "Nuevo Nombre S.A.");
    } finally {
      await api.cerrar();
    }
  });
});

describe("aislamiento entre empresas", () => {
  it("una empresa no ve, edita, desactiva ni borra los empleados de otra", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      const { puestoId, escalaId } = await nivelDelAuxiliar(api);
      const creado = await api.post("/api/empleados", { ...EMPLEADO, puestoId, escalaId });
      assert.equal(creado.status, 201, JSON.stringify(creado.json));
      const id = creado.json.id;

      comoB();
      assert.deepEqual((await api.get("/api/empleados")).json, []);
      assert.equal((await api.get(`/api/empleados/${id}`)).status, 404);
      const b = await nivelDelAuxiliar(api);
      assert.equal((await api.put(`/api/empleados/${id}`, { ...EMPLEADO, ...b, nombres: "Cambiado" })).status, 404);
      assert.equal((await api.patch(`/api/empleados/${id}/estado`, {})).status, 404);
      assert.equal((await api.del(`/api/empleados/${id}`)).status, 404);

      comoA();
      const intacto = (await api.get(`/api/empleados/${id}`)).json;
      assert.equal(intacto.nombres, EMPLEADO.nombres);
      assert.equal(intacto.activo, true);
    }));

  it("la misma cédula se puede registrar en dos empresas, pero no dos veces en una", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      for (const entrar of [comoA, comoB]) {
        entrar();
        const n = await nivelDelAuxiliar(api);
        assert.equal((await api.post("/api/empleados", { ...EMPLEADO, ...n })).status, 201);
        assert.equal((await api.post("/api/empleados", { ...EMPLEADO, ...n })).status, 409);
      }
    }));

  it("un empleado no puede apuntar al puesto ni al grado de otra empresa", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      const deA = await nivelDelAuxiliar(api);
      comoB();
      const r = await api.post("/api/empleados", { ...EMPLEADO, ...deA });
      assert.equal(r.status, 400);
      assert.match(r.json.errores.join(" "), /puesto no existe/);
      assert.deepEqual((await api.get("/api/empleados")).json, []);
      // ni siquiera con el puesto de B y el grado de A
      const deB = await nivelDelAuxiliar(api);
      assert.equal((await api.post("/api/empleados", { ...EMPLEADO, puestoId: deB.puestoId, escalaId: deA.escalaId })).status, 400);
    }));

  it("el orgánico y la escala son de cada empresa: editar uno no cambia el de la otra", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      const puestosA = (await api.get("/api/puestos")).json;
      const gerente = puestosA[0];
      const editado = await api.put(`/api/puestos/${gerente.id}`, { ...gerente, nombre: "Director" });
      assert.equal(editado.status, 200);
      const gradosA = (await api.get("/api/escala")).json;
      assert.equal((await api.del(`/api/escala/${gradosA[5].id}`)).status, 204);
      assert.equal((await api.post("/api/puestos", { ...gerente, nombre: "Solo de A", superiorId: null })).status, 201);

      comoB();
      const puestosB = (await api.get("/api/puestos")).json;
      assert.deepEqual(puestosB.map((p: { nombre: string }) => p.nombre), [
        "Gerente / Propietario", "Administrador / Contador", "Supervisor de instalaciones",
        "Operaciones de instalaciones", "Auxiliar de guardalmacén",
      ]);
      assert.equal((await api.get("/api/escala")).json.length, 33);
      // B no puede tocar el puesto ni el grado de A
      assert.equal((await api.put(`/api/puestos/${gerente.id}`, { ...gerente, nombre: "Intruso" })).status, 404);
      assert.equal((await api.del(`/api/puestos/${gerente.id}`)).status, 404);
      assert.equal((await api.get(`/api/escala/${gradosA[1].id}`)).status, 404);
      assert.equal((await api.put(`/api/escala/${gradosA[1].id}`, gradosA[1])).status, 404);
      assert.equal((await api.del(`/api/escala/${gradosA[1].id}`)).status, 404);
      assert.equal((await api.patch(`/api/puestos/${gerente.id}/responsable`, { empleadoId: null })).status, 404);
    }));

  it("un nombre de puesto o un grado repetido solo choca dentro de la misma empresa", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      for (const entrar of [comoA, comoB]) {
        entrar();
        const [gerente] = (await api.get("/api/puestos")).json;
        const r = await api.post("/api/puestos", { ...gerente, nombre: "Puesto nuevo", superiorId: null });
        assert.equal(r.status, 201); // el mismo nombre en las dos empresas
        assert.equal((await api.post("/api/puestos", { ...gerente, nombre: "Puesto nuevo", superiorId: null })).status, 409);
      }
    }));

  it("los regímenes y los parámetros anuales son de cada empresa y no tocan la plantilla", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      const losep = (await api.get("/api/regimenes/LOSEP")).json;
      const r = await api.put("/api/regimenes/LOSEP", { ...losep, iessPersonal: 0.1 });
      assert.equal(r.status, 200);
      assert.equal(r.json.iessPersonal, 0.1);
      const parametros = (await api.get("/api/parametros?anio=2026")).json;
      assert.equal((await api.put("/api/parametros/2027", { sbu: 500, tablaIr: parametros.tablaIr, fuente: "A" })).status, 200);
      assert.deepEqual((await api.get("/api/parametros")).json.anios, [2027, 2026]);

      comoB();
      assert.equal((await api.get("/api/regimenes/LOSEP")).json.iessPersonal, 0.1145);
      assert.deepEqual((await api.get("/api/parametros")).json.anios, [2026]);

      // la página pública (sin sesión) sigue con la plantilla
      api.usarCookie(null);
      const publica = (await api.get("/api/parametros")).json;
      assert.deepEqual(publica.anios, [2026]);
      assert.equal(publica.regimenes.find((x: { codigo: string }) => x.codigo === "LOSEP").iessPersonal, 0.1145);
    }));

  it("los roles son de cada empresa: no se listan, se leen, se exportan ni se borran entre ellas", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      const nA = await nivelDelAuxiliar(api);
      await api.post("/api/empleados", { ...EMPLEADO, ...nA });
      const rolA = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).json.id;
      assert.ok(rolA);

      comoB();
      assert.deepEqual((await api.get("/api/roles")).json, []);
      for (const ruta of [`/api/roles/${rolA}`, `/api/roles/${rolA}/csv`, `/api/roles/${rolA}/iess`, `/api/roles/${rolA}/iess.csv`]) {
        assert.equal((await api.get(ruta)).status, 404, ruta);
      }
      assert.equal((await api.del(`/api/roles/${rolA}`)).status, 404);
      // B no tiene empleados: no puede generar el rol de ese mes, y eso no toca el de A
      assert.equal((await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [] })).status, 400);
      const periodo = (await api.get("/api/roles/periodo/2026/10")).json;
      assert.equal(periodo.existe, false);
      assert.deepEqual(periodo.empleados, []);

      comoA();
      assert.equal((await api.get(`/api/roles/${rolA}`)).status, 200);
      assert.equal((await api.get("/api/roles/periodo/2026/10")).json.existe, true);
    }));

  it("cada empresa genera el rol del mismo mes sin reemplazar el de la otra, y las novedades no se cruzan", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      const ids: number[] = [];
      for (const [entrar, comisiones] of [[comoA, 111], [comoB, 222]] as const) {
        entrar();
        const n = await nivelDelAuxiliar(api);
        const emp = (await api.post("/api/empleados", { ...EMPLEADO, ...n })).json;
        const r = await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: [{ empleadoId: emp.id, comisiones }] });
        assert.equal(r.status, 201);
        ids.push(r.json.id);
      }
      assert.notEqual(ids[0], ids[1]);

      comoA();
      assert.equal((await api.get("/api/roles")).json.length, 1);
      assert.equal((await api.get(`/api/roles/${ids[0]}`)).json.detalle[0].comisiones, 111);
      assert.equal((await api.get("/api/roles/periodo/2026/10")).json.empleados[0].novedades.comisiones, 111);
      comoB();
      assert.equal((await api.get(`/api/roles/${ids[1]}`)).json.detalle[0].comisiones, 222);
      assert.equal((await api.get("/api/roles/periodo/2026/10")).json.empleados[0].novedades.comisiones, 222);
    }));

  it("las novedades de un empleado de otra empresa se ignoran al generar el rol", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      const nA = await nivelDelAuxiliar(api);
      const deA = (await api.post("/api/empleados", { ...EMPLEADO, ...nA })).json;
      comoB();
      const nB = await nivelDelAuxiliar(api);
      const deB = (await api.post("/api/empleados", { ...EMPLEADO, cedula: "1702345677", ...nB })).json;
      const r = await api.post("/api/roles/generar", {
        anio: 2026, mes: 10, novedades: [{ empleadoId: deA.id, comisiones: 9999 }, { empleadoId: deB.id, comisiones: 5 }],
      });
      assert.equal(r.status, 201);
      const rol = (await api.get(`/api/roles/${r.json.id}`)).json;
      assert.equal(rol.detalle.length, 1);
      assert.equal(rol.detalle[0].comisiones, 5);
      comoA();
      assert.equal((await api.get("/api/roles/periodo/2026/10")).json.empleados[0].novedades.comisiones, 0);
    }));

  it("cargar los empleados de ejemplo es solo para la cuenta de quien lo pide", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      assert.equal((await api.post("/api/empleados/demo")).json.agregados, 12);
      assert.equal((await api.get("/api/empleados")).json.length, 12);
      comoB();
      assert.deepEqual((await api.get("/api/empleados")).json, []);
      assert.equal((await api.post("/api/empleados/demo")).json.agregados, 12); // la misma cédula no choca con la de A
    }));

  it("un responsable se asigna solo con empleados de la misma empresa", () =>
    conDosEmpresas(async (api, comoA, comoB) => {
      comoA();
      await api.post("/api/empleados/demo");
      const empleadoDeA = (await api.get("/api/empleados")).json[0].id;
      comoB();
      const [gerente] = (await api.get("/api/puestos")).json;
      const r = await api.patch(`/api/puestos/${gerente.id}/responsable`, { empleadoId: empleadoDeA });
      assert.equal(r.status, 400);
      assert.match(r.json.errores[0], /empleado no existe/);
    }));
});
