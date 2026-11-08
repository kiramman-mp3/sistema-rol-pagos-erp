-- Fecha de salida del empleado (AAAA-MM-DD). Vacía = sigue en la empresa.
-- El rol de cada mes incluye a quien estuvo en nómina ese mes: ingresó antes de que termine y no
-- salió antes de que empiece. En el mes de salida se pagan solo los días hasta esa fecha.
-- Los empleados que ya estaban inactivos no tienen fecha de salida y siguen fuera de todos los roles.
ALTER TABLE empleados ADD COLUMN fecha_salida TEXT;
