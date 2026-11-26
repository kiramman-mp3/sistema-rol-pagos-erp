# 🎨 Marca Cuadra

Guía de la marca de **Cuadra**, el sistema de rol de pagos para Ecuador. Resume las decisiones de nombre, logo, color, mascota, motivos gráficos y lenguaje, y dice dónde vive cada una en el código.

---

## 💡 La idea: «que cuadre»

Quien arma un rol de pagos a mano se hace una sola pregunta al cerrar el mes: ¿esto cuadra? El sistema ya responde con una ecuación (ingresos − descuentos = neto), con una conciliación línea por línea con el IESS y con reglas que citan su fuente. La marca solo lo dice en voz alta.

| Valor | Qué significa en la práctica |
| :--- | :--- |
| **Exacta** | Los números son el protagonista. Cifras con alineación tabular y colores que siempre significan lo mismo. |
| **Serena** | El rol es una tarea con miedo a equivocarse. Azules profundos, mucho aire y mensajes que explican qué pasó y qué hacer. |
| **Cercana** | Se habla de tú, en español de Ecuador, sin jerga contable. El humor vive en la mascota, nunca en un monto. |

**Lema:** «El rol de pagos que cuadra.» Versión corta: «Que cuadre.»

## 🏷️ Nombre

**Cuadra**, con «Rol de pagos» como descriptor debajo. El año de la ley ya no va en el nombre: se muestra como el sello **Ley 2026** (`.sello-ley`), que toma el año de las reglas cargadas.

> El nombre no se ha verificado como marca en el IEPI ni como dominio.

## 🐢 Logo

El símbolo es el caparazón de Galo visto como un gráfico de cuatro piezas, una por cada concepto de la boleta. Se dibuja en SVG, sin imágenes.

- Componente: `frontend/src/app/marca/concha.ts` (`<app-concha>`), con `ancho`, `linea` y `borde` como entradas.
- Sobre fondo claro lleva contorno en tinta; sobre la barra noche, contorno y borde en papel.
- Favicon y ícono de aplicación: `frontend/public/favicon.svg`, `favicon.ico` y `apple-touch-icon.png`. A 32 px o menos se simplifica: sin contorno, solo las cuatro piezas.
- Imagen para compartir: `frontend/public/og.png` (1200 × 630), generada desde `docs/marca/og.html`.

## 🎨 Color

Cuatro colores con significado fijo. Los valores viven en `frontend/src/styles.css` como variables.

| Nombre | Variable | Valor | Uso | Contraste |
| :--- | :--- | :--- | :--- | :--- |
| Noche | `--noche` | `#18237a` | Barra y fondos oscuros | Blanco 13.5:1 |
| Tinta | `--tinta` | `#17163a` | Texto y contorno de Galo | Sobre papel 16.0:1 |
| Papel | `--papel` | `#f3f6ff` | Fondo de las pantallas | Tinta suave 6.6:1 |
| Sol | `--sol` | `#ffc93c` | Dónde estás, qué sigue, botón principal | Tinta sobre sol 11.3:1 |
| Ingresos | `--ingresos` | `#2b44d6` | Todo lo que suma al trabajador | Blanco 7.2:1 |
| Descuentos | `--descuentos` | `#c8382a` | Aportes, retenciones, anticipos | Blanco 5.2:1 |
| Neto | `--neto` | `#0b7f55` | Lo que se paga y lo que cuadra | Blanco 5.0:1 |
| Provisión | `--provision` | `#9a5a00` | Décimos, reservas, vacaciones | Sobre su fondo 4.8:1 |

Dos advertencias de contraste: el coral sobre su fondo (4.5:1) y el verde neto sobre su fondo (4.4:1) quedan en el límite para texto pequeño, así que van en cifras grandes o en negrita; y el coral claro `#ef4b3c` (el de las franjas) no admite texto blanco (3.7:1).

## 🔤 Tipografía

**Bricolage Grotesque** para títulos y cifras y **Figtree** para texto. Ambas están en `frontend/public/fonts` y la aplicación funciona sin internet. Las cifras usan `font-variant-numeric: tabular-nums` para que las columnas de dinero cuadren.

## 🐢 Galo, la mascota

Una tortuga de Galápagos con anteojos de contador. Es de aquí, es paciente y no se equivoca por apuro. Su caparazón es el logo.

Componente: `frontend/src/app/marca/galo.ts` (`<app-galo>`).

| Estado | Cuándo | Animación |
| :--- | :--- | :--- |
| `atento` | Reposo: portada y estados vacíos | Respira, parpadea y mueve un poco la cabeza |
| `calculando` | Mientras se calcula o se carga | Camina en su lugar y las piezas del caparazón se encienden una tras otra |
| `cuadro` | Todo cuadra: rol validado o publicado | Salta tres veces, aparece la burbuja «¡Cuadró!» y cae confeti |
| `no-cuadra` | Hay una diferencia o un error de carga | Niega con la cabeza y la burbuja «≠» tiembla |

Detalles del comportamiento:

- Con `interactivo`, un clic (o Enter y Espacio) lo esconde en su caparazón durante un segundo y medio.
- Se pausa fuera de pantalla: la celebración empieza cuando Galo aparece.
- Con «reducir movimiento» activado en el sistema operativo queda quieto.
- Es decorativo por defecto (`aria-hidden`); con `[decorativo]="false"` se anuncia con una descripción por estado.
- `<app-aviso-galo>` lo junta con un mensaje para estados vacíos, cargas y errores de listas.

**Dónde aparece:** portada (reacciona al simulador), cierre de la portada, estados vacíos, cargas y errores de las listas de empleados, roles y orgánico, aviso de rol validado o publicado y la página 404.

**Dónde no:** la boleta impresa, los CSV, las tablas con montos, el cuadro de conciliación ni errores de ley o de pago.

## 🧩 Motivos gráficos

Cada motivo sale de algo que el sistema ya hace.

| Motivo | De dónde viene | Dónde se usa |
| :--- | :--- | :--- |
| **La ecuación** | Ingresos − descuentos = neto | Simulador, resumen del rol |
| **El escalón** | La escala salarial, un peldaño por grado | `<app-escalon>`: separadores de la portada y encabezado de la boleta |
| **Las tres franjas** | Los colores de la bandera: sol doble, azul y coral | Filete bajo la barra y borde superior de la boleta |
| **Sol y coral** | Círculos planos detrás del contenido | Portada, inicio del mes y cierre |

Estilo de ilustración: formas planas, contorno de tinta de 4 px con esquinas redondeadas, sin degradados ni sombras.

## 🗣️ Lenguaje para el cliente

De tú, claro antes que ingenioso, tranquilo con los problemas y con la fuente a la vista.

| Decimos | Evitamos |
| :--- | :--- |
| Rol de pagos | nómina, planilla, payroll |
| Generar el rol de marzo | Procesar el período de nómina |
| Neto a pagar | Remuneración líquida resultante |
| Registrar mi empresa | Únete a nuestra plataforma integral |
| Hay $0,03 de diferencia con el comprobante del IESS | Inconsistencia detectada en la conciliación |
| Tu empresa, tus empleados, tus reglas | El cliente, los colaboradores, la solución |

Un error dice qué no cuadra, por cuánto y dónde mirar, sin signos de exclamación. El humor es solo de Galo y solo en estados vacíos, cargas y el 404.

## 🔧 Regenerar los activos

`favicon.svg` se edita a mano. El resto de los archivos se genera abriendo el HTML fuente en Chrome:

- `docs/marca/og.html` se captura a 1200 × 630 y produce `frontend/public/og.png`.
- `favicon.ico` agrupa los PNG de 16, 32 y 48 px renderizados desde `favicon.svg`, y `apple-touch-icon.png` es la versión de 180 px sin esquinas redondeadas.
