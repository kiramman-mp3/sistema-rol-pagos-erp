/** Registro de auditoría: quién hizo qué y cuándo. Solo se inserta; la base impide modificarlo (migración 014). */
import { consultar, ejecutar } from "./db.ts";
import type { Base } from "./db.ts";

export interface EventoAuditoria {
  cuentaId: number;
  /** `null` = lo hizo el sistema (por ejemplo, el seed de ejemplo). */
  usuarioId: number | null;
  accion: string;
  entidad: string;
  entidadId: number;
  detalle?: unknown;
}

/** Pásale la transacción del cambio que se audita: si este falla, el cambio no queda sin registro. */
export async function registrarAuditoria(db: Base, e: EventoAuditoria): Promise<void> {
  await ejecutar(
    db,
    `INSERT INTO audit_logs (cuenta_id, usuario_id, usuario_email, accion, entidad, entidad_id, detalle)
     VALUES (?, ?, (SELECT email FROM usuarios WHERE id = ?), ?, ?, ?, ?)`,
    e.cuentaId, e.usuarioId, e.usuarioId, e.accion, e.entidad, e.entidadId,
    e.detalle === undefined ? null : JSON.stringify(e.detalle),
  );
}

export async function listarAuditoria(db: Base, cuentaId: number, entidad: string, entidadId: number) {
  const filas = await consultar(
    db,
    `SELECT accion, usuario_email, detalle, creado_en FROM audit_logs
     WHERE cuenta_id = ? AND entidad = ? AND entidad_id = ? ORDER BY id`,
    cuentaId, entidad, entidadId,
  );
  return filas.map((f) => ({
    accion: f.accion,
    usuario: f.usuario_email ?? "sistema",
    detalle: f.detalle === null ? null : JSON.parse(String(f.detalle)),
    creadoEn: f.creado_en,
  }));
}
