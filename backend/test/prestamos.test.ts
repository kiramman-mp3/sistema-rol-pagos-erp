import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calcularRol, calcularRolConTraza } from "../src/calculos.ts";
import { cuotaDelMes, numeroDeCuota } from "../src/prestamos.ts";
import type { Prestamo } from "../src/prestamos.ts";
import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

// Empleados de ejemplo: 1 María (CT, $4500), 2 Carlos (CT, $1800), 3 Lucía (LOSEP), 4 José (CT)...
const CARLOS = 2;
const MARIA = 1;

async function conDemo(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

const prestamo = (extra: object = {}) => ({
  empleadoId: CARLOS, tipo: "quirografario", cuota: 40, cuotas: 3, primerAnio: 2026, primerMes: 9, ...extra,
});

const generar = (api: Cliente, mes = 10) => api.post("/api/roles/generar", { anio: 2026, mes });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const de = (rol: { detalle: any[] }, empleadoId: number) => rol.detalle.find((d) => d.empleadoId === empleadoId);

const modelo = (extra: Partial<Prestamo> = {}): Prestamo => ({
  id: 1, empleadoId: 1, tipo: "quirografario", cuota: 40, cuotas: 3, primerAnio: 2026, primerMes: 11, activo: true, ...extra,
});

describe("cuota de un préstamo del IESS", () => {
  it("se descuenta desde el primer mes hasta completar las cuotas, también al cruzar el año", () => {
    const p = modelo();
    assert.equal(numeroDeCuota(p, 2026, 10), null);
    assert.equal(numeroDeCuota(p, 2026, 11), 1);
    assert.equal(numeroDeCuota(p, 2026, 12), 2);
    assert.equal(numeroDeCuota(p, 2027, 1), 3);
    assert.equal(numeroDeCuota(p, 2027, 2), null);
  });

  it("un préstamo suspendido no se descuenta", () => {
    assert.equal(numeroDeCuota(modelo({ activo: false }), 2026, 11), null);
  });

  it("la cuota del mes suma todos los préstamos que tocan ese mes", () => {
    const prestamos = [modelo(), modelo({ id: 2, cuota: 25.5, primerMes: 12 }), modelo({ id: 3, cuota: 10, activo: false })];
    assert.equal(cuotaDelMes(prestamos, 2026, 11).toNumber(), 40);
    assert.equal(cuotaDelMes(prestamos, 2026, 12).toNumber(), 65.5);
    assert.equal(cuotaDelMes(prestamos, 2027, 2).toNumber(), 25.5); // el primero ya terminó en enero
    assert.equal(cuotaDelMes(prestamos, 2027, 3).toNumber(), 0);
  });
});

describe("préstamos del IESS en el motor", () => {
  const entrada = { sueldoBase: 1000, fechaIngreso: "2024-01-10", anio: 2026, mes: 10 };

  it("la cuota baja el neto y entra al total de descuentos, sin tocar el IESS ni el impuesto", () => {
    const sin = calcularRol(entrada);
    const con = calcularRol({ ...entrada, prestamosIess: "40.50" });
    assert.equal(sin.descuentoPrestamos, 0);
    assert.equal(con.descuentoPrestamos, 40.5);
    assert.equal(con.totalDescuentos, Number((sin.totalDescuentos + 40.5).toFixed(2)));
    assert.equal(con.netoPagar, Number((sin.netoPagar - 40.5).toFixed(2)));
    assert.equal(con.aporteIess, sin.aporteIess);
    assert.equal(con.impuestoRenta, sin.impuestoRenta);
    assert.equal(con.costoEmpleador, sin.costoEmpleador);
  });

  it("la traza explica la cuota solo cuando hay préstamo", () => {
    const sin = calcularRolConTraza(entrada).traza.pasos;
    assert.equal(sin.some((p) => p.clave === "descuentoPrestamos"), false);
    const con = calcularRolConTraza({ ...entrada, prestamosIess: 40 }).traza.pasos;
    const paso = con.find((p) => p.clave === "descuentoPrestamos");
    assert.equal(paso?.resultado, 40);
    assert.match(con.find((p) => p.clave === "totalDescuentos")?.detalle ?? "", /\+ 40\.00 = /);
  });
});

describe("API de préstamos del IESS", () => {
  it("registra un préstamo y dice hasta qué mes se descuenta y cuánto suma", () =>
    conDemo(async (api) => {
      const r = await api.post("/api/prestamos", prestamo({ cuotas: 6, primerMes: 11, observacion: " Quirografario IESS " }));
      assert.equal(r.status, 201, r.texto);
      assert.equal(r.json.nombres, "Carlos Andrés Villacís");
      assert.equal(r.json.observacion, "Quirografario IESS");
      assert.equal(r.json.activo, true);
      assert.equal(r.json.total, 240);
      assert.equal(r.json.ultimoAnio, 2027);
      assert.equal(r.json.ultimoMes, 4);
    }));

  it("rechaza datos inválidos con todos los errores juntos", () =>
    conDemo(async (api) => {
      const r = await api.post("/api/prestamos", {
        empleadoId: 999, tipo: "usurero", cuota: 0, cuotas: 0, primerAnio: 1999, primerMes: 13,
      });
      assert.equal(r.status, 400);
      assert.equal(r.json.errores.length, 6);
      assert.equal((await api.get("/api/prestamos")).json.length, 0);
    }));

  it("no acepta un empleado de otra empresa", () =>
    conDemo(async (api) => {
      await api.registrar({ ruc: "1790011674001", email: "otra@empresa.com", empresa: "Otra S.A." });
      const r = await api.post("/api/prestamos", prestamo()); // Carlos es de la primera empresa
      assert.equal(r.status, 400);
      assert.deepEqual(r.json.errores, ["El empleado no existe."]);
    }));

  it("lista, filtra por empleado, edita, suspende y elimina", () =>
    conDemo(async (api) => {
      const a = (await api.post("/api/prestamos", prestamo())).json;
      await api.post("/api/prestamos", prestamo({ empleadoId: MARIA, cuota: 100 }));
      assert.equal((await api.get("/api/prestamos")).json.length, 2);
      assert.deepEqual((await api.get(`/api/prestamos?empleadoId=${CARLOS}`)).json.map((p: { id: number }) => p.id), [a.id]);

      const editado = await api.put(`/api/prestamos/${a.id}`, prestamo({ cuota: 55, cuotas: 4 }));
      assert.equal(editado.json.cuota, 55);
      assert.equal(editado.json.total, 220);

      assert.equal((await api.patch(`/api/prestamos/${a.id}/estado`)).json.activo, false);
      assert.equal((await api.patch(`/api/prestamos/${a.id}/estado`)).json.activo, true);

      assert.equal((await api.del(`/api/prestamos/${a.id}`)).status, 204);
      assert.equal((await api.get(`/api/prestamos/${a.id}`)).status, 404);
      assert.equal((await api.get("/api/prestamos/abc")).status, 400);
    }));

  it("se va con el empleado y sale en la exportación de la cuenta", () =>
    conDemo(async (api) => {
      await api.post("/api/prestamos", prestamo());
      assert.equal((await api.get("/api/cuenta/exportar")).json.prestamos_iess.length, 1);
      await api.del(`/api/empleados/${CARLOS}`);
      assert.equal((await api.get("/api/prestamos")).json.length, 0);
    }));
});

describe("préstamos del IESS en los roles", () => {
  it("el rol descuenta la cuota que toca en cada mes y solo a quien tiene el préstamo", () =>
    conDemo(async (api) => {
      await api.post("/api/prestamos", prestamo()); // cuotas de septiembre, octubre y noviembre
      const octubre = (await api.get(`/api/roles/${(await generar(api, 10)).json.id}`)).json;
      assert.equal(de(octubre, CARLOS).descuentoPrestamos, 40);
      assert.equal(de(octubre, MARIA).descuentoPrestamos, 0);
      const d = de(octubre, CARLOS);
      assert.equal(Number((d.totalIngresos - d.totalDescuentos).toFixed(2)), d.netoPagar);

      const noviembre = (await api.get(`/api/roles/${(await generar(api, 11)).json.id}`)).json;
      assert.equal(de(noviembre, CARLOS).descuentoPrestamos, 40);
      const diciembre = (await api.get(`/api/roles/${(await generar(api, 12)).json.id}`)).json;
      assert.equal(de(diciembre, CARLOS).descuentoPrestamos, 0);
      const agosto = (await api.get(`/api/roles/${(await generar(api, 8)).json.id}`)).json;
      assert.equal(de(agosto, CARLOS).descuentoPrestamos, 0);
    }));

  it("el neto baja exactamente la cuota y los totales de la cabecera siguen cuadrando", () =>
    conDemo(async (api) => {
      const sin = (await api.get(`/api/roles/${(await generar(api)).json.id}`)).json;
      await api.post("/api/prestamos", prestamo({ cuota: 123.45 }));
      const con = (await api.get(`/api/roles/${(await generar(api)).json.id}`)).json;
      assert.equal(de(con, CARLOS).netoPagar, Number((de(sin, CARLOS).netoPagar - 123.45).toFixed(2)));
      assert.equal(con.totalNeto, Number((sin.totalNeto - 123.45).toFixed(2)));
      assert.equal(con.totalDescuentos, Number((sin.totalDescuentos + 123.45).toFixed(2)));
    }));

  it("un préstamo suspendido no se descuenta", () =>
    conDemo(async (api) => {
      const { id } = (await api.post("/api/prestamos", prestamo())).json;
      await api.patch(`/api/prestamos/${id}/estado`);
      assert.equal(de((await api.get(`/api/roles/${(await generar(api)).json.id}`)).json, CARLOS).descuentoPrestamos, 0);
    }));

  it("el rol ya generado conserva lo descontado aunque luego se cancele el préstamo", () =>
    conDemo(async (api) => {
      const { id } = (await api.post("/api/prestamos", prestamo())).json;
      const rolId = (await generar(api)).json.id;
      await api.del(`/api/prestamos/${id}`);
      assert.equal(de((await api.get(`/api/roles/${rolId}`)).json, CARLOS).descuentoPrestamos, 40);
    }));

  it("el inicio del mes anuncia la cuota que se descontará", () =>
    conDemo(async (api) => {
      await api.post("/api/prestamos", prestamo());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cuota = (mes: number, id: number) => api.get(`/api/roles/periodo/2026/${mes}`).then((r) => r.json.empleados.find((e: any) => e.id === id)?.cuotaPrestamos);
      assert.equal(await cuota(10, CARLOS), 40);
      assert.equal(await cuota(10, MARIA), 0);
      assert.equal(await cuota(12, CARLOS), 0);
    }));

  it("una reliquidación conserva la cuota que se descontó en el rol publicado", () =>
    conDemo(async (api) => {
      const { id } = (await api.post("/api/prestamos", prestamo())).json;
      const rolId = (await generar(api)).json.id;
      for (const paso of ["validar", "aprobar", "publicar"]) await api.post(`/api/roles/${rolId}/${paso}`);
      await api.del(`/api/prestamos/${id}`); // si se buscara otra vez, el ajuste «devolvería» la cuota

      const r = await api.post(`/api/roles/${rolId}/reliquidar`, {
        motivo: "Se olvidaron las comisiones", cambios: [{ cedula: "1702345677", comisiones: 200 }],
      });
      assert.equal(r.status, 201, r.texto);
      const ajuste = (await api.get(`/api/roles/${r.json.id}`)).json;
      assert.equal(ajuste.detalle[0].descuentoPrestamos, 0);
    }));
});
