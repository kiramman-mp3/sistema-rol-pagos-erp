-- El dinero, las tasas y las horas pasan de DOUBLE PRECISION (coma flotante, que no representa 0.1
-- exactamente y acumula error al sumar) a NUMERIC (decimal exacto). El motor de cálculo ya redondea
-- a centavos cada rubro, así que los valores guardados no cambian: solo dejan de poder desviarse.
--   dinero  NUMERIC(14,2)  hasta 999 999 999 999,99
--   tasas   NUMERIC(8,6)   fracciones (0.0945) y recargos (hasta 99.999999)
--   horas   NUMERIC(12,4)  las horas digitadas conservan hasta 4 decimales
--   topes   NUMERIC(8,2)   horas por mes (hasta 744)

ALTER TABLE empleados
    ALTER COLUMN sueldo_base TYPE NUMERIC(14,2) USING ROUND(sueldo_base::numeric, 2);

ALTER TABLE parametros_anuales
    ALTER COLUMN sbu TYPE NUMERIC(14,2) USING ROUND(sbu::numeric, 2);

ALTER TABLE escala_salarial
    ALTER COLUMN rmu TYPE NUMERIC(14,2) USING ROUND(rmu::numeric, 2),
    ALTER COLUMN rmu_max TYPE NUMERIC(14,2) USING ROUND(rmu_max::numeric, 2);

ALTER TABLE regimenes
    ALTER COLUMN iess_personal TYPE NUMERIC(8,6) USING ROUND(iess_personal::numeric, 6),
    ALTER COLUMN iess_patronal TYPE NUMERIC(8,6) USING ROUND(iess_patronal::numeric, 6),
    ALTER COLUMN recargo_suplementarias TYPE NUMERIC(8,6) USING ROUND(recargo_suplementarias::numeric, 6),
    ALTER COLUMN recargo_extraordinarias TYPE NUMERIC(8,6) USING ROUND(recargo_extraordinarias::numeric, 6),
    ALTER COLUMN recargo_descanso TYPE NUMERIC(8,6) USING ROUND(recargo_descanso::numeric, 6),
    ALTER COLUMN recargo_nocturno TYPE NUMERIC(8,6) USING ROUND(recargo_nocturno::numeric, 6),
    ALTER COLUMN fondos_reserva TYPE NUMERIC(8,6) USING ROUND(fondos_reserva::numeric, 6),
    ALTER COLUMN tope_suplementarias_mes TYPE NUMERIC(8,2) USING ROUND(tope_suplementarias_mes::numeric, 2),
    ALTER COLUMN tope_extraordinarias_mes TYPE NUMERIC(8,2) USING ROUND(tope_extraordinarias_mes::numeric, 2);

ALTER TABLE novedades
    ALTER COLUMN horas_suplementarias TYPE NUMERIC(12,4) USING ROUND(horas_suplementarias::numeric, 4),
    ALTER COLUMN horas_descanso TYPE NUMERIC(12,4) USING ROUND(horas_descanso::numeric, 4),
    ALTER COLUMN horas_extraordinarias TYPE NUMERIC(12,4) USING ROUND(horas_extraordinarias::numeric, 4),
    ALTER COLUMN horas_nocturnas TYPE NUMERIC(12,4) USING ROUND(horas_nocturnas::numeric, 4),
    ALTER COLUMN comisiones TYPE NUMERIC(14,2) USING ROUND(comisiones::numeric, 2),
    ALTER COLUMN otros_descuentos TYPE NUMERIC(14,2) USING ROUND(otros_descuentos::numeric, 2);

ALTER TABLE roles_cabecera
    ALTER COLUMN total_ingresos TYPE NUMERIC(14,2) USING ROUND(total_ingresos::numeric, 2),
    ALTER COLUMN total_descuentos TYPE NUMERIC(14,2) USING ROUND(total_descuentos::numeric, 2),
    ALTER COLUMN total_neto TYPE NUMERIC(14,2) USING ROUND(total_neto::numeric, 2),
    ALTER COLUMN total_provisiones TYPE NUMERIC(14,2) USING ROUND(total_provisiones::numeric, 2),
    ALTER COLUMN total_costo TYPE NUMERIC(14,2) USING ROUND(total_costo::numeric, 2);

ALTER TABLE roles_detalle
    ALTER COLUMN sueldo_base TYPE NUMERIC(14,2) USING ROUND(sueldo_base::numeric, 2),
    ALTER COLUMN valor_hora TYPE NUMERIC(14,2) USING ROUND(valor_hora::numeric, 2),
    ALTER COLUMN sueldo TYPE NUMERIC(14,2) USING ROUND(sueldo::numeric, 2),
    ALTER COLUMN horas_suplementarias TYPE NUMERIC(12,4) USING ROUND(horas_suplementarias::numeric, 4),
    ALTER COLUMN horas_descanso TYPE NUMERIC(12,4) USING ROUND(horas_descanso::numeric, 4),
    ALTER COLUMN horas_extraordinarias TYPE NUMERIC(12,4) USING ROUND(horas_extraordinarias::numeric, 4),
    ALTER COLUMN horas_nocturnas TYPE NUMERIC(12,4) USING ROUND(horas_nocturnas::numeric, 4),
    ALTER COLUMN valor_horas_suplementarias TYPE NUMERIC(14,2) USING ROUND(valor_horas_suplementarias::numeric, 2),
    ALTER COLUMN valor_horas_descanso TYPE NUMERIC(14,2) USING ROUND(valor_horas_descanso::numeric, 2),
    ALTER COLUMN valor_horas_extraordinarias TYPE NUMERIC(14,2) USING ROUND(valor_horas_extraordinarias::numeric, 2),
    ALTER COLUMN valor_recargo_nocturno TYPE NUMERIC(14,2) USING ROUND(valor_recargo_nocturno::numeric, 2),
    ALTER COLUMN comisiones TYPE NUMERIC(14,2) USING ROUND(comisiones::numeric, 2),
    ALTER COLUMN ingresos_aportables TYPE NUMERIC(14,2) USING ROUND(ingresos_aportables::numeric, 2),
    ALTER COLUMN beneficios_mensuales TYPE NUMERIC(14,2) USING ROUND(beneficios_mensuales::numeric, 2),
    ALTER COLUMN total_ingresos TYPE NUMERIC(14,2) USING ROUND(total_ingresos::numeric, 2),
    ALTER COLUMN aporte_iess TYPE NUMERIC(14,2) USING ROUND(aporte_iess::numeric, 2),
    ALTER COLUMN base_ir_anual TYPE NUMERIC(14,2) USING ROUND(base_ir_anual::numeric, 2),
    ALTER COLUMN ir_anual TYPE NUMERIC(14,2) USING ROUND(ir_anual::numeric, 2),
    ALTER COLUMN impuesto_renta TYPE NUMERIC(14,2) USING ROUND(impuesto_renta::numeric, 2),
    ALTER COLUMN otros_descuentos TYPE NUMERIC(14,2) USING ROUND(otros_descuentos::numeric, 2),
    ALTER COLUMN total_descuentos TYPE NUMERIC(14,2) USING ROUND(total_descuentos::numeric, 2),
    ALTER COLUMN neto_pagar TYPE NUMERIC(14,2) USING ROUND(neto_pagar::numeric, 2),
    ALTER COLUMN decimo_tercero TYPE NUMERIC(14,2) USING ROUND(decimo_tercero::numeric, 2),
    ALTER COLUMN decimo_cuarto TYPE NUMERIC(14,2) USING ROUND(decimo_cuarto::numeric, 2),
    ALTER COLUMN vacaciones TYPE NUMERIC(14,2) USING ROUND(vacaciones::numeric, 2),
    ALTER COLUMN fondos_reserva TYPE NUMERIC(14,2) USING ROUND(fondos_reserva::numeric, 2),
    ALTER COLUMN aporte_patronal TYPE NUMERIC(14,2) USING ROUND(aporte_patronal::numeric, 2),
    ALTER COLUMN total_provisiones TYPE NUMERIC(14,2) USING ROUND(total_provisiones::numeric, 2),
    ALTER COLUMN costo_empleador TYPE NUMERIC(14,2) USING ROUND(costo_empleador::numeric, 2),
    ALTER COLUMN tasa_iess_personal TYPE NUMERIC(8,6) USING ROUND(tasa_iess_personal::numeric, 6),
    ALTER COLUMN tasa_iess_patronal TYPE NUMERIC(8,6) USING ROUND(tasa_iess_patronal::numeric, 6);
