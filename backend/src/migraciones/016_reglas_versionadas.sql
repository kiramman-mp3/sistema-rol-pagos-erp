-- Reglas de ley con vigencia: cada régimen puede tener varias versiones, cada una válida desde una fecha.
-- Un rol se calcula con la versión que regía al cierre de su mes; cambiar una tasa agrega una versión
-- nueva en vez de reescribir la anterior, así los meses ya calculados se pueden volver a explicar.
-- Las filas que ya existían quedan como la versión más antigua, vigente desde siempre.
-- (Los parámetros anuales ya son una versión por año: su clave es el año.)

ALTER TABLE regimenes ADD COLUMN vigente_desde TEXT NOT NULL DEFAULT '2000-01-01'
    CHECK (vigente_desde ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
ALTER TABLE regimenes DROP CONSTRAINT regimenes_pkey;
ALTER TABLE regimenes ADD PRIMARY KEY (cuenta_id, codigo, vigente_desde);

-- copiar_plantilla ahora copia todas las versiones de cada régimen.
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

    INSERT INTO parametros_anuales (cuenta_id, anio, sbu, tabla_ir, fuente)
    SELECT destino, anio, sbu, tabla_ir, fuente FROM parametros_anuales WHERE cuenta_id = 1;

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
