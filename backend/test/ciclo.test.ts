import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { revisarRol } from "../src/ciclo.ts";
import { registrarCuenta } from "../src/cuentas.ts";
import { abrirBase, consultar, ejecutar } from "../src/db.ts";
import { cargarEmpleadosDemo, generarRolesDemo } from "../src/demo.ts";
import { cargarEmpleadosDePrueba, iniciar, REGISTRO } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

/** Cada prueba usa su propia API con los 6 empleados de ejemplo. */
async function conDemo(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

const generar = (api: Cliente, novedades: object[] = [], anio = 2026, mes = 10) =>
  api.post("/api/roles/generar", { anio, mes, novedades });

/** Genera el rol de octubre y lo lleva hasta el estado pedido. */
async function rolEn(api: Cliente, hasta: "calculado" | "validado" | "aprobado" | "publicado" | "pagado") {
  const { id } = (await generar(api)).json;
  const pasos = ["validar", "aprobar", "publicar", "pagar"];
  const hechos = ["calculado", "validado", "aprobado", "publicado", "pagado"].indexOf(hasta);
  for (const paso of pasos.slice(0, hechos)) {
    const r = await api.post(`/api/roles/${id}/${paso}`);
    assert.equal(r.status, 200, `${paso}: ${r.texto}`);
  }
  return id as number;
}

const estadoDe = async (api: Cliente, id: number) => (await api.get(`/api/roles/${id}`)).json.estado;

describe("ciclo del rol", () => {
  it("un rol nuevo nace «calculado» y avanza paso a paso hasta «pagado»", () =>
    conDemo(async (api) => {
      const { id } = (await generar(api)).json;
      assert.equal(await estadoDe(api, id), "calculado");

      const validacion = await api.post(`/api/roles/${id}/validar`);
      assert.equal(validacion.json.valido, true);
      assert.equal(validacion.json.estado, "validado");

      assert.equal((await api.post(`/api/roles/${id}/aprobar`)).json.estado, "aprobado");
      const publicado = (await api.post(`/api/roles/${id}/publicar`)).json;
      assert.equal(publicado.estado, "publicado");
      assert.ok(publicado.publicadoEn);
      const pagado = (await api.post(`/api/roles/${id}/pagar`)).json;
      assert.equal(pagado.estado, "pagado");
      assert.ok(pagado.pagadoEn);
    }));

  it("no se salta pasos ni repite uno ya dado", () =>
    conDemo(async (api) => {
      const { id } = (await generar(api)).json;
      for (const paso of ["aprobar", "publicar", "pagar"]) {
        const r = await api.post(`/api/roles/${id}/${paso}`);
        assert.equal(r.status, 409, paso);
        assert.match(r.json.errores[0], /«calculado»/);
      }
      await api.post(`/api/roles/${id}/validar`);
      await api.post(`/api/roles/${id}/aprobar`);
      assert.equal((await api.post(`/api/roles/${id}/aprobar`)).status, 409);
      assert.equal((await api.post(`/api/roles/${id}/validar`)).status, 409);
      assert.equal(await estadoDe(api, id), "aprobado");
    }));

  it("un rol publicado no se recalcula, no se elimina y el mes lo reporta", () =>
    conDemo(async (api) => {
      const id = await rolEn(api, "publicado");
      const antes = (await api.get(`/api/roles/${id}`)).json;

      const recalculo = await generar(api, [{ empleadoId: 2, comisiones: 500 }]);
      assert.equal(recalculo.status, 409);
      assert.match(recalculo.json.errores[0], /«publicado».*no se puede recalcular/);
      assert.equal((await api.del(`/api/roles/${id}`)).status, 409);

      assert.deepEqual((await api.get(`/api/roles/${id}`)).json, antes);
      assert.equal((await api.get("/api/roles/periodo/2026/10")).json.estado, "publicado");
      // Pagado tampoco se toca.
      await api.post(`/api/roles/${id}/pagar`);
      assert.equal((await generar(api)).status, 409);
      assert.equal((await api.del(`/api/roles/${id}`)).status, 409);
    }));

  it("recalcular un rol sin publicar lo devuelve a «calculado» y quita lo aprobado", () =>
    conDemo(async (api) => {
      const viejo = await rolEn(api, "aprobado");
      const nuevo = (await generar(api, [{ empleadoId: 2, comisiones: 100 }])).json.id;
      assert.notEqual(nuevo, viejo);
      assert.equal(await estadoDe(api, nuevo), "calculado");
      assert.equal((await api.get(`/api/roles/${viejo}`)).status, 404);
      assert.equal((await api.post(`/api/roles/${nuevo}/publicar`)).status, 409);
    }));

  it("un rol sin publicar se puede eliminar", () =>
    conDemo(async (api) => {
      const id = await rolEn(api, "aprobado");
      assert.equal((await api.del(`/api/roles/${id}`)).status, 204);
      assert.equal((await api.get(`/api/roles/${id}`)).status, 404);
    }));

  it("dos publicaciones simultáneas: solo una se logra", () =>
    conDemo(async (api) => {
      const id = await rolEn(api, "aprobado");
      const respuestas = await Promise.all([1, 2, 3].map(() => api.post(`/api/roles/${id}/publicar`)));
      assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 409, 409]);
      const historial = (await api.get(`/api/roles/${id}/historial`)).json;
      assert.equal(historial.filter((h: { accion: string }) => h.accion === "rol.publicado").length, 1);
    }));
});

describe("validación del rol", () => {
  it("bloquea si falta alguien que debería estar en el período", () =>
    conDemo(async (api) => {
      await api.patch("/api/empleados/2/estado", { fechaSalida: "2026-09-30" });
      const { id } = (await generar(api)).json;
      await api.patch("/api/empleados/2/estado", {}); // vuelve a la empresa y a octubre

      const r = await api.post(`/api/roles/${id}/validar`);
      assert.equal(r.status, 200);
      assert.equal(r.json.valido, false);
      assert.equal(r.json.estado, "calculado");
      assert.match(r.json.errores[0], /Carlos Andrés Villacís.*no está en el rol/);
      assert.equal((await api.post(`/api/roles/${id}/aprobar`)).status, 409);
    }));

  it("bloquea si hay un neto negativo", () =>
    conDemo(async (api) => {
      const { id } = (await generar(api, [{ empleadoId: 4, otrosDescuentos: 5000 }])).json;
      const r = (await api.post(`/api/roles/${id}/validar`)).json;
      assert.equal(r.valido, false);
      assert.match(r.errores.join(" "), /José Luis Camacho: el neto a pagar es negativo/);
    }));

  it("bloquea si no hay parámetros de ley del año del rol", () =>
    conDemo(async (api) => {
      const { id } = (await generar(api, [], 2031, 1)).json;
      const r = (await api.post(`/api/roles/${id}/validar`)).json;
      assert.equal(r.valido, false);
      assert.match(r.errores[0], /No hay parámetros de ley de 2031/);
    }));

  it("publicar vuelve a revisar: lo que cambió después de validar lo detiene", () =>
    conDemo(async (api) => {
      await api.patch("/api/empleados/2/estado", { fechaSalida: "2026-09-30" });
      const id = await rolEn(api, "aprobado");
      await api.patch("/api/empleados/2/estado", {});

      const r = await api.post(`/api/roles/${id}/publicar`);
      assert.equal(r.status, 409);
      assert.equal(r.json.errores[0], "No se puede publicar el rol:");
      assert.match(r.json.errores[1], /no está en el rol/);
      assert.equal(await estadoDe(api, id), "aprobado");
    }));

  it("un rol validado que deja de cumplir vuelve a «calculado»", () =>
    conDemo(async (api) => {
      await api.patch("/api/empleados/2/estado", { fechaSalida: "2026-09-30" });
      const { id } = (await generar(api)).json;
      assert.equal((await api.post(`/api/roles/${id}/validar`)).json.estado, "validado");
      await api.patch("/api/empleados/2/estado", {});
      const r = (await api.post(`/api/roles/${id}/validar`)).json;
      assert.equal(r.valido, false);
      assert.equal(r.estado, "calculado");
    }));

  it("avisa, sin bloquear, de valores raros", () =>
    conDemo(async (api) => {
      const { id } = (await generar(api, [{ empleadoId: 4, comisiones: 3000 }])).json;
      const r = (await api.post(`/api/roles/${id}/validar`)).json;
      assert.equal(r.valido, true);
      assert.match(r.avisos[0], /José Luis Camacho.*superan el doble de su sueldo base/);
    }));
});

describe("auditoría del rol", () => {
  it("registra cada paso con el usuario y deja ver el historial en orden", () =>
    conDemo(async (api) => {
      const id = await rolEn(api, "pagado");
      const historial = (await api.get(`/api/roles/${id}/historial`)).json;
      assert.deepEqual(
        historial.map((h: { accion: string }) => h.accion),
        ["rol.calculado", "rol.validado", "rol.aprobado", "rol.publicado", "rol.pagado"],
      );
      assert.ok(historial.every((h: { usuario: string }) => h.usuario === REGISTRO.email));
      assert.equal(historial[0].detalle.empleados, 6);
    }));

  it("guarda la validación rechazada con sus errores", () =>
    conDemo(async (api) => {
      const { id } = (await generar(api, [{ empleadoId: 4, otrosDescuentos: 5000 }])).json;
      await api.post(`/api/roles/${id}/validar`);
      const historial = (await api.get(`/api/roles/${id}/historial`)).json;
      assert.equal(historial[1].accion, "rol.validacion_rechazada");
      assert.match(historial[1].detalle.errores[0], /neto a pagar es negativo/);
    }));

  it("recalcular anota a qué rol reemplaza", () =>
    conDemo(async (api) => {
      const viejo = (await generar(api)).json.id;
      const nuevo = (await generar(api)).json.id;
      const historial = (await api.get(`/api/roles/${nuevo}/historial`)).json;
      assert.equal(historial[0].detalle.reemplazaAlRol, viejo);
    }));

  it("otra empresa no ve ni mueve el rol", () =>
    conDemo(async (api) => {
      const id = await rolEn(api, "validado");
      await api.registrar({ ruc: "1790011674001", email: "otra@empresa.com", empresa: "Otra S.A." });
      for (const paso of ["validar", "aprobar", "publicar", "pagar"]) {
        assert.equal((await api.post(`/api/roles/${id}/${paso}`)).status, 404, paso);
      }
      assert.equal((await api.get(`/api/roles/${id}/historial`)).status, 404);
    }));

  it("exige sesión", () =>
    conDemo(async (api) => {
      const id = await rolEn(api, "validado");
      api.usarCookie(null);
      for (const ruta of ["validar", "aprobar", "publicar", "pagar"]) {
        assert.equal((await api.post(`/api/roles/${id}/${ruta}`)).status, 401, ruta);
      }
      assert.equal((await api.get(`/api/roles/${id}/historial`)).status, 401);
    }));
});

describe("protecciones de la base", () => {
  async function conRolEnero(prueba: (db: Awaited<ReturnType<typeof abrirBase>>, rolId: number) => Promise<void>) {
    const db = await abrirBase(":memory:");
    try {
      const { cuentaId } = await registrarCuenta(db, REGISTRO);
      await cargarEmpleadosDemo(db, cuentaId);
      await generarRolesDemo(db, cuentaId);
      const [rol] = await consultar(db, "SELECT id FROM roles_cabecera WHERE mes = 1");
      await prueba(db, Number(rol.id));
    } finally {
      await db.cerrar();
    }
  }

  it("un rol publicado solo admite pasar a «pagado»", () =>
    conRolEnero(async (db, id) => {
      await ejecutar(db, "UPDATE roles_cabecera SET total_neto = 1 WHERE id = ?", id); // calculado: se puede
      await ejecutar(db, "UPDATE roles_cabecera SET estado = 'publicado' WHERE id = ?", id);
      await assert.rejects(ejecutar(db, "UPDATE roles_cabecera SET total_neto = 2 WHERE id = ?", id), /no se puede modificar/);
      await assert.rejects(ejecutar(db, "UPDATE roles_cabecera SET estado = 'calculado' WHERE id = ?", id), /no se puede modificar/);
      await assert.rejects(ejecutar(db, "UPDATE roles_detalle SET neto_pagar = 1 WHERE rol_id = ?", id), /su detalle no se puede modificar/);
      await ejecutar(db, "UPDATE roles_cabecera SET estado = 'pagado', pagado_en = '2026-02-01T00:00:00' WHERE id = ?", id);
      await assert.rejects(ejecutar(db, "UPDATE roles_cabecera SET estado = 'publicado' WHERE id = ?", id), /no se puede modificar/);
    }));

  it("el registro de auditoría no se modifica ni se borra", () =>
    conRolEnero(async (db) => {
      const [{ cuenta_id: cuentaId }] = await consultar(db, "SELECT cuenta_id FROM roles_cabecera LIMIT 1");
      await ejecutar(
        db,
        "INSERT INTO audit_logs (cuenta_id, accion, entidad, entidad_id) VALUES (?, 'prueba', 'rol', 1)",
        cuentaId,
      );
      await assert.rejects(ejecutar(db, "UPDATE audit_logs SET accion = 'otra'"), /no se modifica ni se borra/);
      await assert.rejects(ejecutar(db, "DELETE FROM audit_logs"), /no se modifica ni se borra/);
    }));

  it("el seed deja constancia de que lo hizo el sistema", () =>
    conRolEnero(async (db, id) => {
      const [fila] = await consultar(db, "SELECT usuario_id, usuario_email FROM audit_logs WHERE entidad_id = ?", id);
      assert.equal(fila.usuario_id, null);
      assert.equal(fila.usuario_email, null);
    }));
});

describe("revisarRol", () => {
  const cabecera = {
    anio: 2026, mes: 3, num_empleados: 1, total_ingresos: 1000, total_descuentos: 94.5, total_neto: 905.5,
    total_provisiones: 200, total_costo: 1200,
  };
  const fila = {
    empleado_id: 1, nombres: "Ana", sueldo_base: 1000, total_ingresos: 1000, total_descuentos: 94.5,
    neto_pagar: 905.5, total_provisiones: 200, costo_empleador: 1200,
  };

  it("un rol coherente no tiene errores", () => {
    assert.deepEqual(revisarRol(cabecera, [fila], [{ id: 1, nombres: "Ana" }], 2026), { errores: [], avisos: [] });
  });

  it("detecta una cabecera que no cuadra con el detalle", () => {
    const { errores } = revisarRol({ ...cabecera, total_neto: 900 }, [fila], [{ id: 1, nombres: "Ana" }], 2026);
    assert.deepEqual(errores, ["El total de neto de la cabecera no cuadra con la suma del detalle."]);
  });

  it("un rol sin empleados es un error", () => {
    assert.match(revisarRol({ ...cabecera, num_empleados: 0 }, [], [], 2026).errores[0], /ningún empleado/);
  });
});
