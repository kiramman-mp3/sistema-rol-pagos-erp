# 💼 Rol de Pagos Ecuador 2026

[![Angular](https://img.shields.io/badge/Angular-22-dd0031?style=flat-square&logo=angular&logoColor=white)](https://angular.dev/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ecf8e?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Node](https://img.shields.io/badge/Node-%3E%3D%2024-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Rol de Pagos Ecuador** es un sistema de nómina para Ecuador cuyas reglas de ley se **parametrizan** desde la propia aplicación: régimen laboral, salario básico, escala salarial, décimos, fondos de reserva, horas extras y aportes al IESS. Una API en **Express**, una aplicación en **Angular**, una página de inicio pública y, detrás del botón **Registrar mi empresa**, el sistema completo: cada empresa crea su cuenta y todos sus datos (empleados, roles, orgánico, escala y reglas de ley) son solo suyos.

Se hizo como práctica de la guía APE, que pide un rol de pagos parametrizable: escoger el régimen laboral (Código del Trabajo, LOSEP o LOEP), el salario básico, la escala salarial, si el trabajador recibe décimo tercero, décimo cuarto y horas extras, y ver si el IESS, que se hace a mano en Excel, se puede automatizar.

> [!TIP]
> **¿Quieres verlo funcionando?** No necesitas instalar ninguna base de datos: con dos comandos queda corriendo en `http://localhost:3000`. El seed crea la cuenta `demo@empresa.com` con 12 empleados y nueve meses de roles de ejemplo; entras con ese correo y la contraseña que pongas.
> ```bash
> npm run instalar && npm --prefix backend run seed -- demo@empresa.com --clave "una-clave-larga" && npm start
> ```
> Sin el seed también sirve: abre la página y usa **Registrar mi empresa**.

---

## 🛡️ Descripción

### ¿Qué problema resuelve?
En muchas empresas el rol de pagos se arma a mano en Excel: hay que acordarse de qué recargo lleva cada tipo de hora extra, de qué décimos se pagan cada mes y cuáles se acumulan, de la tabla del impuesto a la renta del año y de qué aportes corresponden al régimen de cada persona. Un cambio de ley obliga a revisar todas las fórmulas. **Rol de Pagos Ecuador** guarda esas reglas como datos que se editan en pantalla, así que un cambio normativo es un cambio de parámetros y no de código.

### ¿Qué hace?
Cada empresa se registra con su nombre, su RUC, un correo y una contraseña, y trabaja en su propia cuenta. Para cada mes, la persona encargada anota las novedades (horas extras, comisiones, anticipos) y el sistema:
1. Calcula a cada empleado activo con las reglas de **su** régimen: aporte personal al IESS, impuesto a la renta, décimos, fondos de reserva y vacaciones.
2. Entrega el neto a pagar y el costo total para la empresa (ingresos + provisiones).
3. Genera la **boleta individual** imprimible y la descarga en **CSV** del rol y de los aportes.
4. Arma el **cuadro de conciliación con el IESS**, para contrastarlo línea por línea con el comprobante del portal.

Los roles ya generados guardan sus valores, y las reglas de cada régimen tienen vigencia por fecha: cambiar una tasa agrega una versión nueva, y volver a generar un mes anterior usa la que regía entonces.

### ¿Para quién está pensado?
Para el área de talento humano o contabilidad de una empresa pequeña o mediana (cada una registra la suya), y para quien necesite estudiar cómo se compone un rol de pagos ecuatoriano: el motor de cálculo son funciones puras, con pruebas, y cada regla cita su fuente.

---

## 🖼️ Capturas

| | |
|:---:|:---:|
| <img src="docs/capturas/inicio-publico.png" alt="Página de inicio con el simulador" width="420"><br><sub>Inicio público con simulador</sub> | <img src="docs/capturas/inicio-del-mes.png" alt="Inicio del mes" width="420"><br><sub>Inicio del mes en cuatro pasos</sub> |
| <img src="docs/capturas/empleados.png" alt="Lista de empleados" width="420"><br><sub>Empleados</sub> | <img src="docs/capturas/organico-funcional.png" alt="Orgánico funcional" width="420"><br><sub>Orgánico funcional</sub> |
| <img src="docs/capturas/parametros-regimenes.png" alt="Parámetros: regímenes laborales" width="420"><br><sub>Parámetros: regímenes laborales</sub> | <img src="docs/capturas/roles-de-pago.png" alt="Roles de pago" width="420"><br><sub>Roles de pago por mes</sub> |
| <img src="docs/capturas/rol-detalle.png" alt="Detalle de un rol" width="420"><br><sub>Detalle del rol y conciliación con el IESS</sub> | <img src="docs/capturas/boleta.png" alt="Boleta individual" width="420"><br><sub>Boleta individual imprimible</sub> |

---

## ✨ Características

*   **Tres regímenes laborales:** Código del Trabajo, LOSEP y LOEP. En la LOEP se indica además si el empleado es servidor u obrero, y el rol usa las reglas del régimen que le corresponde.
*   **Todo parametrizable en pantalla:** SBU, tabla del impuesto a la renta (por año), aportes, recargos, topes, vacaciones y beneficios de cada régimen se editan en **Parámetros**, sin tocar el código.
*   **Reglas con vigencia por fecha:** cada cambio a las tasas de un régimen se guarda como una versión nueva «vigente desde» una fecha. Un rol usa la versión que regía al cierre de su mes, así que subir un aporte en octubre no altera septiembre. Las versiones anteriores se pueden consultar, corregir o eliminar.
*   **Reliquidación sin tocar lo publicado:** un error en un rol publicado se corrige con un ajuste vinculado al original, que guarda solo la diferencia y recorre el mismo ciclo y la misma auditoría. Original más ajustes da el total real del mes.
*   **Escala salarial y orgánico funcional:** el sueldo sale del grado elegido (exacto en la LOSEP, mínimo en el Código del Trabajo) y cada puesto del orgánico lleva su función, su responsable y su nivel de referencia.
*   **Décimos y fondos a la medida:** por empleado, cada beneficio se paga cada mes en el rol, se acumula o no se recibe.
*   **Horas extras por tipo:** suplementarias, extraordinarias, de sábado, domingo y feriado, y nocturnas, con el recargo y el tope de cada régimen. Los topes avisan, sin bloquear.
*   **Rebaja por gastos personales:** el impuesto a la renta se rebaja el 18 % de los gastos que el empleado declaró, con un tope según sus cargas familiares y la canasta básica del año. Es opcional: sin gastos declarados no cambia nada.
*   **Dinero exacto:** todo se calcula con `decimal.js`, se redondea a centavos en cada rubro y se guarda en columnas `NUMERIC`, sin errores de coma flotante.
*   **Préstamos del IESS:** cada préstamo se registra con su cuota, su número de cuotas y su primer mes; el rol descuenta la cuota que toca, se pueden suspender y el historial no cambia.
*   **Liquidación por salida:** décimos acumulados, vacaciones no gozadas y, según la causa, la bonificación por desahucio y la indemnización por despido, cada rubro con su fórmula. Se revisa antes de registrar y queda guardada con una foto de cómo se calculó.
*   **Vacaciones gozadas:** cada periodo que toma un empleado se registra con sus fechas; el saldo sale de los días que devenga su régimen menos los que ya tomó, y avisa, sin bloquear, si toma de más.
*   **Conciliación con el IESS:** materia gravada, aportes personal y patronal y fondos de reserva por empleado, descargables en CSV.
*   **Boleta y CSV:** boleta individual imprimible en una hoja y exportación del rol para Excel.
*   **Ciclo del rol:** cada rol pasa por calculado, validado, aprobado, publicado y pagado. Un rol publicado es inmutable: no se recalcula, no se edita y no se elimina, y la base también lo impide.
*   **Auditoría:** cada paso del rol (quién, qué y cuándo) queda en un registro que solo admite inserciones.
*   **Usuarios con roles:** cada cuenta tiene varios usuarios, con rol de administrador, aprobador o lector. El administrador agrega y quita usuarios, cambia sus roles y les define la contraseña; el servidor niega con `403` lo que el rol no permite. Opcionalmente, quien generó un rol no puede aprobarlo ni publicarlo (separación de funciones).
*   **Cédula validada:** dígito verificador (módulo 10) y provincia.
*   **Una cuenta por empresa:** la empresa se registra con su RUC (validado con su dígito verificador) y un correo. Sus empleados, roles, novedades, orgánico, escala y reglas de ley son solo de su cuenta: ninguna otra empresa los ve ni los toca.
*   **Reglas propias, con plantilla de partida:** cada cuenta nueva recibe una copia de los regímenes, los parámetros anuales, la escala y el orgánico de ejemplo. Los edita sin afectar a las demás, y la página de inicio pública usa la plantilla.
*   **Acceso con contraseña:** se entra con correo y contraseña; la sesión dura 8 horas y la API privada responde `401` sin ella. La contraseña se guarda como hash `scrypt`, nunca en claro.
*   **Fecha de salida:** quien se va cobra solo los días hasta su salida y deja de entrar a los roles siguientes; los meses anteriores no cambian.
*   **Sin dependencias de CDN:** las tipografías van incluidas en el proyecto.

---

## 🛠️ Tecnologías Utilizadas

*   **Frontend:** Angular 22 (componentes standalone, señales, sin zone.js) y TypeScript
*   **Backend:** Express 5 y TypeScript, ejecutado directamente por Node 24 (sin paso de compilación)
*   **Base de datos:** PostgreSQL sin ORM
    *   `pg` contra **Supabase** en producción
    *   `PGlite` (un Postgres dentro del proceso) en las pruebas y para trabajar en local sin instalar nada
*   **Cálculo:** `decimal.js`
*   **Pruebas:** `node:test` (backend, incluida la API completa) y Vitest (frontend)
*   **Despliegue:** Vercel (frontend y backend como servicios de un mismo proyecto)

---

## 📐 Arquitectura

El motor de cálculo no sabe nada de la base de datos: recibe las reglas ya armadas y devuelve el resultado. Las rutas leen las reglas de la base, llaman al motor y guardan el rol. La sesión lleva la cuenta de quien entró y cada consulta se filtra por ella.

```mermaid
graph TD
    Web["Angular 22 · frontend/"] -->|HTTP /api| App["app.ts · Express 5"]
    App --> Sesion["exigirSesion · la cuenta de la sesión"]
    Sesion --> Rutas["rutas/ · auth, cuenta, empleados, roles, parámetros, regímenes, escala, puestos"]

    Rutas --> Motor["calculos.ts · motor de cálculo (funciones puras)"]
    Rutas --> Reglas["regimenes.ts · parametros.ts · escala.ts · puestos.ts · cuentas.ts"]
    Rutas --> IESS["iess.ts · conciliación"]
    Rutas --> Ciclo["ciclo.ts · estados, validación · auditoria.ts · registro"]

    Reglas --> DB["db.ts · consultas, transacciones y migraciones"]
    Rutas --> DB
    Ciclo --> DB
    DB -->|DATABASE_URL| Supabase[("PostgreSQL · Supabase")]
    DB -->|sin DATABASE_URL, y en pruebas| PGlite[("PGlite · en memoria o en backend/data")]
```

---

## 📂 Estructura del Proyecto

```bash
rol-pagos-ecuador/
├── backend/                   # API REST (Express 5, TypeScript, PostgreSQL)
│   ├── src/
│   │   ├── calculos.ts        # Motor de cálculo: funciones puras. Empezar a leer aquí
│   │   ├── regimenes.ts       # Regímenes laborales, reglas por régimen y opciones por empleado
│   │   ├── parametros.ts      # SBU y tabla del IR por año
│   │   ├── escala.ts          # Escala salarial
│   │   ├── puestos.ts         # Orgánico funcional
│   │   ├── iess.ts            # Cuadro de conciliación con el IESS
│   │   ├── prestamos.ts       # Préstamos del IESS: qué cuota toca cada mes
│   │   ├── vacaciones.ts      # Vacaciones: días devengados, gozados y saldo
│   │   ├── liquidacion.ts     # Liquidación por salida: función pura con las reglas por causa
│   │   ├── liquidaciones.ts   # Reúne los datos de la base para calcular una liquidación
│   │   ├── ciclo.ts           # Ciclo del rol: estados, pasos y revisión de errores bloqueantes
│   │   ├── auditoria.ts       # Registro de auditoría (solo inserciones)
│   │   ├── permisos.ts        # Roles de usuario y qué permiso exige cada ruta
│   │   ├── demo.ts            # Empleados y roles de ejemplo (los usa el seed)
│   │   ├── db.ts              # PostgreSQL sin ORM (pg, o PGlite) y ejecutor de migraciones
│   │   ├── auth.ts            # Contraseña (scrypt), sesión firmada con la cuenta y límite de intentos
│   │   ├── cuentas.ts         # Registro de empresas, usuarios y datos de la empresa
│   │   ├── seed.ts            # Script: crea una cuenta de ejemplo y la llena
│   │   ├── usuario.ts         # Script: lista las cuentas y agrega usuarios a una cuenta
│   │   ├── rutas/             # auth, cuenta, empleados, préstamos, vacaciones, liquidaciones, roles, parámetros, regímenes, escala y puestos
│   │   ├── migraciones/       # Esquema versionado: 001 a 024 (SQL numerado)
│   │   ├── validaciones.ts    # Cédula, RUC, correo, números y fechas
│   │   ├── server.ts          # Arranque local
│   │   └── vercel.ts          # Entrada del backend en Vercel
│   └── test/                  # node:test, incluida la API completa
├── frontend/                  # Angular 22
│   ├── src/app/landing/       # Página de inicio con el simulador
│   ├── src/app/entrar/        # Inicio de sesión
│   ├── src/app/registro/      # Registro de una empresa
│   ├── src/app/informacion/   # Acerca de, investigación y fuentes
│   ├── src/app/sistema/       # Shell, inicio del mes, empleados, préstamos, vacaciones, liquidaciones, orgánico, roles, parámetros y usuarios
│   ├── src/app/core/          # Cliente de la API, sesión, avisos, pipe de dinero, modelos y fuentes
│   └── src/styles.css         # Sistema visual global
├── docs/capturas/             # Capturas de pantalla de este README
├── vercel.json                # Servicios de Vercel: frontend y backend
└── package.json               # Scripts de la raíz
```

---

## 📋 Requisitos del Sistema

*   **Node.js:** versión `>= 24`
*   **Gestor de paquetes:** `npm`
*   **Base de datos (solo para producción):** un PostgreSQL, por ejemplo un proyecto de [Supabase](https://supabase.com/). Para desarrollar no hace falta nada: se usa PGlite.

---

## 🚀 Instalación y Configuración

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/kiramman-mp3/sistema-rol-pagos-erp.git
    cd sistema-rol-pagos-erp
    ```

2.  **Instalar dependencias** de la raíz, el backend y el frontend:
    ```bash
    npm run instalar
    ```

3.  **Elegir la base de datos.** La base es **PostgreSQL**:
    *   **Sin configurar nada**, se usa una base PGlite en `backend/data/pglite`. Borrar esa carpeta reinicia la base local.
    *   **Con Supabase u otro Postgres**, define `DATABASE_URL` con su cadena de conexión:
        ```bash
        export DATABASE_URL='postgresql://usuario:contraseña@host:6543/postgres'
        ```
        En Supabase usa la cadena del **pooler** (puerto 6543): el host directo `db.<proyecto>.supabase.co` solo tiene IPv6 y Vercel no lo alcanza. Nunca guardes la cadena en el repositorio.

    El esquema se crea y se actualiza solo al arrancar (ver Migraciones, más abajo).

4.  **Definir el secreto de las sesiones.** Las empresas se registran e inician sesión desde la página; el servidor firma cada sesión con `SESION_SECRETO` (al menos 32 caracteres). Genera uno y defínelo antes de arrancar:
    ```bash
    export SESION_SECRETO="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
    ```
    Sin él y con la base local (PGlite), el servidor inventa uno temporal y avisa: las sesiones se cierran al reiniciar, y sirve para trabajar en tu máquina. Con `DATABASE_URL` el servidor **no arranca** sin `SESION_SECRETO`. Cambiar el secreto cierra todas las sesiones abiertas. Nunca lo guardes en el repositorio.

    | Variable | Para qué sirve |
    |---|---|
    | `DATABASE_URL` | Cadena de conexión de Postgres (Supabase). Sin ella se usa PGlite |
    | `DATABASE_SSL_CA` | Certificado de la autoridad de la base (el texto PEM o la ruta del archivo). Supabase firma con su propia CA (`prod-ca-2021.crt`, en *Database Settings*): sin él, la conexión se rechaza |
    | `DATABASE_SSL_INSECURE` | `1` desactiva la verificación del certificado. Solo como salida de emergencia: permite que un intermediario lea la conexión |
    | `SESION_SECRETO` | Firma las sesiones. Obligatorio con una base remota |
    | `CORREO_SMTP_URL` | Servidor SMTP para los correos (`smtp://usuario:clave@servidor:587`; `smtps://` para el puerto 465). Sin él, los correos se escriben en la consola del servidor |
    | `CORREO_REMITENTE` | Quién firma los correos, por ejemplo `Rol de pagos <no-responder@tu-dominio.com>`. Va junto con `CORREO_SMTP_URL` |
    | `APP_URL` | Dirección pública de la aplicación (`https://rol.tu-dominio.com`), para los enlaces de los correos. Obligatoria si hay `CORREO_SMTP_URL` |

5.  **Cargar los datos de ejemplo** (opcional): crea la cuenta de una empresa de ejemplo, con 12 empleados y los roles de enero a septiembre de 2026. Con tu correo y una contraseña de al menos 10 caracteres:
    ```bash
    npm --prefix backend run seed -- demo@empresa.com --clave "una-clave-larga"
    ```
    Una empresa real no necesita el seed: se registra desde la página.

---

## 🎮 Uso y Ejecución

### Modo producción local
Compila Angular y sirve todo desde Express en `http://localhost:3000`:
```bash
npm start
```

### Modo desarrollo
Recarga automática: API en `:3000` y Angular en `http://localhost:4200`, con proxy de `/api`:
```bash
npm run dev
```

### Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run instalar` | Instala dependencias de los tres proyectos |
| `npm start` | Compila el frontend y sirve todo desde Express |
| `npm run dev` | Backend y frontend en modo desarrollo, con proxy de `/api` |
| `npm run build` | Compila el frontend |
| `npm test` | Pruebas del backend (Node) y del frontend (Vitest) |
| `npm run lint` | Tipos y ESLint de ambos proyectos |
| `npm --prefix backend run seed -- correo --clave "contraseña"` | Crea la cuenta «Empresa Demo S.A.» con ese correo (si no existe) y la llena con 12 empleados y los roles de enero a septiembre de 2026. Con un correo que ya existe y sin datos, solo la llena |
| `npm --prefix backend run seed -- correo --reiniciar` | Antes borra los empleados, roles y novedades **de esa cuenta** (las demás no se tocan) y empieza de cero. Contra un servidor Postgres exige además `--confirmo-produccion` |
| `npm --prefix backend run usuario -- --listar` | Muestra cada cuenta con su empresa, sus usuarios y cuántos empleados tiene |
| `npm --prefix backend run usuario -- correo "contraseña" --cuenta 2 --rol aprobador` | Agrega un usuario a una cuenta que ya existe, con ese rol (`administrador` si no se indica `--rol`) |

---

## ☁️ Despliegue

El proyecto se despliega en **Vercel** como un solo proyecto con dos servicios (`vercel.json`): el frontend Angular y el backend Express, que atiende `/api/*`. La base es la de Supabase.

```bash
vercel env add DATABASE_URL production --sensitive       # cadena del pooler de Supabase
vercel env add DATABASE_SSL_CA production --sensitive    # certificado de Supabase (prod-ca-2021.crt)
vercel env add SESION_SECRETO production --sensitive     # al menos 32 caracteres aleatorios
vercel env add CORREO_SMTP_URL production --sensitive    # servidor SMTP de tu proveedor de correo
vercel env add CORREO_REMITENTE production               # "Rol de pagos <no-responder@tu-dominio.com>"
vercel env add APP_URL production                        # https://tu-dominio.com
vercel deploy --prod
```

El backend no arranca en Vercel sin `DATABASE_URL` y `SESION_SECRETO`, ni con `CORREO_SMTP_URL` sin `APP_URL`. Sin las variables de correo la aplicación arranca, pero recuperar la contraseña no llega a nadie (el mensaje queda en el registro de la función): defínelas antes de dar acceso a otras personas. Las empresas no se configuran en la plataforma: se registran desde la página y quedan guardadas en la base. Si la conexión a la base se rechaza por el certificado, define `DATABASE_SSL_CA`.

---

## 🧭 Recorrido

1. **Página de inicio (`/`)**: explica el sistema, lleva a **Registrar mi empresa** (`/registro`) o a **Ingresar** (`/entrar`) y tiene un simulador que calcula un sueldo en vivo con el motor real. Se elige el régimen y si los décimos se pagan, se acumulan o no se reciben.
2. **Información (`/informacion`)**: de qué trata el proyecto, lo que encontró la investigación y los enlaces de todas las fuentes.
3. **Inicio del mes (`/sistema/inicio`)**: la primera pantalla al ingresar; `/sistema` pide correo y contraseña en `/entrar` y, al entrar, vuelve a donde se iba. Quien aún no tiene cuenta la crea en `/registro` (nombre de la empresa, RUC, correo y contraseña de al menos 10 caracteres) y entra directo. El botón **Salir** cierra la sesión; la barra muestra el nombre de la empresa de la cuenta. Muestra en cuatro pasos (equipo, novedades, rol generado, pagos e IESS) en qué punto está el mes y ofrece el botón de lo que sigue.
4. **Parámetros (`/sistema/parametros`)**: tres pestañas. *Año*: SBU y tabla del impuesto a la renta, con la opción de agregar un año nuevo copiando otro. *Regímenes laborales*: aportes, recargos, topes, vacaciones y beneficios de cada uno, con la fecha desde la que rige el cambio y la lista de versiones anteriores. *Escala salarial*: los grados de cada régimen.
5. **Empleados**: alta con cédula validada (módulo 10), régimen, grado de la escala, beneficios, horas extras y fecha de salida opcional. Un clic carga seis empleados de ejemplo que cubren los tres regímenes.
6. **Roles de pago**: se elige el mes en un calendario de doce meses que muestra cuál ya tiene rol y se digitan las novedades (horas suplementarias, extraordinarias, de sábado, domingo o feriado, y nocturnas; comisiones; anticipos). Quien no recibe horas extras tiene esas columnas deshabilitadas.
7. **Generar**: el backend calcula a cada empleado activo con las reglas de su régimen y guarda una foto en `roles_detalle`. Avisa, sin bloquear, si alguien pasa el tope mensual de horas. El rol nace «calculado».
8. **Rol**: dos ecuaciones (`ingresos − descuentos = neto` e `ingresos + provisiones = costo empleador`), la planilla por empleado, el costo empleador aparte y la **conciliación con el IESS**. Arriba, el **ciclo del rol**: un botón con el paso que sigue (validar, aprobar, publicar, marcar como pagado) y el historial de quién lo hizo.
9. **Boleta individual** imprimible en una hoja, y **descarga en CSV** del rol y de los aportes al IESS.
10. **Usuarios (`/sistema/usuarios`)**, solo para administradores: agregar personas con su rol, cambiar roles y contraseñas, eliminar usuarios y activar la separación de funciones. Quien entra como aprobador o lector ve un aviso con lo que puede hacer.
11. **Préstamos (`/sistema/prestamos`)**: registrar los préstamos del IESS de un empleado, suspenderlos o eliminarlos; el rol del mes descuenta la cuota que toque.
12. **Vacaciones (`/sistema/vacaciones`)**: el saldo de días de cada persona (devengados, gozados y los que le quedan), los periodos que ya tomó y un formulario para registrar otro. Avisa si toma más de lo devengado.
13. **Liquidaciones (`/sistema/liquidaciones`)**: se elige a quien sale, la fecha, la causa y la región, y el sistema muestra cada rubro con su fórmula y sus números, más los avisos. Solo al confirmar se registra y se da de salida al empleado.
14. **Cuenta (`/sistema/cuenta`)**, solo para administradores: descargar todos los datos de la empresa en un archivo JSON o eliminarla para siempre.

---

## ✅ Qué pide la guía y cómo se cumple

| La guía pide | Cómo lo hace el sistema | Dónde |
|---|---|---|
| Hacer un rol de pagos | Empleados, novedades del mes, rol con neto y costo empleador, boleta imprimible y CSV | Roles de pago |
| Que sea parametrizable | SBU, tabla del IR, regímenes y escala salarial se editan en pantalla, sin tocar el código | Parámetros |
| Escoger el régimen: Código del Trabajo, LOSEP o LOEP | Cada empleado tiene su régimen; en la LOEP se indica además si es servidor u obrero | Empleados |
| Salario básico | Se guarda por año; no se registra a un empleado con un sueldo por debajo (ni del SBU ni del mínimo de su nivel) y define el décimo cuarto | Parámetros, pestaña del año |
| Escala salarial | Grados con su remuneración; al elegir uno se propone el sueldo y el cargo | Parámetros y Empleados |
| Si recibe décimo tercero y décimo cuarto | Por empleado: no lo recibe, se paga cada mes en el rol o lo acumula | Empleados, sección de beneficios |
| Si recibe horas extras | Por empleado y por régimen, con el recargo y el tope de cada uno | Empleados y novedades |
| IESS, manual en Excel: ver si se automatiza | El aporte personal y el patronal se calculan solos; además se entrega un cuadro de conciliación con el comprobante del IESS | Detalle del rol |

---

## 🔌 API

| Método y ruta | Uso |
|---|---|
| `POST /api/auth/registro` | Crea la cuenta de una empresa y abre la sesión (`empresa`, `ruc`, `email`, `clave`). Correo repetido: `409` |
| `GET /api/auth/yo`, `POST /api/auth/entrar`, `POST /api/auth/salir` | Estado de la sesión (con el `rol`, los `permisos` y `emailVerificado` de quien entró), inicio (`email`, `clave`) y cierre de sesión |
| `POST /api/auth/recuperar` | Manda por correo un enlace para elegir otra contraseña (`email`). Responde `202` con el mismo mensaje exista o no la cuenta. Límite: cinco solicitudes cada 15 minutos por IP (`429`) |
| `POST /api/auth/restablecer` | Cambia la contraseña con el token del enlace (`token`, `clave`). Token desconocido, vencido o ya usado: `400`. Responde `204` |
| `POST /api/auth/verificar` | Confirma el correo con el token del enlace (`token`). Responde `204` |
| `POST /api/auth/reenviar-verificacion` | Con sesión: manda otro enlace de verificación. Si ya está verificado: `409`. Responde `202` |
| `GET /api/cuenta`, `PUT /api/cuenta` | Nombre, RUC y `separarFunciones` de la empresa de la sesión (`empresa`, `ruc`, `separarFunciones` opcional) |
| `GET /api/cuenta/exportar` | Descarga un JSON con todo lo de la empresa (empleados, novedades, reglas, escala, orgánico, roles con su desglose, usuarios sin contraseñas y auditoría). Solo administrador |
| `DELETE /api/cuenta` | Elimina la empresa y todo lo suyo, para siempre. Cuerpo: `ruc` y `clave` del usuario; si alguno no coincide: `400`; tras cinco fallos: `429`. Responde `204` y cierra la sesión. Solo administrador |
| `GET /api/usuarios` | Usuarios de la cuenta y los roles posibles. Solo administrador |
| `POST /api/usuarios` | Agrega un usuario (`email`, `clave`, `rol`). Correo en uso: `409` |
| `PATCH /api/usuarios/:id` | Cambia el `rol`, la `clave` o ambos. Si deja a la cuenta sin administradores: `409` |
| `DELETE /api/usuarios/:id` | Elimina un usuario, que pierde el acceso al instante. No se puede eliminar uno mismo ni al último administrador (`409`) |
| `GET /api/parametros?anio=` | Reglas de ley del año, tabla del IR, regímenes y datos de la empresa. Con sesión, los de la cuenta; sin ella, los de la plantilla |
| `PUT /api/parametros/:anio` | Crea o actualiza el SBU, la canasta familiar básica (`canastaBasica`, opcional) y la tabla del IR de un año |
| `POST /api/simulacion` | Calcula un rol de ejemplo sin guardar nada (`regimen`, `categoriaLoep`, `decimos`) |
| `GET /api/regimenes`, `GET /api/regimenes/:codigo` | Regímenes con todas sus reglas, en la versión que rige hoy o en la de `?fecha=AAAA-MM-DD` |
| `GET /api/regimenes/:codigo/versiones` | Todas las versiones de un régimen, la más reciente primero |
| `PUT /api/regimenes/:codigo` | Edita las reglas de un régimen. Con `vigenteDesde` (AAAA-MM-DD) crea la versión de esa fecha, o corrige la que ya empieza ese día; sin ella corrige la versión de hoy |
| `DELETE /api/regimenes/:codigo/versiones/:desde` | Elimina una versión. La única que queda de un régimen no se puede eliminar (`409`) |
| `GET /api/escala?regimen=` | Grados de la escala salarial |
| `POST /api/escala`, `PUT/DELETE /api/escala/:id` | Alta, edición y baja de un grado |
| `GET/POST /api/puestos`, `GET/PUT/DELETE /api/puestos/:id` | Puestos del orgánico funcional |
| `PATCH /api/puestos/:id/responsable` | Asigna o quita al responsable de un puesto |
| `GET/POST /api/prestamos`, `GET/PUT/DELETE /api/prestamos/:id` | Préstamos del IESS: `empleadoId`, `tipo` (`quirografario`, `hipotecario` o `prendario`), `cuota`, `cuotas`, `primerAnio` y `primerMes`. `GET` acepta `?empleadoId=` y devuelve también el mes de la última cuota y el total |
| `PATCH /api/prestamos/:id/estado` | Suspende o reanuda el descuento de un préstamo |
| `GET /api/vacaciones/saldos` | Por cada empleado activo: `diasPorAnio`, `devengados`, `gozados` y `saldo` a hoy |
| `POST /api/liquidaciones/calcular` | Calcula una liquidación sin guardar nada (`empleadoId`, `fechaSalida`, `causa`, `region`). Devuelve los `rubros`, el `total`, las cuotas de préstamos pendientes y los `avisos`. Cualquier rol puede consultarla |
| `GET/POST /api/liquidaciones`, `GET/DELETE /api/liquidaciones/:id` | Lista, registra (mismo cuerpo que `calcular`; marca al empleado como salido en esa fecha), consulta y elimina. Una persona con liquidación ya registrada responde `409` |
| `GET/POST /api/vacaciones`, `DELETE /api/vacaciones/:id` | Periodos gozados (`empleadoId`, `desde`, `hasta`, `observacion`). Los `dias` los calcula el servidor. `GET` acepta `?empleadoId=`; el `POST` devuelve `avisos`. Un periodo que se cruza con otro responde `409` |
| `GET/POST /api/empleados` | Lista y alta. Cada empleado lleva `gastosPersonales`, `cargasFamiliares` y `enfermedadCatastrofica` para la rebaja del impuesto a la renta |
| `GET/PUT/DELETE /api/empleados/:id` | Consulta, edición y baja |
| `PATCH /api/empleados/:id/estado` | Activa o desactiva. Al desactivar registra la salida (`fechaSalida` del cuerpo, o hoy); al activar la borra |
| `POST /api/empleados/demo` | Carga los 12 empleados de ejemplo en la cuenta (sin roles de pago) |
| `GET /api/roles` | Historial de roles |
| `GET /api/roles/periodo/:anio/:mes` | Empleados del mes, su régimen y las novedades ya digitadas |
| `POST /api/roles/generar` | Calcula y guarda el rol en estado «calculado» (reemplaza el del mes) y devuelve los avisos. Si el del mes está publicado o pagado: `409` |
| `GET /api/roles/:id` | Rol con su detalle por empleado. Un ajuste trae además su `origen`; un rol publicado o pagado trae sus `ajustes`, el `consolidado` del mes (rol más ajustes publicados) y cómo quedó cada empleado (`vigente`) |
| `GET /api/roles/:id/traza/:cedula` | Cómo se calculó cada valor de un empleado en ese rol: contexto (régimen, versión de reglas, parámetros) y pasos con fórmula, números y resultado. `404` si la persona no está en el rol o el rol es anterior al desglose. Lo pueden ver los tres roles de usuario |
| `POST /api/roles/:id/reliquidar` | Crea un ajuste de un rol publicado o pagado. Cuerpo: `motivo` (5 a 500 caracteres) y `cambios`, una lista por `cedula` con `sueldoBase`, horas, `comisiones` u `otrosDescuentos`. Responde `201`. Si el rol no está publicado, ya hay un ajuste abierto o el rol es un ajuste: `409`. Si nada cambia: `400`. Solo administrador |
| `GET /api/roles/:id/csv` | Exportación para Excel |
| `GET /api/roles/:id/iess`, `GET /api/roles/:id/iess.csv` | Aportes por empleado para conciliar con el IESS |
| `POST /api/roles/:id/validar` | Revisa el rol. Responde `{ valido, estado, errores, avisos }`: sin errores pasa a «validado»; con errores no avanza (y uno validado vuelve a «calculado») |
| `POST /api/roles/:id/aprobar` | «validado» a «aprobado» |
| `POST /api/roles/:id/publicar` | «aprobado» a «publicado». Vuelve a revisar el rol y, si hay errores bloqueantes, responde `409` con ellos |
| `POST /api/roles/:id/pagar` | «publicado» a «pagado» |
| `GET /api/roles/:id/historial` | Pasos del rol en la auditoría: acción, usuario, detalle y fecha |
| `DELETE /api/roles/:id` | Elimina el rol, salvo que esté publicado o pagado (`409`) |

Toda la API exige sesión, salvo `GET /api/parametros`, `POST /api/simulacion` y `/api/auth/*`, que usa la página de inicio; sin sesión responde `401`. Con sesión pero sin el permiso del rol, `403` (ver Roles de Usuario). Con sesión, **todo** se filtra por la cuenta: lo de otra empresa responde `404`, igual que si no existiera. Los registros desde una misma IP están limitados a cinco cada 15 minutos (`429`). Tras cinco contraseñas incorrectas desde una misma IP, el inicio de sesión responde `429` durante 15 minutos. Los identificadores de la ruta (`/empleados/:id`) deben ser enteros positivos: si no, `400`.

Los errores de validación responden `400` con `{ "errores": [...] }`; una cédula o un grado repetidos responden `409`.

---

## 🧮 Reglas de Cálculo

Todo lo que fija la ley está en la base de datos y se edita desde **Parámetros**: lo que cambia cada año (SBU y tabla del IR) y lo que cambia con el régimen (aportes, recargos, topes, vacaciones y beneficios). Los valores iniciales son estos.

| | Código del Trabajo | LOSEP |
|---|---|---|
| Aporte personal al IESS | 9,45 % | 11,45 % (confirmado en el cuadro del IESS) |
| Aporte patronal al IESS | 11,15 % | 9,15 % (confirmado en el cuadro del IESS) |
| Horas suplementarias | +50 %, referencia de 48 al mes (art. 55) | +25 %, hasta 60 al mes (art. 114) |
| Horas extraordinarias (24h00 a 06h00) | +100 % (art. 55) | +60 %, hasta 60 al mes (art. 114) |
| Sábado, domingo y feriado | +100 % | +100 % |
| Recargo nocturno | +25 % (art. 49) | +25 % (por confirmar: el art. 114 no lo menciona) |
| Vacaciones | 15 días (art. 69) | 30 días (art. 29) |
| Fondos de reserva | 8,33 % desde el mes 13 | 8,33 % desde el mes 13 |

La **LOEP** no tiene tasas propias: sus servidores de carrera se rigen por la LOSEP y sus obreros por el Código del Trabajo (LOEP arts. 17 a 19). Por eso, al elegirla, el empleado indica su categoría y el rol usa las reglas del régimen que corresponde.

| Concepto | Regla |
|---|---|
| Valor hora | sueldo ÷ 240 |
| Horas con recargo | hora × (1 + recargo del régimen); en las nocturnas solo se suma el recargo, porque la hora ya está en el sueldo |
| Ingreso aportable | sueldo + horas extras + comisiones: la base del IESS, del impuesto, del décimo tercero y de las vacaciones |
| Aporte personal IESS | tasa del régimen × ingreso aportable |
| Impuesto a la renta | `(aportable − IESS) × 12` → tabla SRI del año (exento hasta $12.208 en 2026) → menos la rebaja por gastos personales, si la hay → ÷ 12 |
| Décimo tercero | ingreso aportable ÷ 12 |
| Décimo cuarto | SBU ÷ 12 |
| Vacaciones (provisión) | ingreso aportable × días de vacaciones ÷ 360 (15 días = 1/24, art. 71) |
| Fondos de reserva | 8,33 % del aportable desde el mes 13 |
| Mes de ingreso y de salida | sueldo y décimo cuarto proporcionales a los días (base 30): desde el día de ingreso o hasta el día de salida, nunca menos de un día |
| Quién entra al rol de un mes | quien ingresó antes de que termine y no salió antes de que empiece; un inactivo sin fecha de salida queda fuera de todos |

### Rebaja por gastos personales
El empleado declara sus gastos del año (vivienda, educación, salud, alimentación, vestimenta y turismo). El sistema los guarda en su ficha, junto con el número de cargas familiares y si él o una carga tiene una enfermedad catastrófica, rara o huérfana. La rebaja es un crédito contra el impuesto anual, no una resta de la base:

`rebaja anual = 18 % × mínimo(gastos declarados, canasta básica × canastas)`

El impuesto anual sale de la tabla progresiva y la rebaja se le resta sin dejarlo por debajo de cero; el rol cobra la doceava parte del resultado. Las canastas que fijan el tope dependen de las cargas:

| Cargas familiares | 0 | 1 | 2 | 3 | 4 | 5 o más | Enfermedad catastrófica, rara o huérfana |
|---|---|---|---|---|---|---|---|
| Canastas del tope | 7 | 9 | 11 | 14 | 17 | 20 | 100 |

Con la canasta de enero de 2026 ($821,80), el tope sin cargas es $5.752,60 y la rebaja máxima $1.035,47 al año. La canasta se edita por año en **Parámetros**; con 0 no se aplica la rebaja y el rol avisa si había gastos declarados. Cada rol guarda una foto de los gastos, las cargas y la rebaja con que se calculó, y la reliquidación conserva los del rol original. El desglose «Cómo se calculó» muestra el paso de la rebaja.

### Préstamos del IESS
El IESS fija la cuota y el número de cuotas de cada préstamo quirografario, hipotecario o prendario, y el empleador la retiene en el rol. Se registran en **Préstamos** tal como vienen en el comprobante del IESS (cuota, número de cuotas y mes de la primera): el sistema no calcula interés. Una cuota se descuenta cada mes, desde el primero hasta completar las cuotas, y suma a los descuentos del rol:

`neto = ingresos − (IESS + impuesto a la renta + otros descuentos + préstamos del IESS)`

La cuota no cambia el ingreso aportable: no afecta el aporte al IESS, el impuesto a la renta ni el costo empleador. Un préstamo suspendido no se descuenta pero queda en el historial. Si los descuentos dejan el neto en negativo, el rol se genera igual y avisa. La pantalla de novedades anuncia la cuota que se descontará a cada empleado; no se digita, sale de los préstamos registrados. Cada rol guarda lo que descontó, así que eliminar o cambiar un préstamo no altera los roles ya generados, y una reliquidación conserva la cuota del rol original. Los préstamos de un empleado se van con él y salen en la exportación de la cuenta.

### Vacaciones gozadas
Los días se devengan en proporción al tiempo de servicio, con los meses de 30 días del rol:

`devengados = días de vacaciones al año del régimen × días de servicio ÷ 360`

Los días al año salen del régimen aplicado al empleado (15 en el Código del Trabajo, 30 en la LOSEP). El **saldo** es lo devengado menos los días de los periodos registrados. Un periodo cuenta días calendario, con el primero y el último incluidos (Código del Trabajo, art. 69: también cuentan los no laborables). No puede empezar antes del ingreso, terminar después de la salida, pasar de 366 días ni cruzarse con otro periodo de la misma persona. Si con un periodo nuevo la persona ya tomó más de lo que lleva devengado a esa fecha, se registra igual y la respuesta trae un aviso. Registrar vacaciones no cambia el rol: se pagan dentro del sueldo y la provisión de vacaciones sigue como estaba. Los periodos de un empleado se van con él y salen en la exportación de la cuenta.

### Liquidación por salida
Es lo que se le paga a quien se va **además de su último rol**. El sueldo del mes de salida no entra: ya lo paga ese rol, porque la fecha de salida prorratea el último mes. Cada rubro sale con su fórmula y los números de la persona.

| Rubro | Regla |
|---|---|
| Décimo tercero | Suma de lo que los roles dejaron provisionado desde el 1 de diciembre anterior. Quien lo cobra cada mes no tiene nada pendiente |
| Décimo cuarto | Solo si lo acumula: `SBU × días del periodo ÷ 360`. El periodo empieza el 1 de agosto (Sierra y Amazonía) o el 1 de marzo (Costa y Galápagos), o en el ingreso si fue después |
| Vacaciones no gozadas | `días de saldo × sueldo base ÷ 30`. Quien tomó más de lo devengado no paga la diferencia: se avisa |
| Bonificación por desahucio | `25 % × sueldo base × años de servicio` (Código del Trabajo, art. 185); la fracción de año cuenta en proporción |
| Indemnización por despido | `3 sueldos` hasta 3 años de servicio; desde ahí, `1 sueldo por año` (la fracción cuenta como año completo) con tope de 25 (art. 188) |

Lo que paga cada causa de salida:

| Causa | Bonificación (25 %) | Indemnización |
|---|---|---|
| Renuncia voluntaria | No | No |
| Terminación por acuerdo de las partes | Sí | No |
| Desahucio | Sí | No |
| Despido intempestivo | Sí | Sí |
| Visto bueno a favor del trabajador | Sí | Sí |
| Visto bueno a favor del empleador | No | No |
| Fin del plazo del contrato | No | No |

Los años de servicio se cuentan con meses de 30 días: `días de servicio ÷ 360`. Las indemnizaciones solo están programadas para el **Código del Trabajo** (incluido el obrero de la LOEP); a un servidor de la LOSEP se le liquida con «renuncia» o «fin del plazo del contrato», y el sistema rechaza las demás causas. Los fondos de reserva no entran: el que se acumula se deposita en el IESS y el que se paga cada mes ya está pagado. Las cuotas de préstamos del IESS que quedaban se **informan, no se descuentan**.

Antes de calcular conviene tener generados los roles desde diciembre: de ellos sale el décimo tercero provisionado, y el cálculo avisa de cada mes que falta. Registrar la liquidación marca al empleado como salido en esa fecha (`activo` en no, con su `fecha_salida`) y quita su responsabilidad de puesto, en una sola transacción, y deja constancia en la auditoría. Si el empleado ya tenía una salida registrada, la liquidación debe usar esa misma fecha. La liquidación guarda una foto de quién era y de cada rubro, así que sobrevive aunque luego se elimine al empleado; eliminarla permite rehacerla, pero no lo devuelve a la nómina.

### Vigencia de las reglas

Las reglas de cada régimen no se sobrescriben: cada una es una versión con su fecha `vigente_desde` (clave `cuenta_id`, `codigo`, `vigente_desde`). Las que existían antes de la migración 016 quedan como la versión más antigua, vigente desde `2000-01-01`.

| Situación | Qué pasa |
|---|---|
| Se genera el rol de un mes | Se usa la versión que regía el **último día de ese mes**. Una regla que empieza a mitad de mes cuenta para todo ese mes: no se prorratea por días. |
| Se edita un régimen con una fecha nueva | Se crea una versión copiando la que regía ese día y aplicando los cambios; las anteriores no se tocan. |
| Se edita con la fecha de una versión que ya existe | Esa versión se corrige. |
| Se edita sin fecha | Se corrige en el sitio la versión de hoy (la pantalla siempre envía una fecha, por defecto hoy). |
| La fecha es anterior a todas las versiones | Se usa la más antigua. |
| Se crea una empresa | Recibe todas las versiones de la plantilla. |

Cada alta, corrección y eliminación de una versión queda en `audit_logs` (`regimen.version_creada`, `regimen.corregido`, `regimen.version_eliminada`) con el régimen y la fecha. Un rol publicado o pagado no cambia nunca, ni aunque se edite una regla de su mes. Un rol «calculado» sí toma las reglas nuevas si se vuelve a generar.

Los parámetros anuales (SBU y tabla del IR) ya eran una versión por año, así que no cambian.

### Décimos y fondos: no, mensual o acumulado

Cada beneficio (décimo tercero, décimo cuarto y fondos de reserva) tiene tres modalidades por empleado:

- **Mensual** (lo que pasa si no se cambia nada, porque así lo dicen los arts. 111 y 113 del Código del Trabajo y 97 y 98 de la LOSEP): se paga dentro del rol y sube el neto. No suma al ingreso aportable: no paga IESS ni impuesto a la renta (Código del Trabajo arts. 112 y 114).
- **Acumulado**: el trabajador lo pidió por escrito; el empleador lo provisiona y aparece en el costo empleador.
- **No**: no lo recibe.

Si el empleado deja la opción en «según el régimen», vale lo que conceda su régimen. Lo mismo con las horas extras: quien no las recibe no las cobra, aunque se hayan digitado, y se avisa.

Las provisiones **no** afectan el neto. Costo empleador = ingresos + provisiones (acumulados, vacaciones y aporte patronal).

Todo el dinero se calcula con `decimal.js` y se redondea a centavos en cada rubro. Las multiplicaciones se hacen antes de las divisiones para que un empate exacto (por ejemplo `16273.2 ÷ 240 = 67.805`) redondee siempre hacia arriba.

### Escala salarial

Una escala por régimen. La de la LOSEP trae 22 grados, de $527 a $4.500, tomados de una fuente secundaria (ecu11.com) que dice «20 grados» pero lista 22 y no cita el acuerdo ministerial: está **por confirmar**. Si el régimen aplicado a un empleado tiene escala, el grado se **escoge obligatoriamente de la tabla** y el sueldo es la remuneración de ese grado: el formulario lo llena y no se escribe a mano, y la API rechaza un sueldo distinto. El cargo se propone con la denominación del grado y se puede cambiar. El **Código del Trabajo** trae 11 niveles ocupacionales (A jefatura; B1-B3 supervisión; C1-C3 operación; D1-D2 asistencia; E1-E2 soporte) cuya remuneración es un **mínimo**: el sueldo puede ser mayor, nunca menor, y se guarda también el tope del rango de mínimos entre ramas como referencia. Esa tabla salió de material de clase, sin acuerdo ministerial citado: está **por confirmar**. Los regímenes sin escala siguen con sueldo libre. Un grado solo puede asignarse a un empleado cuyo régimen aplicado use esa escala.

### Orgánico funcional

Antes de asignar un sueldo se identifica el **puesto**. Cada puesto dice de quién depende, qué **función** cumple, de qué **responde**, en qué **sector económico** está y qué **nivel de la escala salarial** le sirve de referencia. El orgánico de ejemplo es: gerente/propietario → administrador/contador → supervisor de instalaciones, operaciones de instalaciones y auxiliar de guardalmacén (nivel A, B1, B3, C2 y E2 de la tabla del Código del Trabajo). Se ve y se edita en **Orgánico**, que lo dibuja como un organigrama: un recuadro por puesto con el nombre de su responsable y su nivel salarial, unidos por líneas a su superior. Al tocar un recuadro se abre el detalle del puesto debajo.

Cada puesto puede tener un **responsable**: en el detalle del puesto, un select permite elegir entre los empleados activos que lo ocupan, y su nombre aparece en la ficha del puesto (`PATCH /api/puestos/:id/responsable`). Si ese empleado cambia de puesto, queda inactivo o se elimina, el puesto se queda sin responsable. El seed deja un responsable en cada puesto.

En el formulario del empleado, si el régimen aplicado tiene puestos, el puesto es obligatorio: al elegirlo se muestra su ficha, se preselecciona en un select el **nivel de la tabla que le toca** (con su mínimo y el tope del rango), se propone ese mínimo como sueldo y el nombre del puesto como cargo. El select solo ofrece los niveles de la misma letra que el del puesto (si el puesto es B3: B1, B2 y B3), y se puede cambiar por otro de ellos si al trabajador le toca uno distinto (se avisa que difiere del puesto), y la API rechaza un sueldo menor al mínimo del nivel. Los regímenes sin puestos (la LOSEP) siguen eligiendo directamente el grado. El **sector económico** de los puestos de ejemplo está en «Por definir» hasta saber la rama de la empresa, y los niveles asignados a cada puesto son una propuesta sobre una tabla de clase, por confirmar.

### Datos de ejemplo

El seed carga 12 empleados con la estructura del orgánico: Johan Gabriel Rodríguez (gerente), José Gabriel Manzano (administrador), David Barragán y Andrea Paola Villavicencio (supervisores de instalaciones), Maybeline Navarro, Santiago Andrés Cevallos y Karen Michelle Salazar (operaciones de instalaciones) y Pedro Pablo Guamán, Luis Fernando Tipán y Mayra Alejandra Chicaiza (auxiliares de guardalmacén), más Lucía Estefanía Mora (LOSEP) y Daniela Alejandra Ruiz (LOEP servidora) para mostrar los otros regímenes. Cada uno cobra al menos el mínimo del nivel de su puesto.

El seed también genera los roles de pago de **enero a septiembre de 2026**, dejando octubre para generarlo a mano. Los lleva por el ciclo como «sistema»: enero a agosto quedan **pagados** y septiembre **publicado**, para ver cada estado en la demostración. Los empleados aparecen en los roles desde su fecha de ingreso (Mayra desde marzo; Pedro, que ingresó el 16 de octubre, en ninguno). El personal de campo tiene horas extras y algún anticipo descontado, siempre los mismos valores para que la demostración sea repetible. Las cédulas son válidas pero inventadas.

### Conciliación con el IESS

El IESS no recibe un archivo de aportes: arma la planilla en su portal a partir de los avisos de entrada y salida y las novedades que declara el empleador, y el comprobante se puede descargar en Excel. Lo que sí se automatiza es el cálculo, y por eso cada rol trae un cuadro con la materia gravada y los aportes personal y patronal de cada empleado, más los fondos de reserva que se depositan en el IESS (los que el trabajador acumula) y los que ya se pagaron en el rol. Se descarga en CSV y sirve para contrastar, línea por línea, con el comprobante del portal. La materia gravada no incluye los décimos ni los fondos pagados en el rol.

---

## 🏢 Cuentas por Empresa

Cada empresa es una **cuenta** (`cuentas`: nombre y RUC) con sus **usuarios** (`usuarios`: correo único y hash `scrypt`). Cada cuenta nace con un usuario administrador, el que la registra; después puede agregar más (ver Roles de Usuario).

| Qué | Cómo se aísla |
|---|---|
| Empleados, roles, orgánico, escala, regímenes y parámetros anuales | Llevan `cuenta_id`; toda consulta lo filtra con la cuenta de la sesión |
| Novedades y detalle de los roles | Cuelgan de un empleado o de un rol, que ya son de la cuenta |
| Cédula, nombre del puesto, grado de la escala y mes del rol | Únicos **por cuenta**: dos empresas pueden tener la misma cédula o el mismo puesto |
| Referencias entre tablas (puesto o grado de un empleado, superior de un puesto) | Se validan contra la misma cuenta: no se puede apuntar a lo de otra empresa |
| Sesión | La cookie firmada lleva el usuario y su cuenta; no se puede cambiar sin invalidar la firma. El rol no va en la cookie: se lee de la base en cada petición |

**Plantilla de ley.** La cuenta con `plantilla = TRUE` (id 1) no es de ninguna empresa: guarda las reglas de partida (regímenes, parámetros anuales, escala y orgánico de ejemplo). Al registrarse una empresa, la función SQL `copiar_plantilla(cuenta)` le copia todo en la misma transacción, reenlazando por clave natural (régimen y grado; nombre del puesto). A partir de ahí, cada empresa edita lo suyo. La página de inicio pública (sin sesión) lee la plantilla.

**Datos de antes de las cuentas.** Si la base ya tenía empleados o roles, la migración 013 los pasa a una cuenta llamada «Empresa anterior», con su copia del orgánico y la escala, y **sin usuarios**. Para entrar a ella se agrega uno con `npm --prefix backend run usuario -- correo "contraseña" --cuenta 2` (el id lo da `--listar`). Con la base vacía no se crea ninguna: la primera nace al registrarse una empresa.

---

## 👥 Roles de Usuario

| Permiso | Administrador | Aprobador | Lector |
|---|:---:|:---:|:---:|
| Consultar todo (empleados, roles, boletas, CSV, historial) | sí | sí | sí |
| Cambiar datos: empleados, parámetros, regímenes, escala, orgánico, empresa | sí | no | no |
| Generar, recalcular y eliminar roles | sí | no | no |
| Validar, aprobar y publicar roles | sí | sí | no |
| Marcar un rol como pagado | sí | no | no |
| Gestionar usuarios y la separación de funciones | sí | no | no |

**Un solo lugar decide.** `backend/src/permisos.ts` dice qué permiso exige cada petición y un middleware lo aplica a toda la API. Lo que no se reconoce como lectura ni como paso del ciclo exige el permiso de cambiar datos, así que una ruta nueva nace cerrada para aprobador y lector. La interfaz esconde lo que el rol no puede hacer, pero quien manda es el servidor.

**Los cambios valen al instante.** La cookie solo dice quién es el usuario; su rol se lee de la base en cada petición. Cambiar el rol de alguien, o eliminarlo, tiene efecto en su próxima petición, sin esperar a que venza la sesión.

**Siempre queda un administrador.** No se puede degradar ni eliminar al último, y nadie se elimina a sí mismo. La comprobación bloquea la cuenta mientras cuenta, para que dos cambios a la vez no la dejen sin ninguno.

**Sin correo, el administrador define las contraseñas.** Al agregar un usuario se escribe su contraseña inicial y se le entrega; si la pierde, el administrador le pone una nueva. Las contraseñas nunca van a la auditoría. Desde la consola, `usuario -- correo "contraseña" --cuenta 2 --rol aprobador` crea un usuario con rol.

**Separación de funciones (opcional).** Si la cuenta la activa en **Usuarios**, quien generó un rol no puede aprobarlo ni publicarlo (`403`): lo debe hacer otra persona. Validar y pagar no se restringen. Exige al menos dos usuarios que puedan aprobar. Viene apagada.

---

## 🔄 Ciclo del Rol

```text
calculado --validar--> validado --aprobar--> aprobado --publicar--> publicado --pagar--> pagado
```

| Paso | Qué exige | Qué pasa |
|---|---|---|
| Generar | Nada | El rol nace «calculado». Recalcularlo lo reemplaza y lo deja otra vez «calculado», sin aprobación |
| Validar | «calculado» o «validado» | Revisa el rol con los datos de hoy. Pasa a «validado» solo si no hay errores bloqueantes |
| Aprobar | «validado» | Registra la aprobación |
| Publicar | «aprobado» y sin errores bloqueantes | Vuelve a revisar el rol, porque los datos pudieron cambiar desde que se validó. Desde aquí el rol es inmutable |
| Pagar | «publicado» | Registra que los pagos se ejecutaron |

**Errores bloqueantes:** el rol no tiene empleados; los parámetros de ley del año no existen y se usaron los de otro; alguien que debería estar en el período no está en el rol; un neto es negativo; la cabecera no cuadra con la suma del detalle. **Avisos** (no bloquean): un neto de $0 o ingresos mayores al doble del sueldo base.

**Inmutabilidad.** La API responde `409` si se intenta recalcular o eliminar un rol publicado o pagado, y la migración 014 lo refuerza en la base con disparadores: un rol publicado solo admite pasar a «pagado», y su detalle no se modifica. Cada paso es un `UPDATE` condicionado al estado anterior, así que si dos personas publican a la vez, solo una lo logra y la otra recibe `409`.

**Probado en Postgres real.** La migración 014 y los disparadores se comprobaron también contra PostgreSQL 17 (no solo PGlite): el ciclo del seed corre completo y la base rechaza modificar un rol publicado o el registro de auditoría.

**Auditoría.** `audit_logs` guarda la cuenta, el usuario (con su correo), la acción, el rol y un detalle en JSON. Un disparador impide modificar o borrar sus filas. Los roles del seed quedan registrados como hechos por «sistema».

**Roles que ya existían.** La migración 014 los deja en «calculado»: siguen siendo editables hasta que se validen, aprueben y publiquen.

---

## 🔁 Reliquidación

Un rol publicado o pagado no se toca nunca. Si después se descubre un error (comisiones olvidadas, horas mal digitadas, una regla corregida), se crea un **ajuste**: un rol aparte, vinculado al original, cuyo detalle guarda solo la **diferencia**. Sumar el rol original y sus ajustes publicados da lo que realmente corresponde al mes.

| Concepto | Cómo funciona |
|---|---|
| Quién puede | Solo el administrador (`POST /api/roles/:id/reliquidar`). El ajuste recorre después el mismo ciclo: se valida, aprueba, publica y marca como pagado, con la misma auditoría y la separación de funciones si está activada |
| Qué se recalcula | El mes completo con las reglas de ley que regían al cierre de ese mes (ver Vigencia de las reglas) y los datos que cada empleado tenía en el rol: sueldo, fecha de ingreso, régimen y cómo recibe los beneficios. Solo cambia lo que se pide en `cambios` |
| Qué guarda | Por cada empleado cuyo resultado cambia, la diferencia en dinero y horas (ingresos, aporte IESS, impuesto, descuentos, neto, provisiones, costo). Lo demás (días trabajados, tasas, modalidades) lleva su valor nuevo. Los empleados que no cambian no aparecen |
| Valores negativos | Un ajuste puede dar un neto negativo: es un descuento. La validación del ajuste lo acepta |
| Varios ajustes | Cada uno parte de lo ya publicado (rol original más ajustes publicados). Solo puede haber un ajuste sin publicar por rol; eliminarlo libera el lugar. Un ajuste no se reliquida: se reliquida el rol del mes |
| Sin cambios | Si nada varía, responde `400`. Si se corrigió una regla de ese mes, basta enviar `cambios` vacío: el ajuste recoge la diferencia |
| En la pantalla | El rol publicado muestra «Ajustes de este rol», con su lista, el total del mes y el botón **Reliquidar este rol**. El ajuste lleva un aviso con el motivo y un enlace al original. En **Roles de pago** el ajuste sale en el historial; el calendario sigue llevando al rol del mes |

**Garantías en la base (migración 017).** `roles_cabecera` gana `tipo` (`ordinario` o `ajuste`), `rol_origen_id` y `motivo`. Hay un solo rol ordinario por mes y empresa, y un solo ajuste sin publicar por rol. Un disparador impide crear un ajuste de un rol que no sea ordinario, publicado o pagado, del mismo mes y la misma empresa. La auditoría registra `rol.ajuste_creado` en el original y el motivo en el ajuste.

**Probado en Postgres real.** La migración 017 se aplicó sobre una base PostgreSQL 17 con un rol anterior (queda como ordinario) y se comprobaron el ajuste, el segundo ajuste rechazado y el disparador.

---

## 🔍 Cómo se calculó

Cada valor del rol puede explicarse: de dónde salió, con qué fórmula y con qué números. Al calcular, el motor (`calcularRolConTraza`) devuelve el resultado y, junto a él, una lista de pasos; el rol guarda esa lista por empleado.

| Concepto | Cómo funciona |
|---|---|
| Qué guarda | `roles_detalle.traza`: un contexto (régimen, versión de reglas «vigentes desde», año de los parámetros y SBU) y los pasos. Cada paso lleva concepto, fórmula, detalle con los números, resultado y, si aplica, la fuente (por ejemplo «Código del Trabajo art. 71») |
| Coherencia | El resultado de cada paso es el mismo valor que se guardó en el rol; una prueba lo comprueba para varios regímenes y modalidades. Las horas, comisiones y otros descuentos solo aparecen si valen más que cero |
| Rol publicado | La traza se guarda al calcular, así que no cambia si después se edita una regla |
| Ajuste | Explica el cálculo completo del mes con los cambios, no la diferencia que guarda el ajuste |
| En la pantalla | En el detalle del rol, cada empleado tiene **Cómo se calculó**: una tabla con concepto, cómo se calcula, sus números y el resultado. No se imprime |

**Roles anteriores.** Los roles calculados antes de la migración 018 no tienen desglose: el botón no aparece y el endpoint responde `404`. Se vuelve a calcular el mes (si aún no está publicado) para obtenerlo.

---

## ✉️ Recuperar la contraseña y verificar el correo

| Concepto | Cómo funciona |
|---|---|
| Correos | Salen por SMTP (`nodemailer`), que ofrecen todos los proveedores: no hay uno obligatorio. Sin `CORREO_SMTP_URL`, el mensaje se escribe en la consola del servidor, útil para trabajar en local |
| Enlaces | Un token aleatorio de 256 bits en la dirección. La base guarda solo su hash (SHA-256), así que quien lea la tabla `tokens_usuario` no puede usarlos. Cada token sirve una vez; pedir otro anula el anterior |
| Vigencia | Recuperar la contraseña: 1 hora. Verificar el correo: 48 horas |
| Recuperar | Pantalla `/recuperar` pide el correo; `/restablecer?token=…` elige la contraseña nueva. Quien recibe el correo es dueño del buzón, así que su correo también queda verificado. La auditoría registra `usuario.clave_restablecida` |
| Sin revelar cuentas | `POST /api/auth/recuperar` responde igual exista o no el correo, y solo manda mensaje si existe |
| Verificar | Al registrarse sale el correo de verificación. `/verificar?token=…` lo confirma al abrirlo. Mientras no esté verificado, el sistema muestra un aviso con el botón para reenviar el enlace; verificar no bloquea ninguna función |
| Si el correo falla | Registrarse y pedir la recuperación responden igual y dejan el error en el registro del servidor |

**Probado.** Las pruebas cubren el uso único del token (incluso con dos peticiones a la vez), el vencimiento, que un token de verificación no sirva para cambiar la contraseña, el límite de solicitudes y que la base no guarde el token. Las pruebas del envío real por SMTP no existen: se comprobó con un transporte de prueba.

---

## 📦 Exportar y eliminar la cuenta

| Concepto | Cómo funciona |
|---|---|
| Quién puede | Solo el administrador, desde **Cuenta** (`/sistema/cuenta`). El servidor lo exige: un aprobador o un lector reciben `403` |
| Exportar | Un archivo `rol-pagos-<RUC>-<fecha>.json` con la empresa, usuarios (correo, rol y fecha de verificación; **sin contraseñas ni tokens**), empleados, novedades, reglas de ley, escala, orgánico, roles con su detalle y su desglose, y la auditoría |
| Eliminar | Borra la cuenta y todo lo suyo, también los roles publicados y pagados y la auditoría. No se puede deshacer. Pide escribir el RUC de la empresa y la contraseña de quien la elimina; con cinco intentos fallidos, `429` |
| Después | La sesión deja de valer, y el correo y el RUC quedan libres para registrarse de nuevo. Las demás empresas y la plantilla de ley no se tocan; la plantilla no se puede eliminar |
| Auditoría | Es de solo inserción (migración 014). La migración 020 deja borrarla solo dentro de la transacción que elimina esa cuenta, marcada con `rolpagos.eliminando_cuenta`; borrar o modificar sus filas de cualquier otra forma sigue rechazado |

**Probado en Postgres real.** Con PostgreSQL 17 se cargaron dos empresas de ejemplo con nueve roles publicados cada una; se exportó una, se eliminó, y la otra y la plantilla quedaron intactas. El borrado directo de la auditoría siguió rechazado antes y después. Esa misma prueba aplicó también la migración 019.

---

## 🗄️ Migraciones

El esquema vive en `backend/src/migraciones/NNN_nombre.sql`. Las aplicadas quedan en la tabla `esquema_migraciones`, así que abrir la misma base dos veces no repite nada; cada una corre en una transacción con un candado, para que dos instancias que arrancan a la vez no la apliquen dos veces. Para cambiar el esquema se agrega el siguiente archivo numerado; no se edita uno ya aplicado.

| Migración | Qué agrega |
|---|---|
| 001 | Empleados, novedades, roles y detalle |
| 002 | Parámetros anuales (SBU y tabla del IR) |
| 003 | Horas extras por tipo |
| 004 | Regímenes laborales |
| 005 | Escala salarial |
| 006 | Opciones por empleado y modalidad de cada beneficio en el rol |
| 007 | Escala salarial del sector privado (niveles con sueldo mínimo) |
| 008 | Orgánico funcional: puestos y su nivel de referencia |
| 009 | Responsable de cada puesto |
| 010 | Fecha de salida del empleado |
| 011 | Dinero, tasas y horas en columnas `NUMERIC` (decimal exacto) en lugar de coma flotante |
| 012 | Notas del régimen LOSEP: aporte IESS confirmado, recargo nocturno por confirmar |
| 013 | Cuentas y usuarios; `cuenta_id` en empleados, roles, regímenes, parámetros, escala y puestos; los únicos (cédula, nombre del puesto, grado, mes del rol) pasan a ser por cuenta; la función `copiar_plantilla` |
| 014 | Estado del rol (`calculado` a `pagado`) con sus fechas; tabla `audit_logs` de solo inserción; disparadores que protegen los roles publicados |
| 015 | Rol de cada usuario (`administrador`, `aprobador`, `lector`; los existentes quedan administradores), `separar_funciones` en la cuenta y `generado_por` en cada rol |
| 016 | Vigencia de las reglas: `regimenes.vigente_desde` (clave `cuenta_id`, `codigo`, `vigente_desde`; las filas existentes quedan desde `2000-01-01`) y `copiar_plantilla` copia todas las versiones |
| 017 | Reliquidación: `tipo`, `rol_origen_id` y `motivo` en el rol; un solo rol ordinario por mes y un solo ajuste sin publicar por rol; disparador que valida el origen del ajuste |
| 018 | Desglose del cálculo: `roles_detalle.traza` (JSON, vacío en los roles anteriores) |
| 019 | Recuperar la contraseña y verificar el correo: `usuarios.email_verificado_en` y la tabla `tokens_usuario` (guarda el hash del token) |
| 020 | Eliminar una cuenta: el disparador de la auditoría deja borrar sus filas solo dentro de la transacción que elimina esa cuenta |
| 021 | Gastos personales: `parametros_anuales.canasta_basica`; `gastos_personales`, `cargas_familiares` y `enfermedad_catastrofica` en el empleado; la foto de esos datos y `rebaja_ir_anual` en el detalle del rol; `copiar_plantilla` copia la canasta |
| 022 | Préstamos del IESS: tabla `prestamos_iess` (por empleado y cuenta) y `descuento_prestamos` en el detalle del rol |
| 023 | Vacaciones gozadas: tabla `vacaciones_gozadas` (periodo con sus días, por empleado y cuenta) |
| 024 | Liquidaciones por salida: tabla `liquidaciones` (una por empleado, con los rubros en JSON y la foto del empleado) |

Los roles ya generados guardan una foto del régimen, de las tasas y de la modalidad con que se calcularon: si luego se editan las reglas, el historial no cambia.

---

## 🎨 Diseño

Cuatro colores con significado fijo en toda la app: azul para ingresos, ladrillo para descuentos, verde para el neto y ámbar para provisiones. La landing, el rol y las boletas los repiten, así que el recorrido se lee igual en cada pantalla. Lo que está por confirmar se marca en ámbar.

Las tipografías (Bricolage Grotesque y Figtree) van incluidas en `frontend/public/fonts`; la aplicación funciona sin internet.

---

## ⚠️ Lo que Queda por Confirmar

| Dato | Por qué | Qué hace el sistema |
|---|---|---|
| Aporte al IESS de los servidores públicos | El cuadro «Tasas de aportación» del IESS lo confirma (11,45 % personal y 9,15 % patronal), pero es un documento antiguo y la Resolución CD 501 es un escaneo que no se pudo leer; un sitio comercial publica otras cifras | Usa 11,45 % y 9,15 % para la LOSEP; revisa la resolución vigente; se edita en Parámetros |
| Escala salarial del sector público | No se encontró la escala oficial vigente de 20 grados | Carga una escala de ejemplo editable |
| Recargo nocturno de la LOSEP | El art. 114 no lo menciona y no se encontró otra norma que lo fije para servidores públicos | Asume el 25 % del Código del Trabajo (art. 49); editable |
| Reformas de la LOSEP posteriores a 2016 | La copia leída es de 2016 | Revisa el texto vigente antes de usarlo en una nómina real |
| Base legal de la rebaja por gastos personales | No se encontró el artículo ni la resolución del SRI que la fundamentan; las cifras (18 %, canastas por cargas) salen de notas de prensa y blogs | Aplica las reglas de la sección «Rebaja por gastos personales»; la canasta se edita en Parámetros |
| Discapacidad en los gastos personales | Las fuentes no coinciden en si la discapacidad del empleado o de una carga sube el tope a 100 canastas | Solo la enfermedad catastrófica, rara o huérfana lleva el tope a 100 canastas |
| Cálculo mensual del impuesto con rebaja | El SRI proyecta el año y reparte la retención en cuotas; no se pudo leer la fórmula | Resta la rebaja al impuesto anual proyectado (×12) y divide entre 12 |
| Alcance de los gastos de arte, cultura y turismo | Las notas de prensa los mencionan sin precisar topes ni condiciones | No distingue categorías: el empleado declara un solo total |
| Texto oficial de la liquidación | Ninguna fuente leída es el Código del Trabajo: no se pudo leer el texto de los arts. 169, 184, 185 ni 188, solo resúmenes y un artículo que cita el 185 | Aplica el 25 % por año del art. 185 y la indemnización de 3 sueldos o 1 por año con tope de 25 del art. 188 |
| Desahucio en la renuncia | Un portal dice que la renuncia da la bonificación del art. 185, otro que no. La Corte Nacional (Resolución 03-2025) dijo que el retiro voluntario no la da, y una jueza de esa Corte aclaró que solo vale para el sector público y que en el privado la renuncia aceptada es un acuerdo entre las partes. El Ministerio del Trabajo demandó esa resolución en abril de 2025 y no se encontró cómo terminó | La renuncia no paga bonificación; si el empleador la acepta como acuerdo, se elige «acuerdo de las partes», que sí la paga |
| Región del décimo cuarto | Las fuentes coinciden en Sierra (agosto a julio) y Costa (marzo a febrero), pero una pone la Amazonía y Galápagos en el otro grupo | La región se elige al calcular; Sierra incluye la Amazonía y Costa, Galápagos |
| Fracción de año y base de la bonificación y la indemnización | Las fuentes dicen «remuneración» sin precisar, y no dicen si la fracción del art. 185 cuenta completa o proporcional | Usa el sueldo base; la fracción cuenta en proporción para el 185 y como año completo para el 188 |
| Liquidación del sector público | No se encontró la norma de supresión de puestos ni de compra de renuncias de la LOSEP | No se calculan: solo se liquidan los rubros comunes |
| Formato de carga masiva del IESS | No se encontró un formato público de archivo | Entrega un cuadro de conciliación, no un archivo de carga |

Verifica todas las cifras con la norma y con el IESS antes de usar el sistema en una nómina real.

### Simplificaciones declaradas

- Los usuarios se agregan sin invitación por correo: el administrador define la contraseña inicial. La separación de funciones viene apagada, así que por defecto la misma persona puede generar, aprobar y publicar un rol; cada paso queda registrado con su correo.
- La reliquidación corrige a los empleados que estaban en el rol: no agrega a quien se omitió por completo, y usa su fecha de salida y si recibe horas extras tal como están hoy. El ajuste no altera la planilla del IESS ya presentada: sus aportes salen como diferencias en su propio archivo.
- El límite de intentos de contraseña y de registros vive en memoria: en Vercel cada instancia lleva su propia cuenta, así que frena el abuso pero no lo impide.
- Cambiar la contraseña por el enlace del correo no cierra las sesiones que ya estaban abiertas: son cookies firmadas sin registro en el servidor y valen hasta que vencen (8 horas). Verificar el correo no bloquea nada: solo informa.
- `POST /api/auth/recuperar` no tarda lo mismo si el correo existe (manda un mensaje) que si no: el tiempo de respuesta podría delatar qué correos tienen cuenta.
- El administrador sigue definiendo la contraseña inicial de los usuarios que agrega. Con la sesión abierta, una persona no cambia su propia contraseña: lo hace el administrador desde **Usuarios**, o ella misma con «¿Olvidaste tu contraseña?».
- El RUC se valida por su forma y su dígito verificador, no contra el SRI: cualquiera puede registrar un RUC que no es suyo.
- Las sesiones no se guardan en el servidor: una sesión firmada vale hasta que vence (8 horas) o se cambia `SESION_SECRETO`; no hay forma de cerrarla desde otro lado.
- Eliminar una cuenta no deja ningún rastro, ni siquiera de que existió: la auditoría se va con ella. Quien necesite conservar un comprobante debe descargar el archivo antes. Las copias de seguridad de la base (por ejemplo las de Supabase) siguen teniendo los datos hasta que ellas mismas vencen.
- La exportación es un archivo JSON con los nombres de las tablas; no hay un formato para volver a importarlo.
- Los gastos personales los declara el empleado una sola vez en su ficha y valen para todos los meses: el sistema no revisa facturas, no controla topes por categoría y no distingue la proyección de febrero de sus actualizaciones. El impuesto mensual sigue proyectando el año (×12) y dividiendo entre 12, sin las cuotas de febrero a diciembre del SRI.
- La liquidación no calcula el aporte al IESS ni el impuesto sobre lo que paga, no cubre la jubilación patronal ni los casos del sector público, y no genera el acta de finiquito que se firma ante el Ministerio del Trabajo. El décimo cuarto usa el SBU del año de la salida aunque el periodo cruce dos años. La base de las indemnizaciones es el sueldo base, sin horas extras ni comisiones.
- Las vacaciones no suman los días adicionales por antigüedad (un día más por año después del quinto, en el Código del Trabajo), no limitan cuántos periodos se pueden acumular ni pagan en dinero los días no gozados. Los días al año son los del régimen de hoy, no los de cada año trabajado.
- Los préstamos del IESS se registran con la cuota que dice el IESS: el sistema no calcula interés ni tabla de amortización, no revisa que el IESS haya aprobado el préstamo y no descuenta las cuotas pendientes cuando el empleado sale. Tampoco limita la cuota a un porcentaje del sueldo.
- Una regla que cambia a mitad de mes se aplica a todo ese mes, sin prorratear por días. Los parámetros anuales (SBU e IR) tienen una versión por año, no por fecha.
- Los topes de horas extras avisan pero no bloquean: la LOSEP dice que si se obliga a trabajar sobre el límite, igual se pagan.
- Los puestos del nivel jerárquico superior de la LOSEP no cobran horas extras: se marca «No las recibe» en ese empleado. No se incluye la escala oficial de ese nivel.

---

## 🗺️ Roadmap de Funcionalidades

- [x] Motor de cálculo con funciones puras y aritmética decimal exacta.
- [x] Tres regímenes laborales con reglas editables en pantalla (Código del Trabajo, LOSEP y LOEP).
- [x] SBU y tabla del impuesto a la renta por año.
- [x] Reglas de cada régimen con vigencia por fecha: un cambio crea una versión y los meses anteriores conservan la suya.
- [x] Escala salarial por régimen y orgánico funcional con responsable por puesto.
- [x] Décimos y fondos de reserva: no, mensual o acumulado, por empleado.
- [x] Horas extras por tipo, con recargo y tope por régimen.
- [x] Conciliación con el IESS, boleta imprimible y CSV.
- [x] Migraciones versionadas y base PostgreSQL en Supabase.
- [x] Despliegue en Vercel.
- [x] Cuentas por empresa: registro, inicio de sesión con correo y datos aislados por cuenta.
- [x] Fecha de salida del empleado y roles de meses pasados que respetan quién estaba en nómina.
- [x] Dinero exacto también en la base de datos (`NUMERIC`).
- [x] Ciclo del rol (calculado, validado, aprobado, publicado, pagado), roles publicados inmutables y auditoría de cada paso.
- [x] Varios usuarios por empresa con roles (administrador, aprobador, lector), permisos exigidos por el servidor y separación de funciones opcional.
- [x] Reliquidación de un rol publicado con un ajuste vinculado al original, que guarda solo la diferencia y recorre el mismo ciclo.
- [x] Desglose del cálculo: de dónde salió cada valor del rol, con su fórmula, sus números y su fuente.
- [x] Recuperar la contraseña y verificar el correo, por SMTP y con enlaces de un solo uso.
- [x] Exportar y eliminar una cuenta completa, con confirmación por RUC y contraseña.
- [x] Gastos personales: rebaja del impuesto a la renta con tope por cargas familiares y canasta básica.
- [x] Préstamos del IESS: cuota mensual descontada en el rol, con su pantalla y su historial.
- [x] Vacaciones gozadas: periodos registrados y saldo de días por empleado.
- [x] Liquidaciones por salida: rubros por causa, revisión antes de registrar y salida del empleado.
- [ ] Confirmar con las normas vigentes los datos marcados «por confirmar».

---

## 👥 Contribuidores

Lista de contribuidores que han aportado commits al desarrollo de este repositorio:

| Nombre | Commits |
| :--- | :--- |
| **kiramman-mp3** | 263 |
| **Johan Rodríguez** | 30 |

---

## 📚 Fuentes

Esta lista es la misma que muestra la página de información del sistema (`/informacion`) y sale de `frontend/src/app/core/fuentes.ts`. Son 56 enlaces. Las 11 marcadas como **leída** se abrieron y se leyeron; de las demás solo se tomó el dato que indica cada una, a partir de los resultados de una búsqueda. Los textos legales pesan más que los blogs: cuando discrepan, mandan las normas.

<details>
<summary><b>Ver las fuentes por tema</b></summary>

#### Normas leídas en su texto

La base de las reglas de cada régimen. Son las fuentes de mayor peso.

- [Ley Orgánica de Servicio Público (LOSEP), texto del Registro Oficial Suplemento 294](https://www.oas.org/juridico/pdfs/mesicic5_ecu_ane_mdt_4.3_ley_org_ser_p%C3%BAb.pdf) **(leída)**: Arts. 25, 29, 97, 98, 99, 101 y 114: jornada, 30 días de vacaciones, décimos, fondos de reserva y recargos de horas extras. La copia es de 2016: no se verificaron reformas posteriores.
- [Código del Trabajo, versión del 12 de marzo de 2026 (Legalcloud)](https://legalcloud.ec/wp-content/uploads/2026/04/Codigo-del-Trabajo-CT-12-03-2026-Normativa-Ecuatoriana.pdf) **(leída)**: Arts. 47, 49, 55, 69, 71, 111 a 114 y 196: jornada, recargos, vacaciones, décimos mensuales por defecto y fondos de reserva.
- [Ley Orgánica de Empresas Públicas (LOEP), copia del Ministerio de Telecomunicaciones](https://www.telecomunicaciones.gob.ec/wp-content/uploads/2017/05/LEY-ORGANICA-DE-EMPRESAS-PUBLICAS.pdf) **(leída)**: Arts. 17, 18 y 19: servidores de libre designación, servidores de carrera y obreros; el Directorio fija vacaciones y remuneraciones.

#### Páginas oficiales

Del IESS y del Ministerio del Trabajo.

- [IESS: servicios del afiliado](https://www.iess.gob.ec/en/web/afiliado/servicios-y-prestaciones) **(leída)**: Aporte personal de 9,45 % y patronal de 11,15 % (régimen general). No publica una tabla para el sector público.
- [Ministerio del Trabajo: Acuerdo MDT-2024-039](https://trabajo.gob.ec/wp-content/uploads/2024/04/AM-MDT-2024-039.pdf): Escala oficial del nivel jerárquico superior: 10 grados, de $2.115 a $5.072. Se vio en los resultados de búsqueda; el sistema no la carga.
- [Ministerio del Trabajo: Código del Trabajo (PDF)](https://www.trabajo.gob.ec/wp-content/uploads/downloads/2024/01/CODIGO_DEL_TRABAJO.pdf): Confirmación del art. 49 (jornada nocturna, de 19h00 a 06h00, con 25 % de recargo).

#### Sueldo básico unificado 2026 ($482)

Fijado por el Acuerdo Ministerial MDT-2025-195. Todas son secundarias; no se leyó el acuerdo.

- [El Diario: el SBU será de 482 dólares para 2026](https://www.eldiario.ec/centro/el-salario-basico-unificado-de-ecuador-sera-de-482-dolares-para-2026-el-aumento-es-de-12-dolares-20251215/): Monto de $482 y aumento de $12 sobre 2025.
- [Tagline: sueldo básico Ecuador 2026](https://tagline-soluciones.com/blog/talento-humano/salario-basico-unificado/): Número del acuerdo ministerial y fecha de publicación.
- [Buró Tributario: Ecuador fija el SBU para 2026 en $482](https://burotributario.com.ec/ecuador-fija-el-salario-basico-unificado-para-2026-en-482/): Vigencia desde el 1 de enero de 2026.
- [Lexis: ajuste de los salarios mínimos sectoriales](https://www.lexis.com.ec/noticias/ecuador-ajusta-salarios-minimos): Ningún salario sectorial puede quedar por debajo del SBU.
- [Cámara de la Construcción de Quito: Boletín Jurídico de enero de 2026](https://ccq.ec/wp-content/uploads/2026/04/Boletin-Juridico-Enero-2026.pdf): Fijación del SBU del trabajador en general.
- [Xinhua: Ecuador fija en 482 dólares el salario mínimo mensual para 2026](http://spanish.xinhuanet.com/20251216/239f5b62ef6c433992ed771faf363c9a/c.html): Confirmación del monto.

#### Tabla del impuesto a la renta 2026

Fracción básica desgravada de $12.208 y diez tramos, del 0 % al 37 %. Resolución NAC-DGERCGC25-00000043 del SRI (Andersen la cita como NAC-DGERCGC25-43).

- [Andersen: resoluciones del SRI de diciembre de 2025](https://ec.andersen.com/wp-content/uploads/2026/01/TIPS-1-Resoluciones-SRI-diciembre-2025-1.pdf): La resolución actualizó los rangos y se mantienen las tarifas.
- [Factuplan: tabla del impuesto a la renta 2026](https://factuplan.com.ec/blog/tabla-impuesto-a-la-renta-2026-ecuador): Los diez tramos con su cuota y su porcentaje.
- [Ecuador Legal Online: tabla de impuesto a la renta 2026](https://www.ecuadorlegalonline.com/sri/tabla-de-impuesto-a-la-renta/): Apareció al buscar la tabla; no se abrió.
- [Ciro: tablas del impuesto a la renta 2026](https://ciro.com.ec/blog/tablas-impuesto-renta-2026/): Publica los mismos valores de la tabla.
- [Dergest: tablas de retenciones de IVA e IR 2026](https://dergest.com/blog/tablas-retenciones-ecuador-2026.html): Publica los mismos valores de la tabla.
- [UQA: actualizaciones del SRI para el ejercicio fiscal 2026](https://uqa.com.ec/tablas-del-impuesto-a-la-renta-conoce-las-actualizaciones-del-sri-para-el-ejercicio-fiscal-2026/): Apareció al buscar la tabla; no se abrió.
- [JEZL Auditores: tabla del IR 2026 y 2025](https://www.jezl-auditores.com/index.php/tributario/101-tabla-de-impuesto-a-la-renta-ir-2026-2025-personas-naturales-ecuador): Apareció al buscar la tabla; no se abrió.
- [Tagline: impuesto a la renta en Ecuador 2025-2026](https://tagline-soluciones.com/blog/talento-humano/impuesto-a-la-renta-ecuador/): Equivalencia mensual: no paga quien gana menos de $1.017,33 al mes.

#### Rebaja por gastos personales (por confirmar)

Rebaja del 18 % de los gastos personales, con tope por canastas básicas según las cargas familiares (canasta de enero de 2026: $821,80). No se encontró el artículo ni la resolución que la fundamentan.

- [Primicias: guía para pagar el impuesto a la renta 2026, gastos personales y cargas familiares](https://www.primicias.ec/economia/guia-pago-impuesto-renta-2026-gastos-personales-cargas-familiares-contribuyentes-sri-113193/) **(leída)**: Tasa del 18 % y topes en canastas según las cargas familiares.
- [Primicias: tabla de descuento por gastos personales y canastas básicas](https://www.primicias.ec/economia/tabla-decuento-gastos-personales-impuesto-renta-canastas-basicas-sri-115251/) **(leída)**: Canasta de $821,80 y el tope de cada número de cargas.
- [Siigo: gastos personales en Ecuador](https://www.siigo.com/ec/blog/obligaciones-fiscales/gastos-personales-ecuador/) **(leída)**: Categorías de gastos y enfermedades catastróficas (100 canastas).
- [Bloomberg Línea: cómo aplicar la rebaja por gastos personales en 2026](https://www.bloomberglinea.com/latinoamerica/ecuador/paso-a-paso-como-aplicar-la-rebaja-del-impuesto-a-la-renta-por-gastos-personales-en-2026/) **(leída)**: Paso a paso de la rebaja. Sus cifras son las del ejercicio 2025; no se usaron para 2026.
- [Primicias: formulario de proyección de gastos personales del SRI](https://www.primicias.ec/economia/sri-formulario-proyeccion-gastos-personales-impuesto-renta-descarga-115519/): Apareció al buscar el formulario de proyección; no se abrió.
- [Primicias: el SRI abre el formulario de gastos personales en junio](https://www.primicias.ec/economia/sri-gastos-personales-formulario-junio-pago-impuesto-renta-ecuador-124214/): Apareció al buscar la actualización de la proyección; no se abrió.
- [El Diario: gastos personales y deducciones del SRI en 2026](https://www.eldiario.ec/centro/gastos-personales-sri-deducciones-2026-06022026/): Apareció al buscar las deducciones; no se abrió.
- [El Diario: cómo aprovechar los gastos personales para reducir el pago del impuesto](https://www.eldiario.ec/centro/impuesto-a-la-renta-como-aprovechar-los-gastos-personales-para-reducir-el-pago-08022026/): Apareció al buscar las deducciones; no se abrió.
- [Vistazo: el SRI habilita el formulario de proyección de gastos personales](https://www.vistazo.com/actualidad/nacional/2026-02-06-sri-formulario-proyeccion-gastos-personales-reducir-impuesto-renta-IA10670833): Apareció al buscar el formulario de proyección; no se abrió.

#### Aporte al IESS del sector público (por confirmar)

Las fuentes se contradicen: unas dan 11,45 % personal y 9,15 % patronal para los servidores públicos; otras, 9,45 % y 11,15 %. Varias atribuyen el 11,45 % a la Disposición Transitoria 16 de la Ley de Seguridad Social y a la Resolución CD 501 del IESS, pero no se pudo leer ninguna de las dos. El sistema usa 11,45 % y 9,15 % para la LOSEP y lo deja editable.

- [El Telégrafo: los porcentajes de aportación de servidores públicos cambiarán en 2016](https://www.eltelegrafo.com.ec/noticias/politica/1/los-porcentajes-de-aportacion-al-iess-de-servidores-publicos-cambiaran-en-2016) **(leída)**: Antes 11,45 % y 9,15 %; se anunció pasar a 9,45 % y 11,15 %. No cita la norma.
- [El Universo: desde 2016 se homologarán los aportes del sector público y privado](https://www.eluniverso.com/noticias/2015/02/28/nota/4602491/2016-se-homologaran-aportes-sector-publico-privado-iess/): El mismo anuncio. No hay evidencia de que se aplicara.
- [Trámites Básicos: porcentajes de aportes al IESS del sector público y privado](https://www.tramitesbasicos.com/cuanto-es-el-aporte-al-iess/): Apareció al buscar los porcentajes del sector público y del privado; se usó como contraste.
- [Gactiva: aportes IESS](https://gactiva.com/2023/03/18/aportes-iess/): Tabla con 11,45 % de aporte personal para los servidores públicos.
- [Ecuadorec: porcentaje de aportación al IESS](https://ecuadorec.com/porcentaje-aportacion-iess-personal-patronal/): Contradice a las demás: da 9,45 % personal para el sector público general.
- [Primicias: afiliados del IESS podrán ver sus aportes](https://www.primicias.ec/noticias/economia/afiliados-iess-podran-ver-aportes/): Apareció al buscar el aporte de los servidores públicos; no se confirmó el dato en su texto.
- [Tagline: aporte patronal al IESS 2026](https://tagline-soluciones.com/blog/talento-humano/aportacion-iess-empleador-ecuador/): Aporte patronal general de 11,15 %.
- [Seguridad social del IESS (presentación de la Superintendencia de Bancos)](http://www.cesantiadac.fin.ec/superintendencia-de-bancos/img/5_SEGURIDAD_SOCIAL_IESS.PDF): Cuadro con servidores del sector público: 11,45 %, 9,15 % y 20,60 %.

#### Horas extras en el sector público

Contraste de los recargos y topes del art. 114 de la LOSEP.

- [Universidad Estatal de Milagro: instructivo de pago de horas suplementarias y extraordinarias](https://www.unemi.edu.ec/wp-content/uploads/2018/04/instructivo_pago_horas_suplementarias_extraordinarias.pdf): Cita el art. 114 de la LOSEP: horas adicionales con autorización y disponibilidad presupuestaria.
- [Acuerdo 0025-15: reglamento interno para el pago de horas suplementarias y extraordinarias](https://www.oficial.ec/acuerdo-0025-15-expidese-reglamento-interno-pago-horas-suplementarias-extraordinarias-servidores): Reglamento de una institución pública para el pago de horas extras de servidores y trabajadores.
- [Tagline: cálculo de horas extras en Ecuador 2026](https://tagline-soluciones.com/blog/talento-humano/calculo-de-horas-extras-ecuador/): Recargos del Código del Trabajo (50 % y 100 %).
- [Tagline: jornada laboral en Ecuador 2026](https://tagline-soluciones.com/blog/talento-humano/jornada-laboral-ecuador/): Jornada de 8 horas diarias y 40 semanales, y recargo nocturno.

#### Décimos y fondos de reserva

Contraste del texto de la ley con lo que se practica.

- [Derecho Ecuador: fondos de reserva](https://derechoecuador.com/fondos-de-reserva/): 8,33 % del sueldo; el tiempo anterior con el mismo empleador se suma.
- [Corte Nacional de Justicia: Resolución 02-2024 sobre fondos de reserva](https://www.cortenacional.gob.ec/cnj/images/pdf/resoluciones/2024/2024-02-Jurisprudencia-obligatoria-Competencia-para-conocer-reclamos-sobre-fondos-de-reserva.pdf): La reforma de 2009 creó dos opciones: pago directo al trabajador o depósito en el IESS.
- [Hacecuentas: décimos y fondos de reserva 2026](https://hacecuentas.com/ec/trabajo/decimos-y-fondos-de-reserva): Apareció al buscar los décimos; no se abrió.
- [Finiquito Justo: fondos de reserva, mensualizado frente al IESS](https://finiquitojusto.com/derechos-laborales/fondos-reserva-ecuador/): El pago ordinario va en el rol; acumular en el IESS requiere solicitud escrita.
- [Roles de pago: aportes IESS Ecuador 2026](https://rolesdepago.com/aportes-iess-ecuador-2026/): Qué integra la materia gravada: sueldo, horas extras y comisiones; no los décimos.
- [Tagline: fondos de reserva en Ecuador 2026](https://tagline-soluciones.com/blog/talento-humano/fondos-de-reserva-ecuador/): El pago ordinario va en el rol; acumular en el IESS requiere solicitud del trabajador.
- [Hacecuentas: sueldo neto en Ecuador 2026](https://hacecuentas.com/ec/trabajo/sueldo-neto): Los décimos no pagan el 9,45 % del IESS.

#### Régimen laboral de las empresas públicas

Análisis de la LOEP.

- [Redalyc: régimen laboral de las empresas públicas ecuatorianas](https://www.redalyc.org/journal/6002/600263428008/html/): La LOEP regula a los servidores de carrera y remite a los obreros al Código del Trabajo.
- [vLex: Ley Orgánica de Empresas Públicas](https://vlex.ec/vid/ley-organica-empresas-publicas-643461625): Contraste de la clasificación del personal.

#### Escala salarial del sector público (por confirmar)

No se encontró la escala oficial vigente de 20 grados. La que carga el sistema viene de una fuente secundaria que dice «20 grados» pero lista 22.

- [ecu11: escala de remuneraciones del sector público 2026](https://ecu11.com/escala-de-remuneraciones-del-sector-publico/) **(leída)**: Los 22 grados de $527 a $4.500 que se cargan como escala de ejemplo de la LOSEP. No cita el acuerdo ministerial.
- [Lexis: Acuerdo Ministerial 39, fijación de remuneraciones mensuales unificadas](https://www.lexis.com.ec/noticias/acuerdo-ministerial-39-fijacion-de-remuneraciones-mensuales-unificadas-de-servidores-de-entidades-del-sector-publico): Una escala de 10 grados, de fecha antigua; se descartó.
- [Tagline: sueldos del sector público en Ecuador 2026](https://tagline-soluciones.com/salarios/sector-publico/): Mismos valores que ecu11 con otra numeración de grados.

#### Planilla del IESS

Cómo se declaran los aportes. No se encontró un formato público de archivo para subirlos.

- [Tagline: planillas del IESS para el empleador 2026](https://tagline-soluciones.com/blog/talento-humano/planillas-iess-empleador/) **(leída)**: La planilla se genera en el portal a partir de los avisos de entrada y salida y las novedades; la base es la materia gravada.
- [Tus Trámites Ecuador: registro masivo de novedades (carga batch)](https://tustramitesecuador.com/registro-masivo-de-novedades-para-empleadores-carga-batch/): Existe una carga batch de novedades en el portal; no se pudo confirmar su formato.
- [Contapp: planilla del IESS en Ecuador](https://www.contapp.ec/blogs/planilla-iess-ecuador): Apareció al buscar el formato de la planilla; no se abrió.

#### Liquidación por salida (por confirmar)

Bonificación por desahucio, indemnización por despido, décimos proporcionales y vacaciones no gozadas. No se pudo leer el texto oficial del Código del Trabajo: ninguna fuente es la norma y se contradicen en la renuncia, la región del décimo cuarto y la fracción de año.

- [Ecuador Legal Online: el desahucio](https://www.ecuadorlegalonline.com/laboral/el-desahucio) **(leída)**: Cita completo el art. 185: el 25 % de la última remuneración por año de servicio, también por acuerdo de las partes.
- [Derecho Ecuador: despido intempestivo](https://www.derechoecuador.com/despido-intempestivo) **(leída)**: Resume el art. 188: tres remuneraciones hasta tres años, una por año desde ahí, tope de 25 y la fracción de año como año completo.
- [Hacecuentas: fin de la relación laboral](https://hacecuentas.com/ec/trabajo/liquidacion-y-despido) **(leída)**: Vacaciones no gozadas a un treintavo de la remuneración por día; el visto bueno del empleador paga solo los proporcionales.
- [NMS Law: bonificación por desahucio en el retiro voluntario](https://nmslaw.com.ec/blog/2025/02/03/corte-nacional-bonificacion-desahucio-retiro-voluntario-ecuador/) **(leída)**: Resolución 03-2025 de la Corte Nacional: el retiro voluntario no da bonificación por desahucio.
- [Primicias: la resolución del desahucio por retiro voluntario solo aplica al sector público](https://primicias.ec/economia/resolucion-pago-desahucio-retiro-voluntario-sector-publico-89686) **(leída)**: Una jueza de la Corte Nacional dice que en el sector privado la renuncia aceptada sí da desahucio.
- [Primicias: demanda de inconstitucionalidad contra la resolución del desahucio](https://primicias.ec/economia/ministra-trabajo-demanda-inconstitucionalidad-corte-desahucio-93097) **(leída)**: La demanda se presentó en abril de 2025; no se encontró cómo terminó.
- [Vistazo: qué pasa con el décimo si renuncias](https://www.vistazo.com/2026-02-25-pasa-decimo-renuncias-debes-saber-antes-dejar-trabajo-OG10700187) **(leída)**: Fechas de pago del décimo cuarto por región; contradice a Ecuador Legal Online en Amazonía y Galápagos.
- [Ecuador Legal Online: Código del Trabajo](https://www.ecuadorlegalonline.com/biblioteca/codigo-de-trabajo/): Texto del Código donde confirmar los arts. 169, 184 y 188; no se abrió.

</details>

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo [LICENSE](LICENSE) para obtener más detalles.

---

## ✍️ Autor

*   **kiramman-mp3** - *Desarrollo*
