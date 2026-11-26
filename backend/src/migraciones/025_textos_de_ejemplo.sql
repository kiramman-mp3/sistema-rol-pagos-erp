-- Textos de los datos de ejemplo pensados para quien usa el sistema, no para quien lo investigó.
--   regimenes.notas          las notas de fábrica contaban de dónde se leyó cada valor; quedan vacías.
--   escala_salarial.fuente   «Tabla de clase (por confirmar)» y «ecu11.com (por confirmar)» pasan a «Escala de ejemplo».
-- Solo cambian los textos de fábrica (por cómo empiezan o terminan), en todas las cuentas y en la plantilla:
-- lo que una empresa escribió por su cuenta se queda igual.

UPDATE regimenes SET notas = ''
WHERE notas LIKE 'Valores leídos del texto del Código del Trabajo.%'
   OR notas LIKE 'La LOEP no fija tasas propias.%'
   OR notas LIKE 'Recargos, topes y vacaciones leídos en la LOSEP (versión de 2016).%';

UPDATE escala_salarial SET fuente = 'Escala de ejemplo'
WHERE fuente IN ('Tabla de clase (por confirmar)', 'ecu11.com (por confirmar)');
