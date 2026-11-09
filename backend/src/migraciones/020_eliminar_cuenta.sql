-- Eliminar una cuenta completa.
-- La auditoría es de solo inserción, pero al eliminar una cuenta debe irse con ella (si no, la clave
-- foránea a `cuentas` impediría borrarla y los datos de la empresa quedarían guardados). El borrado se
-- permite solo dentro de la transacción que marca esa cuenta con `rolpagos.eliminando_cuenta`
-- (`set_config(..., true)` vale hasta el final de la transacción). Modificar una fila sigue prohibido.

CREATE OR REPLACE FUNCTION audit_logs_solo_insertar() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE'
       AND current_setting('rolpagos.eliminando_cuenta', true) = OLD.cuenta_id::text THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'El registro de auditoría no se modifica ni se borra.';
END;
$$ LANGUAGE plpgsql;
