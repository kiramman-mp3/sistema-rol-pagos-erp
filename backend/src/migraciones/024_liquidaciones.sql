-- Liquidaciones por salida: lo que se le paga a un empleado que se va, además de su último rol.
--   liquidaciones   una por empleado. Guarda una foto de quién era y cómo se calculó (`rubros`, en JSON) para que
--                   el historial no cambie si luego se edita el empleado. `empleado_id` queda en NULL si el
--                   empleado se elimina; la liquidación se borra con su cuenta.
-- Registrar una liquidación marca al empleado como salido en esa fecha (`empleados.fecha_salida`).

CREATE TABLE liquidaciones (
    id                  SERIAL PRIMARY KEY,
    cuenta_id           INTEGER       NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
    empleado_id         INTEGER       UNIQUE REFERENCES empleados(id) ON DELETE SET NULL,
    cedula              TEXT          NOT NULL,
    nombres             TEXT          NOT NULL,
    cargo               TEXT          NOT NULL,
    regimen_aplicado    TEXT          NOT NULL,
    sueldo_base         NUMERIC(14,2) NOT NULL,
    fecha_ingreso       TEXT          NOT NULL,
    fecha_salida        TEXT          NOT NULL,
    causa               TEXT          NOT NULL CHECK (causa IN (
        'renuncia', 'acuerdo', 'desahucio', 'despido_intempestivo', 'visto_bueno_empleador', 'visto_bueno_trabajador', 'fin_contrato'
    )),
    region              TEXT          NOT NULL CHECK (region IN ('sierra', 'costa')),
    anios_servicio      NUMERIC(8,4)  NOT NULL,
    total               NUMERIC(14,2) NOT NULL,
    rubros              TEXT          NOT NULL,
    -- Cuotas de préstamos del IESS que quedaban: no se descuentan, se informan.
    prestamos_cuotas    INTEGER       NOT NULL DEFAULT 0,
    prestamos_valor     NUMERIC(14,2) NOT NULL DEFAULT 0,
    creado_en           TEXT          NOT NULL,
    creado_por          INTEGER       REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX liquidaciones_cuenta ON liquidaciones (cuenta_id);
