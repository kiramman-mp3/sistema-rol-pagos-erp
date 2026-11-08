-- Reliquidación: corregir un rol ya publicado sin tocarlo.
-- Un rol publicado o pagado no cambia nunca. Si hay un error, se crea un rol de «ajuste» vinculado
-- al original: su detalle guarda solo las diferencias (lo que hay que pagar o descontar de más o de
-- menos) y recorre el mismo ciclo (calculado, validado, aprobado, publicado, pagado).
--   tipo           'ordinario' es el rol del mes; 'ajuste' corrige a uno ordinario.
--   rol_origen_id  el rol ordinario que corrige un ajuste (vacío en los ordinarios).
--   motivo         por qué se corrige.
-- Antes había un solo rol por mes; ahora un solo rol *ordinario* por mes, más los ajustes que haga falta,
-- pero a la vez solo un ajuste sin publicar por rol, para que cada uno parta de lo ya publicado.

ALTER TABLE roles_cabecera
    ADD COLUMN tipo TEXT NOT NULL DEFAULT 'ordinario' CHECK (tipo IN ('ordinario', 'ajuste')),
    ADD COLUMN rol_origen_id INTEGER REFERENCES roles_cabecera(id),
    ADD COLUMN motivo TEXT NOT NULL DEFAULT '',
    ADD CONSTRAINT roles_origen_solo_en_ajustes
        CHECK ((tipo = 'ajuste') = (rol_origen_id IS NOT NULL));

ALTER TABLE roles_cabecera DROP CONSTRAINT roles_cabecera_cuenta_id_anio_mes_key;
CREATE UNIQUE INDEX roles_un_ordinario_por_mes ON roles_cabecera (cuenta_id, anio, mes) WHERE tipo = 'ordinario';
CREATE UNIQUE INDEX roles_un_ajuste_abierto ON roles_cabecera (rol_origen_id)
    WHERE tipo = 'ajuste' AND estado NOT IN ('publicado', 'pagado');
CREATE INDEX roles_origen ON roles_cabecera (rol_origen_id);

-- Un ajuste solo corrige a un rol ordinario que ya está publicado o pagado.
CREATE FUNCTION validar_origen_del_ajuste() RETURNS trigger AS $$
BEGIN
    IF NEW.tipo = 'ajuste' AND NOT EXISTS (
        SELECT 1 FROM roles_cabecera
        WHERE id = NEW.rol_origen_id AND tipo = 'ordinario' AND cuenta_id = NEW.cuenta_id
          AND anio = NEW.anio AND mes = NEW.mes AND estado IN ('publicado', 'pagado')
    ) THEN
        RAISE EXCEPTION 'Un ajuste corrige a un rol ordinario publicado del mismo mes.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER roles_ajuste_origen
    BEFORE INSERT ON roles_cabecera
    FOR EACH ROW EXECUTE FUNCTION validar_origen_del_ajuste();
