-- Rebaja del impuesto a la renta por gastos personales.
--   parametros_anuales.canasta_basica   canasta familiar básica de enero del año (INEC). 0 = sin definir:
--                                       entonces no se aplica la rebaja y el rol avisa.
--   empleados                           lo que el empleado declara en su proyección de gastos personales:
--                                       el total del año, sus cargas familiares (0 a 5) y si él o una carga
--                                       tiene una enfermedad catastrófica, rara o huérfana.
--   roles_detalle                       cada rol guarda esos datos como se usaron y la rebaja que resultó,
--                                       para que un cambio posterior en el empleado no altere el historial.
-- Todo lo que ya existía queda en 0: ningún rol anterior ni ningún empleado cambia de resultado.

ALTER TABLE parametros_anuales ADD COLUMN canasta_basica NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (canasta_basica >= 0);
-- INEC, enero de 2026: USD 821,80.
UPDATE parametros_anuales SET canasta_basica = 821.80 WHERE anio = 2026;

ALTER TABLE empleados
    ADD COLUMN gastos_personales      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gastos_personales >= 0),
    ADD COLUMN cargas_familiares      INTEGER       NOT NULL DEFAULT 0 CHECK (cargas_familiares BETWEEN 0 AND 5),
    ADD COLUMN enfermedad_catastrofica INTEGER      NOT NULL DEFAULT 0 CHECK (enfermedad_catastrofica IN (0, 1));

ALTER TABLE roles_detalle
    ADD COLUMN gastos_personales      NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN cargas_familiares      INTEGER       NOT NULL DEFAULT 0,
    ADD COLUMN enfermedad_catastrofica INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN rebaja_ir_anual        NUMERIC(14,2) NOT NULL DEFAULT 0;

-- copiar_plantilla ahora copia también la canasta básica de cada año.
CREATE OR REPLACE FUNCTION copiar_plantilla(destino INTEGER) RETURNS VOID AS $$
BEGIN
    INSERT INTO regimenes (cuenta_id, codigo, vigente_desde, nombre, descripcion, base_legal, tipo, regimen_servidor,
        regimen_obrero, iess_personal, iess_patronal, recargo_suplementarias, recargo_extraordinarias,
        recargo_descanso, recargo_nocturno, tope_suplementarias_mes, tope_extraordinarias_mes,
        dias_vacaciones, fondos_reserva, meses_para_fondos, aplica_decimo_tercero, aplica_decimo_cuarto,
        aplica_fondos_reserva, aplica_horas_extras, verificado, notas)
    SELECT destino, codigo, vigente_desde, nombre, descripcion, base_legal, tipo, regimen_servidor,
        regimen_obrero, iess_personal, iess_patronal, recargo_suplementarias, recargo_extraordinarias,
        recargo_descanso, recargo_nocturno, tope_suplementarias_mes, tope_extraordinarias_mes,
        dias_vacaciones, fondos_reserva, meses_para_fondos, aplica_decimo_tercero, aplica_decimo_cuarto,
        aplica_fondos_reserva, aplica_horas_extras, verificado, notas
    FROM regimenes WHERE cuenta_id = 1;

    INSERT INTO parametros_anuales (cuenta_id, anio, sbu, tabla_ir, fuente, canasta_basica)
    SELECT destino, anio, sbu, tabla_ir, fuente, canasta_basica FROM parametros_anuales WHERE cuenta_id = 1;

    INSERT INTO escala_salarial (cuenta_id, regimen, grado, denominacion, rmu, rmu_max, es_minimo, fuente)
    SELECT destino, regimen, grado, denominacion, rmu, rmu_max, es_minimo, fuente
    FROM escala_salarial WHERE cuenta_id = 1 ORDER BY id;

    INSERT INTO puestos (cuenta_id, nombre, funcion, responsabilidad, sector, escala_id)
    SELECT destino, p.nombre, p.funcion, p.responsabilidad, p.sector,
           (SELECT n.id FROM escala_salarial n JOIN escala_salarial o ON o.id = p.escala_id
            WHERE n.cuenta_id = destino AND n.regimen = o.regimen AND n.grado = o.grado)
    FROM puestos p WHERE p.cuenta_id = 1 ORDER BY p.id;

    UPDATE puestos n SET superior_id = (
        SELECT sn.id FROM puestos sn JOIN puestos so ON so.nombre = sn.nombre AND so.cuenta_id = 1
        WHERE sn.cuenta_id = destino AND so.id = (SELECT o.superior_id FROM puestos o WHERE o.cuenta_id = 1 AND o.nombre = n.nombre))
    WHERE n.cuenta_id = destino;
END;
$$ LANGUAGE plpgsql;
