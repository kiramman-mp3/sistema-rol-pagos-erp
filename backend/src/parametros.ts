/** Parámetros anuales (SBU y tabla del IR) guardados en la base. */
import type { TramoIR } from "./calculos.ts";
import { consultar, ejecutar, uno } from "./db.ts";
import type { Base, Fila } from "./db.ts";
import { ErrorApi } from "./validaciones.ts";

export interface ParametrosAnio {
  anio: number;
  sbu: number;
  tablaIr: TramoIR[];
  fuente: string;
  /** Canasta familiar básica de enero (INEC); 0 = sin definir */
  canastaBasica: number;
}

const aParametros = (fila: Fila): ParametrosAnio => ({
  anio: Number(fila.anio),
  sbu: Number(fila.sbu),
  tablaIr: JSON.parse(String(fila.tabla_ir)) as TramoIR[],
  fuente: String(fila.fuente ?? ""),
  canastaBasica: Number(fila.canasta_basica ?? 0),
});

export async function aniosConParametros(db: Base, cuentaId: number): Promise<number[]> {
  return (await consultar(db, "SELECT anio FROM parametros_anuales WHERE cuenta_id = ? ORDER BY anio DESC", cuentaId))
    .map((f) => Number(f.anio));
}

/**
 * Parámetros de un año. Si ese año no tiene, se usa el más reciente anterior y se
 * avisa (`exacto: false`); si no hay ninguno anterior, se usa el más antiguo.
 */
export async function parametrosDelAnio(
  db: Base, cuentaId: number, anio: number,
): Promise<{ parametros: ParametrosAnio; exacto: boolean }> {
  const fila =
    (await uno(db, "SELECT * FROM parametros_anuales WHERE cuenta_id = ? AND anio = ?", cuentaId, anio)) ??
    (await uno(db, "SELECT * FROM parametros_anuales WHERE cuenta_id = ? AND anio < ? ORDER BY anio DESC LIMIT 1", cuentaId, anio)) ??
    (await uno(db, "SELECT * FROM parametros_anuales WHERE cuenta_id = ? ORDER BY anio LIMIT 1", cuentaId));
  if (!fila) throw new ErrorApi(500, ["No hay parámetros anuales cargados."]);
  const parametros = aParametros(fila);
  return { parametros, exacto: parametros.anio === anio };
}

/** Aviso (no bloquea) cuando se usaron los parámetros de otro año porque el pedido no tiene; null si son los del año. */
export function avisoDeAnioSinParametros(anioPedido: number, usados: ParametrosAnio): string | null {
  return usados.anio === anioPedido ? null : `No hay parámetros de ${anioPedido}; se usaron los de ${usados.anio}.`;
}

/** Valida la forma de la tabla: tramos contiguos, crecientes y el último abierto. */
export function validarTablaIr(tabla: unknown): TramoIR[] {
  const errores: string[] = [];
  if (!Array.isArray(tabla) || tabla.length === 0) {
    throw new ErrorApi(400, ["La tabla del impuesto a la renta debe tener al menos un tramo."]);
  }
  const tramos = tabla as Record<string, unknown>[];
  tramos.forEach((t, i) => {
    const n = i + 1;
    const desde = Number(t.desde);
    const cuota = Number(t.cuota);
    const porcentaje = Number(t.porcentaje);
    const ultimo = i === tramos.length - 1;
    if (!Number.isFinite(desde) || desde < 0) errores.push(`Tramo ${n}: 'desde' debe ser un número mayor o igual a 0.`);
    if (!Number.isFinite(cuota) || cuota < 0) errores.push(`Tramo ${n}: la cuota debe ser mayor o igual a 0.`);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 1) {
      errores.push(`Tramo ${n}: el porcentaje debe estar entre 0 y 1 (0.05 = 5%).`);
    }
    if (i === 0 && desde !== 0) errores.push("El primer tramo debe empezar en 0.");
    if (ultimo) {
      if (t.hasta !== null) errores.push(`Tramo ${n}: el último tramo debe quedar abierto ('hasta' vacío).`);
    } else {
      const hasta = Number(t.hasta);
      if (!Number.isFinite(hasta) || hasta <= desde) errores.push(`Tramo ${n}: 'hasta' debe ser mayor que 'desde'.`);
      if (Number(tramos[i + 1].desde) !== hasta) errores.push(`Tramo ${n}: el siguiente tramo debe empezar donde termina este.`);
    }
  });
  if (errores.length) throw new ErrorApi(400, errores);
  return tramos.map((t) => ({
    desde: Number(t.desde),
    hasta: t.hasta === null ? null : Number(t.hasta),
    cuota: Number(t.cuota),
    porcentaje: Number(t.porcentaje),
  }));
}

export async function guardarParametros(
  db: Base, cuentaId: number, anio: number, sbu: number, tablaIr: TramoIR[], fuente: string, canastaBasica?: number,
) {
  // Sin canasta en el pedido, se conserva la que el año ya tenía (0 si es un año nuevo).
  await ejecutar(
    db,
    `INSERT INTO parametros_anuales (cuenta_id, anio, sbu, tabla_ir, fuente, canasta_basica) VALUES (?, ?, ?, ?, ?, COALESCE(CAST(? AS NUMERIC), 0))
     ON CONFLICT(cuenta_id, anio) DO UPDATE SET sbu = excluded.sbu, tabla_ir = excluded.tabla_ir, fuente = excluded.fuente,
       canasta_basica = COALESCE(CAST(? AS NUMERIC), parametros_anuales.canasta_basica)`,
    cuentaId, anio, sbu, JSON.stringify(tablaIr), fuente, canastaBasica ?? null, canastaBasica ?? null,
  );
}
