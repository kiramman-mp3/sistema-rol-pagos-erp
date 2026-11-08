import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calcularRol, calcularRolConTraza, REGLAS_CT_2026 } from "../src/calculos.ts";
import type { EntradaRol, OpcionesRol, ReglasRol, ResultadoRol, TrazaCalculo } from "../src/calculos.ts";

const LOSEP: ReglasRol = {
  ...REGLAS_CT_2026, iessPersonal: "0.1145", iessPatronal: "0.0915", diasVacaciones: 30, recargoSuplementarias: "0.25",
  recargoExtraordinarias: "0.6", topeSuplementariasMes: 60, topeExtraordinariasMes: 60,
};
const MENSUAL: OpcionesRol = { decimoTercero: "mensual", decimoCuarto: "mensual", fondosReserva: "mensual", recibeHorasExtras: true };
const MIXTO: OpcionesRol = { decimoTercero: "acumulado", decimoCuarto: "no", fondosReserva: "mensual", recibeHorasExtras: false };

const BASE: EntradaRol = { sueldoBase: 1800, fechaIngreso: "2022-07-15", anio: 2026, mes: 10 };

const CASOS: [string, EntradaRol, ReglasRol, OpcionesRol][] = [
  ["mes completo, todo mensual", BASE, REGLAS_CT_2026, MENSUAL],
  ["con horas y comisiones", { ...BASE, horasSuplementarias: 10, horasExtraordinarias: 4, horasDescanso: 6, horasNocturnas: 12, comisiones: 200, otrosDescuentos: 30 }, REGLAS_CT_2026, MENSUAL],
  ["LOSEP, tope superado", { ...BASE, sueldoBase: 675, horasSuplementarias: 80 }, LOSEP, MENSUAL],
  ["ingreso a mitad de mes, sin fondos todavía", { ...BASE, fechaIngreso: "2026-10-16", sueldoBase: 482 }, REGLAS_CT_2026, MENSUAL],
  ["salida a mitad de mes", { ...BASE, fechaSalida: "2026-10-20" }, REGLAS_CT_2026, MENSUAL],
  ["sin beneficios y sin horas extras", { ...BASE, horasSuplementarias: 10 }, REGLAS_CT_2026, MIXTO],
  ["sueldo alto: varios tramos del impuesto", { ...BASE, sueldoBase: 12000, comisiones: 3000 }, REGLAS_CT_2026, MENSUAL],
];

const paso = (resultado: TrazaCalculo, clave: string) => resultado.pasos.find((p) => p.clave === clave);

describe("traza del cálculo", () => {
  for (const [nombre, entrada, reglas, opciones] of CASOS) {
    describe(nombre, () => {
      const { resultado, traza } = calcularRolConTraza(entrada, reglas, opciones);

      it("el resultado es el mismo que el de calcularRol", () => {
        assert.deepEqual(resultado, calcularRol(entrada, reglas, opciones));
      });

      it("cada paso da el mismo valor que el campo que explica y no se repite", () => {
        const vistos = new Set<string>();
        for (const p of traza.pasos) {
          assert.equal(p.resultado, resultado[p.clave as keyof ResultadoRol], p.clave);
          assert.ok(!vistos.has(p.clave), `paso repetido: ${p.clave}`);
          vistos.add(p.clave);
          assert.ok(p.concepto && p.formula && p.detalle, `paso incompleto: ${p.clave}`);
        }
      });

      it("las sumas de la traza cuadran con sus partes", () => {
        const v = (clave: keyof ResultadoRol) => Number(paso(traza, clave)?.resultado ?? 0);
        const redondeo = (n: number) => Math.round(n * 100) / 100;
        assert.equal(
          redondeo(v("sueldo") + v("valorHorasSuplementarias") + v("valorHorasExtraordinarias") + v("valorHorasDescanso") + v("valorRecargoNocturno") + v("comisiones")),
          v("ingresosAportables"),
        );
        assert.equal(redondeo(v("ingresosAportables") + v("beneficiosMensuales")), v("totalIngresos"));
        assert.equal(redondeo(v("aporteIess") + v("impuestoRenta") + v("otrosDescuentos")), v("totalDescuentos"));
        assert.equal(redondeo(v("totalIngresos") - v("totalDescuentos")), v("netoPagar"));
        assert.equal(redondeo(v("totalIngresos") + v("totalProvisiones")), v("costoEmpleador"));
      });
    });
  }

  it("escribe la fórmula con los números del empleado", () => {
    const { traza } = calcularRolConTraza(BASE, REGLAS_CT_2026, MENSUAL);
    assert.equal(paso(traza, "aporteIess")!.detalle, "1800.00 × 9.45 % = 170.10");
    assert.equal(paso(traza, "valorHora")!.detalle, "1800.00 ÷ 240 = 7.50");
    assert.equal(paso(traza, "sueldo")!.detalle, "1800.00 × 30 ÷ 30 = 1800.00");
    assert.equal(paso(traza, "diasTrabajados")!.detalle, "mes completo: 30 días");
  });

  it("solo cuenta las horas y rubros que existen en el mes", () => {
    const sin = calcularRolConTraza(BASE, REGLAS_CT_2026, MENSUAL).traza;
    for (const clave of ["valorHorasSuplementarias", "valorHorasExtraordinarias", "valorHorasDescanso", "valorRecargoNocturno", "comisiones", "otrosDescuentos"]) {
      assert.equal(paso(sin, clave), undefined, clave);
    }
    const con = calcularRolConTraza({ ...BASE, horasSuplementarias: 10, comisiones: 50 }, REGLAS_CT_2026, MENSUAL).traza;
    assert.equal(paso(con, "valorHorasSuplementarias")!.detalle, "10 × 1800.00 × 1.5 ÷ 240 = 112.50");
    assert.equal(paso(con, "comisiones")!.resultado, 50);
  });

  it("explica por qué un beneficio no se paga", () => {
    const { traza } = calcularRolConTraza({ ...BASE, fechaIngreso: "2026-10-16", sueldoBase: 482 }, REGLAS_CT_2026, MENSUAL);
    assert.match(paso(traza, "fondosReserva")!.detalle, /aún menos de 12/);
    assert.match(paso(traza, "diasTrabajados")!.detalle, /15 de 30 días/);

    const sin = calcularRolConTraza(BASE, REGLAS_CT_2026, MIXTO).traza;
    assert.match(paso(sin, "decimoCuarto")!.detalle, /no lo recibe/);
    assert.match(paso(sin, "decimoTercero")!.formula, /se provisiona/);
    assert.match(paso(sin, "fondosReserva")!.formula, /se paga en el rol/);
  });

  it("muestra el tramo del impuesto que se aplicó", () => {
    const { traza } = calcularRolConTraza({ ...BASE, sueldoBase: 12000, comisiones: 3000 }, REGLAS_CT_2026, MENSUAL);
    const ir = paso(traza, "irAnual")!;
    assert.match(ir.detalle, /^\d+\.\d{2} \+ \(\d+\.\d{2} − \d+\.\d{2}\) × [\d.]+ % = \d+\.\d{2}$/);
    assert.ok(ir.resultado > 0);
    assert.match(paso(calcularRolConTraza({ ...BASE, sueldoBase: 482 }, REGLAS_CT_2026, MENSUAL).traza, "irAnual")!.detalle, /no supera|0\.00 \+ /);
  });

  it("cita la fuente donde el código la tiene", () => {
    const { traza } = calcularRolConTraza(BASE, REGLAS_CT_2026, MENSUAL);
    assert.match(paso(traza, "vacaciones")!.fuente!, /art\. 71/);
    assert.equal(paso(traza, "valorHora")!.fuente, undefined);
  });
});
