-- Vacaciones gozadas: los periodos que cada empleado tomó, para calcular cuántos días le quedan.
--   vacaciones_gozadas   un periodo por fila (desde y hasta como AAAA-MM-DD, ambos días incluidos).
--                        `dias` son los días calendario del periodo y se guardan para que el historial no
--                        cambie. Se borra con su empleado y con su cuenta.
-- No toca los roles: las vacaciones gozadas se pagan dentro del sueldo, y la provisión del rol no cambia.

CREATE TABLE vacaciones_gozadas (
    id           SERIAL PRIMARY KEY,
    cuenta_id    INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    empleado_id  INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
    desde        TEXT    NOT NULL,
    hasta        TEXT    NOT NULL,
    dias         INTEGER NOT NULL CHECK (dias BETWEEN 1 AND 366),
    observacion  TEXT    NOT NULL DEFAULT '',
    creado_en    TEXT    NOT NULL,
    CHECK (hasta >= desde)
);
CREATE INDEX vacaciones_gozadas_cuenta ON vacaciones_gozadas (cuenta_id);
CREATE INDEX vacaciones_gozadas_empleado ON vacaciones_gozadas (empleado_id, desde);
