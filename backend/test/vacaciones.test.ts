import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diasDeServicio, diasDevengados, diasEntre, saldoDeVacaciones } from "../src/vacaciones.ts";
import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

// Empleados de ejemplo: 1 María (CT), 2 Carlos (CT, ingreso 2022-07-15), 3 Lucía (LOSEP, 30 días al año),
// 4 José, 5 Daniela (LOEP servidor), 6 Pedro (LOEP obrero, ingresa el 2026-10-16).
const CARLOS = 2;
const LUCIA = 3;
const PEDRO = 6;

async function conDemo(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

const periodo = (extra: object = {}) => ({ empleadoId: CARLOS, desde: "2026-03-02", hasta: "2026-03-16", ...extra });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const saldoDe = async (api: Cliente, id: number) => (await api.get("/api/vacaciones/saldos")).json.find((s: any) => s.empleadoId === id);

describe("días de vacaciones", () => {
  it("cuenta los días calendario de un periodo con el primero y el último incluidos", () => {
    assert.equal(diasEntre("2026-03-02", "2026-03-06"), 5);
    assert.equal(diasEntre("2026-03-02", "2026-03-02"), 1);
    assert.equal(diasEntre("2026-02-27", "2026-03-02"), 4);
    assert.equal(diasEntre("2027-12-30", "2028-01-02"), 4);
  });

  it("cuenta los días de servicio con meses de 30 días y el día de ingreso incluido", () => {
    assert.equal(diasDeServicio("2026-01-01", "2026-01-30"), 30);
    assert.equal(diasDeServicio("2026-01-01", "2026-06-30"), 180);
    assert.equal(diasDeServicio("2026-01-01", "2026-12-30"), 360);
    assert.equal(diasDeServicio("2026-01-01", "2026-12-31"), 360); // el 31 cuenta como 30
    assert.equal(diasDeServicio("2026-10-16", "2026-10-30"), 15);
    assert.equal(diasDeServicio("2026-10-16", "2026-10-15"), 0);
  });

  it("devenga los días del régimen en proporción al servicio", () => {
    assert.equal(diasDevengados("2026-01-01", "2026-12-30", 15), 15);
    assert.equal(diasDevengados("2026-01-01", "2026-06-30", 15), 7.5);
    assert.equal(diasDevengados("2026-01-01", "2026-06-30", 30), 15);
    assert.equal(diasDevengados("2026-01-01", "2027-12-30", 15), 30);
    assert.equal(diasDevengados("2026-01-01", "2026-07-01", 15), 7.54);
  });

  it("el saldo es lo devengado menos lo gozado y puede quedar en negativo", () => {
    assert.deepEqual(saldoDeVacaciones("2026-01-01", "2026-06-30", 15, 5), { diasPorAnio: 15, devengados: 7.5, gozados: 5, saldo: 2.5 });
    assert.equal(saldoDeVacaciones("2026-01-01", "2026-06-30", 15, 10).saldo, -2.5);
  });
});

describe("API de vacaciones gozadas", () => {
  it("registra un periodo con sus días calendario", () =>
    conDemo(async (api) => {
      const r = await api.post("/api/vacaciones", periodo({ observacion: " Viaje " }));
      assert.equal(r.status, 201, r.texto);
      assert.equal(r.json.dias, 15);
      assert.equal(r.json.nombres, "Carlos Andrés Villacís");
      assert.equal(r.json.observacion, "Viaje");
      assert.deepEqual(r.json.avisos, []);
    }));

  it("rechaza datos inválidos con todos los errores juntos", () =>
    conDemo(async (api) => {
      const r = await api.post("/api/vacaciones", { empleadoId: 999, desde: "ayer", hasta: "2026-13-01" });
      assert.equal(r.status, 400);
      assert.equal(r.json.errores.length, 3);
      assert.equal((await api.post("/api/vacaciones", periodo({ hasta: "2026-03-01" }))).status, 400);
      assert.equal((await api.post("/api/vacaciones", periodo({ hasta: "2027-06-01" }))).status, 400); // más de 366 días
      assert.equal((await api.get("/api/vacaciones")).json.length, 0);
    }));

  it("no deja empezar antes del ingreso ni terminar después de la salida", () =>
    conDemo(async (api) => {
      const antes = await api.post("/api/vacaciones", periodo({ desde: "2022-07-01", hasta: "2022-07-10" }));
      assert.equal(antes.status, 400);
      assert.deepEqual(antes.json.errores, ["Las vacaciones no pueden empezar antes del ingreso del empleado."]);

      await api.patch(`/api/empleados/${CARLOS}/estado`, { fechaSalida: "2026-09-30" });
      const despues = await api.post("/api/vacaciones", periodo({ desde: "2026-09-25", hasta: "2026-10-05" }));
      assert.equal(despues.status, 400);
      assert.deepEqual(despues.json.errores, ["Las vacaciones no pueden terminar después de la salida del empleado."]);
    }));

  it("no acepta periodos que se cruzan, pero sí los que no se cruzan", () =>
    conDemo(async (api) => {
      await api.post("/api/vacaciones", periodo());
      const cruce = await api.post("/api/vacaciones", periodo({ desde: "2026-03-16", hasta: "2026-03-20" }));
      assert.equal(cruce.status, 409);
      assert.match(cruce.json.errores[0], /del 2026-03-02 al 2026-03-16/);
      assert.equal((await api.post("/api/vacaciones", periodo({ desde: "2026-03-17", hasta: "2026-03-20" }))).status, 201);
      assert.equal((await api.post("/api/vacaciones", periodo({ empleadoId: 1 }))).status, 201); // otra persona, mismas fechas
    }));

  it("no acepta un empleado de otra empresa", () =>
    conDemo(async (api) => {
      await api.registrar({ ruc: "1790011674001", email: "otra@empresa.com", empresa: "Otra S.A." });
      const r = await api.post("/api/vacaciones", periodo());
      assert.equal(r.status, 400);
      assert.deepEqual(r.json.errores, ["El empleado no existe."]);
    }));

  it("avisa, sin bloquear, cuando toma más días de los que lleva devengados", () =>
    conDemo(async (api) => {
      // Pedro ingresó el 2026-10-16: al 2026-10-30 lleva 15 días de servicio, o sea 0,63 de vacaciones.
      const r = await api.post("/api/vacaciones", { empleadoId: PEDRO, desde: "2026-10-20", hasta: "2026-10-30" });
      assert.equal(r.status, 201);
      assert.equal(r.json.avisos.length, 1);
      assert.match(r.json.avisos[0], /ha tomado 11 días y a esa fecha lleva devengados 0\.63: queda debiendo 10\.37\./);
    }));

  it("lista, filtra por empleado y elimina", () =>
    conDemo(async (api) => {
      const a = (await api.post("/api/vacaciones", periodo())).json;
      await api.post("/api/vacaciones", periodo({ empleadoId: 1 }));
      assert.equal((await api.get("/api/vacaciones")).json.length, 2);
      assert.deepEqual((await api.get(`/api/vacaciones?empleadoId=${CARLOS}`)).json.map((v: { id: number }) => v.id), [a.id]);
      assert.equal((await api.del(`/api/vacaciones/${a.id}`)).status, 204);
      assert.equal((await api.del(`/api/vacaciones/${a.id}`)).status, 404);
      assert.equal((await api.get("/api/vacaciones?empleadoId=abc")).status, 400);
    }));

  it("el saldo de cada persona descuenta lo gozado y usa los días de su régimen", () =>
    conDemo(async (api) => {
      const antes = await saldoDe(api, CARLOS);
      assert.equal(antes.diasPorAnio, 15);
      assert.equal(antes.gozados, 0);
      assert.ok(antes.devengados > 15); // lleva años en la empresa
      assert.equal(antes.saldo, antes.devengados);
      assert.equal((await saldoDe(api, LUCIA)).diasPorAnio, 30); // LOSEP

      await api.post("/api/vacaciones", periodo());
      const despues = await saldoDe(api, CARLOS);
      assert.equal(despues.gozados, 15);
      assert.equal(despues.saldo, Number((despues.devengados - 15).toFixed(2)));
    }));

  it("el saldo solo lista a quienes siguen en la empresa", () =>
    conDemo(async (api) => {
      await api.patch(`/api/empleados/${CARLOS}/estado`, { fechaSalida: "2024-07-14" });
      assert.equal(await saldoDe(api, CARLOS), undefined);
      await api.patch(`/api/empleados/${CARLOS}/estado`); // vuelve
      assert.ok(await saldoDe(api, CARLOS));
    }));

  it("se va con el empleado y sale en la exportación de la cuenta", () =>
    conDemo(async (api) => {
      await api.post("/api/vacaciones", periodo());
      assert.equal((await api.get("/api/cuenta/exportar")).json.vacaciones_gozadas.length, 1);
      await api.del(`/api/empleados/${CARLOS}`);
      assert.equal((await api.get("/api/vacaciones")).json.length, 0);
    }));
});
