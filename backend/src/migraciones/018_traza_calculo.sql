-- Traza del cálculo: cómo se llegó a cada valor del rol de un empleado.
-- Guarda, en JSON, los pasos del cálculo (fórmula, números y resultado) y el contexto con que se hizo:
-- el régimen que se aplicó, desde qué fecha regía esa versión de sus reglas y los parámetros del año.
-- Se escribe al crear el detalle y, como el detalle de un rol publicado no se modifica, queda fija.
-- Los roles anteriores no la tienen (NULL): no se puede reconstruir con las reglas de entonces.
ALTER TABLE roles_detalle ADD COLUMN traza TEXT;
