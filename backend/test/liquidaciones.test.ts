import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calcularLiquidacion, inicioDecimoCuarto, inicioDecimoTercero } from "../src/liquidacion.ts";
import type { EntradaLiquidacion } from "../src/liquidacion.ts";
import { ejecutar } from "../src/db.ts";
import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";
import type { Cliente } from "./ayuda.ts";

// Empleados de ejemplo: 1 María (CT), 2 Carlos (CT, $1800, ingreso 2022-07-15), 3 Lucía (LOSEP)...
const CARLOS = 2;
const LUCIA = 3;

const base: EntradaLiquidacion = {
  sueldoBase: 1000, fechaIngreso: "2024-01-10", fechaSalida: "2026-10-20", causa: "despido_intempestivo", region: "sierra",
  sbu: 482, decimoCuarto: "acumulado", decimoTerceroProvisionado: 750, saldoVacaciones: 20,
};
const valores = (e: Partial<EntradaLiquidacion>) => Object.fromEntries(calcularLiquidacion({ ...base, ...e }).rubros.map((r) => [r.clave, r.valor]));

describe("periodos de los décimos", () => {
  it("el décimo tercero cuenta desde el 1 de diciembre anterior", () => {
    assert.equal(inicioDecimoTercero("2026-10-20"), "2025-12-01");
    assert.equal(inicioDecimoTercero("2026-12-15"), "2026-12-01");
    assert.equal(inicioDecimoTercero("2026-01-05"), "2025-12-01");
  });

  it("el décimo cuarto empieza en agosto en la Sierra y en marzo en la Costa", () => {
    assert.equal(inicioDecimoCuarto("2026-07-31", "sierra"), "2025-08-01");
    assert.equal(inicioDecimoCuarto("2026-08-01", "sierra"), "2026-08-01");
    assert.equal(inicioDecimoCuarto("2026-02-28", "costa"), "2025-03-01");
    assert.equal(inicioDecimoCuarto("2026-03-01", "costa"), "2026-03-01");
  });
});

describe("cálculo de la liquidación", () => {
  it("suma cada rubro de un despido intempestivo", () => {
    const r = calcularLiquidacion(base);
    assert.equal(r.diasServicio, 1001);
    assert.equal(r.anios, 2.7806);
    assert.deepEqual(valores({}), {
      decimoTercero: 750, decimoCuarto: 107.11, vacaciones: 666.67, bonificacionDesahucio: 695.14, indemnizacion: 3000,
    });
    assert.equal(r.total, 5218.92);
    assert.equal(r.rubros.every((x) => x.formula && x.detalle), true);
  });

  it("la renuncia solo paga lo acumulado y las vacaciones", () => {
    const r = calcularLiquidacion({ ...base, causa: "renuncia" });
    assert.deepEqual(r.rubros.map((x) => x.clave), ["decimoTercero", "decimoCuarto", "vacaciones"]);
    assert.equal(r.total, 1523.78);
  });

  it("el desahucio y el acuerdo pagan la bonificación, pero no la indemnización", () => {
    for (const causa of ["desahucio", "acuerdo"] as const) {
      const v = valores({ causa });
      assert.equal(v.bonificacionDesahucio, 695.14);
      assert.equal(v.indemnizacion, undefined);
    }
  });

  it("el visto bueno del trabajador paga como un despido; el del empleador y el fin del contrato, no", () => {
    assert.equal(valores({ causa: "visto_bueno_trabajador" }).indemnizacion, 3000);
    for (const causa of ["visto_bueno_empleador", "fin_contrato"] as const) {
      const v = valores({ causa });
      assert.equal(v.bonificacionDesahucio, undefined);
      assert.equal(v.indemnizacion, undefined);
    }
  });

  it("el décimo cuarto de la Costa cuenta desde marzo", () => {
    assert.equal(valores({ region: "costa" }).decimoCuarto, 307.94); // 482 × 230 ÷ 360
  });

  it("el décimo cuarto empieza en el ingreso si fue dentro del periodo", () => {
    assert.equal(valores({ fechaIngreso: "2026-09-16" }).decimoCuarto, 46.86); // 482 × 35 ÷ 360
  });

  it("el décimo cuarto que se paga cada mes o que no se recibe no entra", () => {
    assert.equal(valores({ decimoCuarto: "mensual" }).decimoCuarto, 0);
    assert.equal(valores({ decimoCuarto: "no" }).decimoCuarto, 0);
  });

  it("las vacaciones pagan el saldo a un treintavo del sueldo y nunca cobran a quien debe días", () => {
    assert.equal(valores({ saldoVacaciones: 10.5 }).vacaciones, 350);
    assert.equal(valores({ saldoVacaciones: -4 }).vacaciones, 0);
  });

  it("la indemnización es de 3 sueldos hasta 3 años, y de uno por año (la fracción cuenta) desde ahí", () => {
    const sueldos = (fechaIngreso: string, fechaSalida: string) =>
      valores({ fechaIngreso, fechaSalida, causa: "despido_intempestivo" }).indemnizacion / 1000;
    assert.equal(sueldos("2026-09-01", "2026-10-20"), 3); // menos de un año
    assert.equal(sueldos("2023-01-01", "2025-12-30"), 3); // 1080 días: exactamente 3 años
    assert.equal(sueldos("2023-01-01", "2026-01-01"), 4); // 1081 días: 3 años y un día cuenta como 4
    assert.equal(sueldos("2018-03-01", "2026-10-30"), 9); // 8,67 años
    assert.equal(sueldos("1990-01-01", "2026-10-30"), 25); // el tope
  });
});

async function conDemo(prueba: (api: Cliente) => Promise<void>) {
  const api = await iniciar();
  try {
    await cargarEmpleadosDePrueba(api);
    await prueba(api);
  } finally {
    await api.cerrar();
  }
}

const pedido = (extra: object = {}) => ({ empleadoId: CARLOS, fechaSalida: "2026-10-20", causa: "renuncia", region: "sierra", ...extra });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rubro = (r: any, clave: string) => r.rubros.find((x: { clave: string }) => x.clave === clave)?.valor;
/** Carlos cobra sus décimos acumulados: así los roles dejan algo provisionado. */
const acumular = (api: Cliente) =>
  ejecutar(api.db, "UPDATE empleados SET pago_decimo_tercero = 'acumulado', pago_decimo_cuarto = 'acumulado' WHERE id = ?", CARLOS);

describe("API de liquidaciones", () => {
  it("calcula sin guardar nada y avisa de los roles que faltan", () =>
    conDemo(async (api) => {
      const r = await api.post("/api/liquidaciones/calcular", pedido());
      assert.equal(r.status, 200, r.texto);
      assert.equal(r.json.nombres, "Carlos Andrés Villacís");
      assert.equal(r.json.regimenAplicado, "CODIGO_TRABAJO");
      assert.equal(r.json.causaEtiqueta, "Renuncia voluntaria");
      // Carlos cobra los décimos cada mes: no queda nada provisionado. Vacaciones: 64 días × 1800 ÷ 30.
      assert.equal(rubro(r.json, "decimoTercero"), 0);
      assert.equal(rubro(r.json, "decimoCuarto"), 0);
      assert.equal(rubro(r.json, "vacaciones"), 3840);
      assert.equal(r.json.total, 3840);
      assert.equal(r.json.avisos.filter((a: string) => a.startsWith("Falta el rol de")).length, 11); // de 2025-12 a 2026-10
      assert.equal((await api.get("/api/liquidaciones")).json.length, 0);
      assert.equal((await api.get(`/api/empleados/${CARLOS}`)).json.activo, true);
    }));

  it("paga lo provisionado en los roles desde diciembre y el décimo cuarto acumulado", () =>
    conDemo(async (api) => {
      await acumular(api);
      await api.post("/api/roles/generar", { anio: 2026, mes: 9 });
      await api.post("/api/roles/generar", { anio: 2026, mes: 10 });
      const r = (await api.post("/api/liquidaciones/calcular", pedido())).json;
      assert.equal(rubro(r, "decimoTercero"), 300); // 2 meses × 1800 ÷ 12
      assert.equal(rubro(r, "decimoCuarto"), 107.11); // 482 × 80 ÷ 360
      assert.equal(r.total, 4247.11);
      assert.equal(r.avisos.filter((a: string) => a.startsWith("Falta el rol de")).length, 9);
    }));

  it("las vacaciones gozadas bajan el saldo que se paga", () =>
    conDemo(async (api) => {
      await api.post("/api/vacaciones", { empleadoId: CARLOS, desde: "2026-03-02", hasta: "2026-03-11" });
      const r = (await api.post("/api/liquidaciones/calcular", pedido())).json;
      assert.equal(rubro(r, "vacaciones"), 3240); // (64 − 10) días × 60
    }));

  it("quien tomó más vacaciones de las devengadas no paga la diferencia", () =>
    conDemo(async (api) => {
      await api.post("/api/vacaciones", { empleadoId: CARLOS, desde: "2025-01-01", hasta: "2025-03-31" }); // 90 días
      const r = (await api.post("/api/liquidaciones/calcular", pedido())).json;
      assert.equal(rubro(r, "vacaciones"), 0);
      assert.ok(r.avisos.some((a: string) => a.includes("tomó 26 días de vacaciones de más")));
    }));

  it("informa las cuotas de préstamos del IESS que quedaban, sin descontarlas", () =>
    conDemo(async (api) => {
      await api.post("/api/prestamos", { empleadoId: CARLOS, tipo: "quirografario", cuota: 40, cuotas: 6, primerAnio: 2026, primerMes: 9 });
      const r = (await api.post("/api/liquidaciones/calcular", pedido())).json;
      assert.deepEqual(r.prestamosPendientes, { cuotas: 4, valor: 160 }); // septiembre y octubre ya están
      assert.ok(r.avisos.some((a: string) => a.includes("Quedan 4 cuotas")));
      assert.equal(r.total, 3840);
    }));

  it("registra la liquidación, da de salida al empleado y deja constancia", () =>
    conDemo(async (api) => {
      const r = await api.post("/api/liquidaciones", pedido({ causa: "despido_intempestivo" }));
      assert.equal(r.status, 201, r.texto);
      assert.equal(r.json.causaEtiqueta, "Despido intempestivo");
      assert.equal(r.json.aniosServicio, 4.2667); // 1536 días ÷ 360
      assert.equal(rubro(r.json, "indemnizacion"), 9000); // más de 3 años: 5 años (4,27, la fracción cuenta) × 1800
      assert.equal(rubro(r.json, "bonificacionDesahucio"), 1920); // 25 % × 1800 × 4,2667
      assert.equal(r.json.total, 3840 + 9000 + 1920);

      const e = (await api.get(`/api/empleados/${CARLOS}`)).json;
      assert.equal(e.activo, false);
      assert.equal(e.fechaSalida, "2026-10-20");
      assert.equal((await api.get("/api/liquidaciones")).json.length, 1);
      assert.equal((await api.get(`/api/liquidaciones/${r.json.id}`)).json.rubros.length, 5);
      assert.equal((await api.get("/api/cuenta/exportar")).json.liquidaciones.length, 1);
    }));

  it("no registra dos veces la misma persona; eliminarla permite rehacerla", () =>
    conDemo(async (api) => {
      const { id } = (await api.post("/api/liquidaciones", pedido())).json;
      const otra = await api.post("/api/liquidaciones", pedido());
      assert.equal(otra.status, 409);
      assert.equal((await api.post("/api/liquidaciones/calcular", pedido())).status, 409);
      assert.equal((await api.del(`/api/liquidaciones/${id}`)).status, 204);
      assert.equal((await api.del(`/api/liquidaciones/${id}`)).status, 404);
      assert.equal((await api.post("/api/liquidaciones", pedido())).status, 201);
    }));

  it("rechaza datos inválidos con todos los errores juntos", () =>
    conDemo(async (api) => {
      const r = await api.post("/api/liquidaciones", { empleadoId: 999, causa: "me aburrí", region: "luna", fechaSalida: "ayer" });
      assert.equal(r.status, 400);
      assert.equal(r.json.errores.length, 4);
      const antes = await api.post("/api/liquidaciones", pedido({ fechaSalida: "2022-07-14" }));
      assert.deepEqual(antes.json.errores, ["La fecha de salida no puede ser anterior a la de ingreso."]);
      assert.equal((await api.get("/api/liquidaciones")).json.length, 0);
    }));

  it("si el empleado ya tiene una salida registrada, la liquidación usa esa fecha", () =>
    conDemo(async (api) => {
      await api.patch(`/api/empleados/${CARLOS}/estado`, { fechaSalida: "2026-09-30" });
      const otra = await api.post("/api/liquidaciones", pedido());
      assert.equal(otra.status, 400);
      assert.match(otra.json.errores[0], /ya tiene registrada su salida el 2026-09-30/);
      assert.equal((await api.post("/api/liquidaciones", pedido({ fechaSalida: "2026-09-30" }))).status, 201);
    }));

  it("las indemnizaciones solo se programan para el Código del Trabajo", () =>
    conDemo(async (api) => {
      const despido = await api.post("/api/liquidaciones", pedido({ empleadoId: LUCIA, causa: "despido_intempestivo" }));
      assert.equal(despido.status, 400);
      assert.match(despido.json.errores[0], /solo están programadas para el Código del Trabajo/);
      const renuncia = await api.post("/api/liquidaciones", pedido({ empleadoId: LUCIA, fechaSalida: "2026-10-20" }));
      assert.equal(renuncia.status, 201, renuncia.texto);
      assert.equal(renuncia.json.regimenAplicado, "LOSEP");
    }));

  it("no acepta un empleado de otra empresa", () =>
    conDemo(async (api) => {
      await api.registrar({ ruc: "1790011674001", email: "otra@empresa.com", empresa: "Otra S.A." });
      const r = await api.post("/api/liquidaciones", pedido());
      assert.equal(r.status, 400);
      assert.deepEqual(r.json.errores, ["El empleado no existe."]);
    }));

  it("al eliminar al empleado se conserva la liquidación", () =>
    conDemo(async (api) => {
      await api.post("/api/liquidaciones", pedido());
      await api.del(`/api/empleados/${CARLOS}`);
      const lista = (await api.get("/api/liquidaciones")).json;
      assert.equal(lista.length, 1);
      assert.equal(lista[0].empleadoId, null);
      assert.equal(lista[0].nombres, "Carlos Andrés Villacís");
    }));
});
