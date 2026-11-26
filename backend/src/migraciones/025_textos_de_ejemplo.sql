-- Textos de los datos de ejemplo pensados para quien usa el sistema, no para quien lo investigó.
--   regimenes.notas          las notas de fábrica contaban de dónde se leyó cada valor; quedan vacías.
--   regimenes.base_legal     la del Código del Trabajo pierde «aportes: página del IESS», que era una nota de dónde se leyó.
--   escala_salarial.fuente   «Tabla de clase (por confirmar)» y «ecu11.com (por confirmar)» pasan a «Escala de ejemplo».
-- Solo cambian los textos de fábrica (por cómo empiezan o terminan), en todas las cuentas y en la plantilla:
-- lo que una empresa escribió por su cuenta se queda igual.

UPDATE regimenes SET notas = ''
WHERE notas LIKE 'Valores leídos del texto del Código del Trabajo.%'
   OR notas LIKE 'La LOEP no fija tasas propias.%'
   OR notas LIKE 'Recargos, topes y vacaciones leídos en la LOSEP (versión de 2016).%';

UPDATE regimenes SET base_legal = 'Código del Trabajo arts. 49, 55, 69, 71, 111, 113 y 196.'
WHERE base_legal = 'Código del Trabajo arts. 49, 55, 69, 71, 111, 113 y 196; aportes: página del IESS.';

UPDATE escala_salarial SET fuente = 'Escala de ejemplo'
WHERE fuente IN ('Tabla de clase (por confirmar)', 'ecu11.com (por confirmar)');
