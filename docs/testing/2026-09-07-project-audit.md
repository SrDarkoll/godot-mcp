# Auditoría técnica de Godot MCP — 2026-09-07

## Dictamen

El proyecto es una implementación avanzada en fase de estabilización. Existen editor mutations, capturas nativas, control de runtime, diagnósticos, snapshots, recuperación, permisos y distribución instalable; ya supera ampliamente la descripción de foundation del README. Sin embargo, hay problemas reproducibles de seguridad funcional, concurrencia y operación que conviene resolver antes de ampliar la superficie de herramientas o presentar una versión estable.

No se modificó código de producción para esta auditoría. Se restauraron dependencias mediante `npm ci`, se ejecutaron pruebas y se añadieron reproducciones aisladas y este informe. No se realizaron commits, staging, push ni cambios de rama.

## Alcance y evidencia

Revisión dirigida de CLI, bridge/autenticación, política de herramientas, recuperación/publicación, instalación del addon, serialización, persistencia de sesiones, empaquetado y CI. Se leyó código actual y se contrastó con pruebas reales. El grafo MCP no estuvo disponible: no se afirma cobertura exhaustiva ni frescura del índice.

Base Git: `feat/foundation-editor-handshake`, HEAD `7e0b327`. El árbol contiene una cantidad considerable de implementación posterior sin consolidar en commits; HEAD por sí solo no reproduce esta entrega. Los resultados corresponden al árbol de trabajo auditado.

| Comprobación ejecutada | Resultado actual |
|---|---|
| `npm ci` | Instalación correcta; 0 vulnerabilidades reportadas por npm en esa ejecución. No equivale a una auditoría de seguridad completa. |
| `npm test` | 127 aprobadas: protocolo 20, servidor 99, CLI 8. Incluye build. |
| `npm run typecheck` | Aprobado. |
| `npm run check:godot` | 23 scripts del addon y Logger generado aprobados en Godot 4.6.3. |
| `npm run test:integration` con GODOT_BIN | 8 aprobadas, 1 fallida: CLI con configuración inválida. |
| `npm run test:integration:visual` | 2 aprobadas. |
| `npm run test:integration:runtime` | 7 aprobadas. |
| `npm run test:distribution` | Aprobado: empaquetado e instalación en consumidor fuera del checkout. |
| `git diff --check` | Aprobado antes de añadir este informe. |
| Verificación de versión usada por instalador CI | Reproducida como fallida localmente en Windows PowerShell y PowerShell 7.6.5. |

Total de integración: **17 aprobadas y 1 fallida**. No se ejecutó GitHub Actions remoto, ni una matriz real Node 22/24 en runners. Las capturas se verificaron mediante sus suites; esta auditoría no incluyó una nueva inspección visual manual de todas las imágenes. Los mensajes de parser provocados por el caso de script inválido y del renderer dummy no deben confundirse con nuevos fallos de assertions.

Evidencia retenida:

- Reproducción: `.godot-mcp/recovery-test-runs/audit-2026-09-07.mjs`.
- Resultados: `.godot-mcp/recovery-test-runs/audit-5AZq7b/evidence.json`.
- Sintaxis: `.godot-mcp/visual-test-runs/syntax-2dFF77`.
- Distribución: `.godot-mcp/distribution/0.1.0-2a73e1ea`.
- Consumidor externo: `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-IhVZD2`.

## Hallazgos prioritarios

### A1 — P1: la reflexión indirecta evita la prohibición de métodos

**Fuente:** `packages/server/src/security/tool-policy.ts:9,54,66`, `packages/godot-addon/addons/godot_mcp/bridge/safety_policy.gd:16` y `bridge/handlers/object_handlers.gd:123,135`.

La política compara únicamente el nombre del método exterior. `queue_free` se rechaza directamente, pero `call` se permite y sus argumentos pueden seleccionar el método prohibido. La reproducción pasó por la política TypeScript con su token válido y después ejecutó la política nativa contra un nodo desechable:

```json
{"nodePolicyAdmitted":true,"directAllowed":false,"wrapperAllowed":true,"queuedForDeletion":true}
```

La prueba nativa usó el mismo `target.callv` del handler. No se destruyó ningún nodo del editor personal ni se ejecutó una cadena destructiva sobre un proyecto real. La confirmación sigue siendo necesaria; lo que falla es la garantía de que ciertos métodos están prohibidos incluso después de confirmar.

**Corrección:** restringir reflexión por clase, destino y método; cerrar `call`, `callv`, `call_deferred` y equivalentes indirectos, y mantener extensiones de scripts como una capacidad explícita de confianza. Evitar presentar los permisos como sandbox de scripts Godot: un método personalizado puede tener efectos no deducibles de su nombre.

**Aceptación:** invocaciones directas e indirectas a métodos prohibidos fallan en Node y addon; confirmar no levanta la prohibición. Probar asimismo que resolución por `..` y `object_id` no alcanza objetos fuera del ámbito permitido.

### A2 — P1: una edición concurrente puede perderse durante commit

**Fuente:** `packages/server/src/recovery/recovery-service.ts:31–37` y `packages/server/src/recovery/project-files.ts:20`.

Los hashes se verifican antes de preparar blobs, escribir el journal y persistir el estado. Después se reemplazan los archivos sin comprobar de nuevo el contenido esperado de cada destino. Un escritor externo puede cambiar un archivo en ese intervalo.

Se introdujo una edición controlada justo antes de la primera escritura mediante instrumentación de `ProjectFiles.write`. El commit terminó como `committed` y el contenido humano fue sustituido por el contenido del agente. Es una reproducción determinista de una ventana de concurrencia, no una medición de su frecuencia en uso real.

**Corrección:** establecer exclusión de escritores cooperantes por proyecto, volver a comprobar precondiciones inmediatamente antes de cada reemplazo y conservar evidencia de conflictos. Para editores externos no cooperantes, documentar expresamente el límite de aislamiento y diseñar la publicación de manera que no prometa CAS atómico si el sistema de archivos no lo ofrece. Una comprobación adicional por sí sola reduce la ventana, pero no la elimina.

**Aceptación:** inyectar cambios después de preflight y entre archivos; abortar con conflicto conservando los bytes externos. Añadir ensayos de caída del proceso en cada transición del journal. Aclarar que recuperación multiarchivo no implica visibilidad atómica para otros procesos.

### A3 — P2: configuración corrupta bloquea status, stop y doctor

**Fuente:** `packages/cli/src/cli-runner.ts:30`; reproducción existente `tests/integration/cli-lifecycle.test.ts:18`.

El runner carga toda la configuración antes del switch, incluso para comandos que solo necesitan el descriptor autenticado. Con `{"bridgePort":"invalid"}`, `status` devuelve `OPERATION_FAILED`; por el mismo flujo, `stop` tampoco alcanza su handler y `doctor` no llega a producir su diagnóstico por comprobaciones.

**Corrección:** cargar configuración solo en comandos que la requieren. Mantener status/stop independientes y permitir que doctor reporte configuración inválida junto con el resto de checks. Definir una vía explícita de reparación de config sin perder claves desconocidas.

**Aceptación:** la prueba de ciclo CLI actualmente roja pasa completa; status y stop funcionan con JSON inválido y con esquema inválido; doctor devuelve un informe útil en ambos casos.

### A4 — P2: el instalador CI no captura correctamente la versión del ejecutable GUI

**Fuente:** `scripts/ci-install-godot.ps1:30–31`; invocado desde `.github/workflows/ci.yml`.

La expresión `$reported = & $executable --version` usa el ejecutable GUI de Windows. Con el binario descargado existente, la reproducción exacta local dio salida capturada nula y `$LASTEXITCODE` nulo; la condición de aceptación fue falsa tanto en Windows PowerShell como en PowerShell 7.6.5. El instalador puede rechazar un Godot válido y cortar la validación antes de las integraciones.

**Corrección:** utilizar el ejecutable de consola incluido en el ZIP, o un proceso con espera explícita, stdout/stderr redirigidos, timeout y lectura fiable del exit code. Mantener verificación criptográfica del archivo descargado.

**Aceptación:** ejecutar el instalador completo en el shell de CI y luego Godot syntax/integration; verificar además casos de versión incorrecta y proceso que no termina. No se afirma haber reproducido un fallo en GitHub remoto.

### A5 — P2: instalación/actualización del addon omite la barrera de recuperación

**Fuente:** `packages/cli/src/init/init-project.ts:61–66` y `packages/cli/src/init/install-addon.ts:33`.

Init solo impide actualizar cuando ve un editor conectado. Con un journal de recuperación presente y servidor offline, instaló el addon correctamente y dejó el journal pendiente. La reproducción usó un marcador con identidad válida; demuestra la omisión de la barrera, no pérdida real de un proyecto accidentado. Tampoco consulta una transacción activa en el estado de management.

Además, el instalador reemplaza archivos uno por uno: un error tardío conserva backups, pero puede dejar una mezcla de versiones. No hay publicación global ni compensación automática de ese bucle.

**Corrección:** compartir la barrera de mantenimiento entre CLI y servidor, rechazar actualización durante recuperación/transacción, y registrar la actualización con posibilidad de reanudar o restaurar. El backup debe incluir archivos nuevos y versión origen/destino, además de los sobrescritos.

**Aceptación:** journal pendiente y transacción activa bloquean init/update; fallo en el segundo archivo conserva un addon coherente o un estado recuperable explícito.

### A6 — P2: documentación y estado de entrega no representan la implementación

**Fuente:** `README.md:3–27`, manifiestos de paquetes y árbol de trabajo.

El README describe solo tres herramientas y declara capturas, runtime, recuperación y permisos como futuros. Esto contradice las pruebas y el código actuales. Faltan guías consolidadas de instalación/actualización, compatibilidad, límites de recuperación, confianza de reflexión y publicación. La automatización de release/CI existe en el árbol, pero no tiene una ejecución remota verificada.

**Corrección:** actualizar documentación desde un catálogo único de herramientas; separar implementado, verificado y pendiente. Añadir changelog, contribución, política de seguridad y procedimiento de release. Consolidar cambios en entregas revisables cuando corresponda integrar el trabajo.

**Aceptación:** seguir instalación/diagnóstico/actualización desde un checkout o paquete limpio usando solo la documentación; comprobar que cada herramienta documentada existe y que los requisitos de versión coinciden con sus capacidades reales.

## Fortalezas que conviene conservar

- Separación entre protocolo, servidor, CLI y addon; MCP estándar por stdio y puente autenticado ligado al proyecto en localhost.
- Capturas nativas del viewport con límites, validación de PNG/hash y persistencia de evidencia.
- Runtime con identidad de ejecución, distinción entre juego propio y externo, pausa/break y cierre controlado. Las siete pruebas actuales pasan.
- Snapshots, journal, compensación y protección de conflictos previos a publicación. Son una base útil aunque A2 limita el aislamiento concurrente.
- Política central de herramientas, confirmaciones de un uso y registros de operación. A1 exige estrechar el alcance de esa protección.
- Smoke de distribución que instala paquetes en un consumidor fuera del repositorio; pasó nuevamente.

## Refuerzos recomendados después de los hallazgos

1. **Un catálogo tipado de herramientas.** Centralizar schema, permisos, riesgo, capacidades y documentación. Hoy hay listas manuales de nombres en ToolPolicy que pueden divergir del registro MCP. Añadir una prueba que exija clasificación explícita para cada herramienta registrada.
2. **Límites homogéneos de serialización.** Revisar `variant_serializer.gd:71–80`: la ruta general recorre arrays/diccionarios recursivamente sin los límites de la ruta runtime. Añadir profundidad, elementos, bytes y detección de ciclos. Es una observación de código; no se provocó un agotamiento del editor.
3. **Mantenibilidad del código crítico.** Descomponer métodos densos de ToolPolicy y RecoveryService, formatear consistentemente y representar transiciones del journal con tipos exhaustivos. Mantener tests de comportamiento para evitar que el refactor cambie garantías.
4. **Observabilidad de larga duración.** Métricas de latencia por herramienta, colas, desconexiones, memoria y bytes por sesión; avisos de cuota y exportación de evidencias. No borrar automáticamente capturas, snapshots ni logs.
5. **Pruebas adversas y compatibilidad.** Disco lleno, permisos de archivo, interrumpir procesos durante publicación, reinicio de bridge, editor cerrado inesperadamente, scripts con ciclos y proyectos grandes. Establecer una matriz explícita de Godot soportado, no asumir que toda API de 4.6 existe en cualquier 4.x.

## Qué añadir y en qué orden

| Orden | Ampliación | Beneficio y criterio de entrega |
|---|---|---|
| 1 | `project.validate` con backend headless | Validar scripts/escenas y devolver diagnósticos estructurados sin depender del editor conectado; timeout, límites y código de salida comprobados. |
| 2 | Vista previa de cambios y diff de transacciones | Mostrar cambios de texto, binarios y archivos nuevos antes de confirmar; no devolver solo hashes. Redactar datos sensibles cuando corresponda. |
| 3 | Operaciones estructuradas por lotes | Editar escenas/recursos con precondiciones y una unidad de undo/recuperación definida, reduciendo viajes MCP y dependencia de reflexión. |
| 4 | Suscripción a eventos de proyecto | Notificar escena cambiada, importación terminada y estado de ejecución; reconexión con cursor y control de presión. |
| 5 | Herramientas de importación y dependencias | Esperar importaciones, detectar referencias rotas y consultar dependencias antes de mover/eliminar recursos. |
| 6 | Comparación visual y presupuestos de rendimiento | Comparar capturas deterministas y métricas entre ejecuciones; resultados reproducibles con resolución y escena registradas. |

**Secuencia recomendada:** corregir A1/A2; resolver A3–A5 y cerrar CI; actualizar A6; después añadir validación headless y diff. No ampliar primero `object.call`: su alcance debe reducirse y hacerse explícito antes de usarlo como vía general de nuevas funciones.
