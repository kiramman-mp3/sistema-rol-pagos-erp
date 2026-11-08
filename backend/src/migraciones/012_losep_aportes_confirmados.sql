-- Aportes IESS de la LOSEP confirmados en el cuadro "Tasas de aportación" del IESS (iess.gob.ec,
-- fila de los servidores públicos): personal 11.45%, patronal 9.15%, total 20.60%.
-- El régimen sigue por confirmar: el recargo nocturno del 25% no se pudo contrastar con el texto de la LOSEP.
-- Solo se reescribe la nota si nadie la ha editado desde la pantalla de Parámetros.
UPDATE regimenes
SET notas = 'Recargos, topes y vacaciones leídos en la LOSEP (versión de 2016). Aporte IESS confirmado en el cuadro "Tasas de aportación" del IESS, fila de servidores públicos: 11.45% personal y 9.15% patronal (total 20.60%); el cuadro es antiguo, así que conviene revisar la resolución vigente. Por confirmar: el recargo nocturno de 25% no figura en el art. 114 de la LOSEP y no se encontró otra norma que lo fije para servidores públicos (el 25% es el del Código del Trabajo, art. 49).'
WHERE codigo = 'LOSEP'
  AND notas = 'Recargos, topes y vacaciones leídos en la LOSEP (versión de 2016). Por confirmar: el aporte IESS de 11.45% personal y 9.15% patronal viene de fuentes secundarias (Disposición Transitoria 16 de la Ley de Seguridad Social y Resolución CD 501), y el recargo nocturno de 25% no figura en el art. 114.';
