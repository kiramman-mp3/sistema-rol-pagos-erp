-- Préstamos del IESS (quirografarios, hipotecarios y prendarios) que el empleador descuenta en el rol.
--   prestamos_iess                  un préstamo por fila: cuántas cuotas son, de cuánto cada una y desde qué mes
--                                   se descuentan. Se borra con su empleado y con su cuenta.
--   roles_detalle.descuento_prestamos  lo que se descontó por préstamos en ese rol, para que el historial no
--                                   cambie si luego se edita o se cancela el préstamo.
-- Todo lo que ya existía queda en 0: ningún rol anterior cambia de resultado.

CREATE TABLE prestamos_iess (
    id              SERIAL PRIMARY KEY,
    cuenta_id       INTEGER       NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    empleado_id     INTEGER       NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
    tipo            TEXT          NOT NULL CHECK (tipo IN ('quirografario', 'hipotecario', 'prendario')),
    cuota           NUMERIC(14,2) NOT NULL CHECK (cuota > 0),
    cuotas          INTEGER       NOT NULL CHECK (cuotas BETWEEN 1 AND 360),
    primer_anio     INTEGER       NOT NULL CHECK (primer_anio BETWEEN 2020 AND 2100),
    primer_mes      INTEGER       NOT NULL CHECK (primer_mes BETWEEN 1 AND 12),
    -- 0 = cancelado o suspendido: no se descuenta, pero queda en el historial.
    activo          INTEGER       NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    observacion     TEXT          NOT NULL DEFAULT '',
    creado_en       TEXT          NOT NULL
);
CREATE INDEX prestamos_iess_cuenta ON prestamos_iess (cuenta_id);
CREATE INDEX prestamos_iess_empleado ON prestamos_iess (empleado_id);

ALTER TABLE roles_detalle ADD COLUMN descuento_prestamos NUMERIC(14,2) NOT NULL DEFAULT 0;
