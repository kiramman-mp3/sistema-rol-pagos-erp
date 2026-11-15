import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cargarEmpleadosDePrueba, iniciar } from "./ayuda.ts";

// Fija el resultado del cálculo con las reglas de ley que vienen de fábrica. Si algún cambio en cómo
// se eligen o se guardan las reglas altera estos números, el cálculo ya no es el mismo.
const NOVEDADES = [
  { empleadoId: 1, comisiones: 300 },
  { empleadoId: 2, horasSuplementarias: 10, horasExtraordinarias: 4, comisiones: 200, otrosDescuentos: 30 },
  { empleadoId: 3, horasSuplementarias: 8, horasExtraordinarias: 2 },
  { empleadoId: 4, horasNocturnas: 12, horasDescanso: 8 },
  { empleadoId: 5, horasSuplementarias: 6, comisiones: 100 },
  { empleadoId: 6, horasExtraordinarias: 5 },
];

const ESPERADO = [
  { empleadoId: 1, ingresosAportables: 4800, aporteIess: 453.6, tasaIessPersonal: 0.0945, impuestoRenta: 530.04, totalIngresos: 5640.01, totalDescuentos: 983.64, netoPagar: 4656.37, totalProvisiones: 735.2 },
  { empleadoId: 2, ingresosAportables: 2172.5, aporteIess: 205.3, tasaIessPersonal: 0.0945, impuestoRenta: 86.77, totalIngresos: 2574.68, totalDescuentos: 322.07, netoPagar: 2252.61, totalProvisiones: 332.75 },
  { empleadoId: 3, ingresosAportables: 712.13, aporteIess: 81.54, tasaIessPersonal: 0.1145, impuestoRenta: 0, totalIngresos: 870.96, totalDescuentos: 81.54, netoPagar: 789.42, totalProvisiones: 124.5 },
  { empleadoId: 4, ingresosAportables: 971.25, aporteIess: 91.78, tasaIessPersonal: 0.0945, impuestoRenta: 0, totalIngresos: 1092.36, totalDescuentos: 91.78, netoPagar: 1000.58, totalProvisiones: 148.76 },
  { empleadoId: 5, ingresosAportables: 2853.44, aporteIess: 326.72, tasaIessPersonal: 0.1145, impuestoRenta: 162.93, totalIngresos: 3369.09, totalDescuentos: 489.65, netoPagar: 2879.44, totalProvisiones: 498.88 },
  { empleadoId: 6, ingresosAportables: 261.08, aporteIess: 24.67, tasaIessPersonal: 0.0945, impuestoRenta: 0, totalIngresos: 302.92, totalDescuentos: 24.67, netoPagar: 278.25, totalProvisiones: 39.99 },
];

describe("regresión del cálculo con las reglas de fábrica", () => {
  it("octubre de 2026 da siempre los mismos valores (Código del Trabajo, LOSEP y LOEP)", async () => {
    const api = await iniciar();
    try {
      await cargarEmpleadosDePrueba(api);
      const { id } = (await api.post("/api/roles/generar", { anio: 2026, mes: 10, novedades: NOVEDADES })).json;
      const rol = (await api.get(`/api/roles/${id}`)).json;
      const obtenido = rol.detalle
        .map((d: Record<string, unknown>) => ({
          empleadoId: d.empleadoId, ingresosAportables: d.ingresosAportables, aporteIess: d.aporteIess,
          tasaIessPersonal: d.tasaIessPersonal, impuestoRenta: d.impuestoRenta, totalIngresos: d.totalIngresos,
          totalDescuentos: d.totalDescuentos, netoPagar: d.netoPagar, totalProvisiones: d.totalProvisiones,
        }))
        .sort((a: { empleadoId: number }, b: { empleadoId: number }) => a.empleadoId - b.empleadoId);
      assert.deepEqual(obtenido, ESPERADO);
    } finally {
      api.cerrar();
    }
  });
});
