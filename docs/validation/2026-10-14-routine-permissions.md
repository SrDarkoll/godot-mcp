# Permisos rutinarios, cierre seguro e inspección de scripts

Verificado el 14 de octubre de 2026 en Windows, Node.js 24.21.0 y Godot 4.6.3. Cambios locales en la rama `fix/routine-permissions-script-inspection`, partiendo de `d2b9a2c75117efdbb63a5693115e8e698f66db80` (0.6.4).

## Resultado

Las operaciones rutinarias verificadas funcionan con los permisos de sesión existentes, sin aprobación adicional: ajustes comunes del proyecto, los seis controles headless y cierre de escenas guardando primero. No se cambiaron los permisos predeterminados ni se habilitó shell/red/archivos externos.

El arreglo está en el código fuente y fue probado en proyectos desechables. No se publicó una nueva versión, no se actualizaron addons de BLACKOUT/GodotMcpSmoke y no se modificó su juego ni sus mapas. Activarlo en esos proyectos requiere distribuir/instalar el servidor y addon nuevos, y reiniciar sus conexiones.

## Fallos reproducidos y cambios

### Confirmaciones innecesarias: E005, E009 y E012

La política anterior declaraba siempre riesgosos `project.settings.set`, `editor.close_scene` y todos los procesos headless, incluso con sus permisos normales ya habilitados. Las regresiones iniciales mostraron ocho pruebas fallidas por solicitudes de aprobación o por ausencia del contrato de cierre seguro.

Ahora se permite sin elicitation adicional:

- Nombre del proyecto; escena principal local existente; autoloads normales locales y su eliminación; dimensiones de ventana/viewport; stretch; filtro de texturas de canvas; pixel snapping 2D. Se validan tipos, límites y archivos ordinarios dentro del proyecto.
- `headless.validate_project`, `headless.import`, `headless.run`, `headless.run_scene`, `headless.run_tests` y `headless.stop`. Conservan los permisos `filesystem.project` y `process.godot`, rutas acotadas, argumentos controlados y propiedad del proceso.
- `editor.close_scene` con `discard_changes` omitido o falso: guarda la escena nombrada y cierra únicamente si guardar devuelve éxito. Si no tiene nombre devuelve `SCENE_SAVE_REQUIRED`; si no puede guardar devuelve `SCENE_SAVE_FAILED`/`CAPABILITY_UNAVAILABLE` sin cerrar.

La API pública de cierre de Godot descarta cambios, por lo que el guardado previo es necesario. Un servidor nuevo exige `safeCloseSupported` antes del cierre normal: un addon antiguo no recibe accidentalmente una orden destructiva con el nuevo permiso rutinario.

Continúan protegidos el descarte explícito, ajustes desconocidos/sensibles, recursos externos/vinculados, el autoload `GodotMcpRuntime`, sobrescrituras existentes, restauración/publicación de archivos, llamadas reflectivas y undo/redo sin procedencia demostrable. Los permisos desactivados, barreras de recuperación y transacciones siguen bloqueando las operaciones correspondientes.

### Inspección obsoleta: E032

La inspección por ruta usaba `load(path)`, que devolvía metadatos del script almacenado en caché. La prueba nativa reprodujo métodos/propiedades/señales antiguos después de cambiar el archivo, e incluso metadatos viejos después de invalidarlo o eliminarlo.

También se comprobó que `ResourceLoader.CACHE_MODE_IGNORE[_DEEP]` por sí solo no resuelve este caso: la caché separada de GDScript puede reutilizar el recurso vivo. Esa implementación intermedia falló al intentar recargar una instancia existente y se sustituyó.

La solución lee el `.gd` desde disco y compila un `GDScript` nuevo, con contexto de ruta sin tomar posesión de la entrada de caché. El script adjunto y la entrada original de caché permanecen intactos. Se verificaron clases registradas con `class_name`, scripts abstractos y dependencias relativas. Código inválido devuelve `SCRIPT_COMPILE_FAILED`; archivos eliminados devuelven `NOT_FOUND`.

`inspection_source` distingue `disk`, `attached` y `resource`. La inspección por nodo describe el script realmente adjunto. Otros lenguajes/scripts binarios mantienen la inspección del recurso compilado: no se afirma compilación fresca de C#.

## Evidencia de verificación

| Verificación | Resultado |
| --- | --- |
| `npm test` | 519 pruebas aprobadas: protocolo 56, servidor 366, CLI 97 |
| Regresiones focalizadas de política/registrador | 65 pruebas aprobadas; incluidas en las unitarias, no adicionales |
| Integración general con Godot real, sin suites gráficas/runtime avanzadas | 29 pruebas aprobadas en 21 archivos, sin omitidas |
| Fixture nativa de los nuevos contratos | 41 comprobaciones aprobadas dentro de una prueba de integración |
| Flujo real headless con cliente que rechaza cualquier aprobación | Los seis controles funcionaron; cero solicitudes de elicitation |
| Flujo real de ajustes/cierre y recuperación | Ajustes comunes y cierre sin solicitudes; rollback/restauración exactos aprobados |
| `npm run test:release-scripts` | 19 pruebas aprobadas |
| `npm run typecheck` | Aprobado |
| `npm run check:godot` | 42 scripts del addon y Logger generado aprobados |
| Contratos públicos generados | 194 herramientas; archivos generados actualizados |
| Revisión de whitespace | `git diff --check` aprobado |

Artefactos locales de esta ejecución:

- `.godot-mcp/feedback-test-runs/routine-focused-results.json`: tres integraciones focalizadas aprobadas.
- `.godot-mcp/feedback-test-runs/routine-integration-results.json`: batería general completa aprobada.
- `.godot-mcp/feedback-test-runs/routine-irQABK/test-output.log`: `MCP_ROUTINE_NATIVE {"checks":41,"failures":[]}`.
- `.godot-mcp/visual-test-runs/syntax-3Lg8gX/syntax-results.json`: validación nativa de scripts.

## Límites y pendientes

- No se ha validado el despliegue en las sesiones personales abiertas: siguen usando su instalación actual.
- No se ejecutaron en esta pasada las suites de captura gráfica y debugger/runtime avanzado, ni CI remoto de Node 22/24.
- Las pruebas headless generales imprimen diagnósticos de casos negativos y mensajes de miniaturas del renderer dummy; el resultado aprobado no significa que todo el log esté libre de mensajes `ERROR`.
- El camino de compatibilidad sin `Resource.set_path_cache` conserva contexto relativo con una ruta temporal única; la prueba nativa de este arreglo fue con 4.6.3, no con todas las versiones anteriores.
- No se cambiaron la barrera que requiere cerrar escenas antes de publicación de archivos ni las protecciones de sobrescritura. Esos límites no son confirmaciones rutinarias eliminadas en este arreglo.
- Los reportes no permiten atribuir todos los cierres de transporte al MCP de Godot. El grafo de Codebase Memory también perdió su transporte durante esta pasada; se verificó el código pertinente directamente. No se presenta eso como resuelto por este cambio.

## Fuentes de la API verificadas

- [Implementación de EditorInterface en Godot 4.6](https://raw.githubusercontent.com/godotengine/godot/4.6-stable/editor/editor_interface.cpp).
- [Implementación del cierre de escenas en EditorNode](https://raw.githubusercontent.com/godotengine/godot/4.6-stable/editor/editor_node.cpp).
- [Carga de GDScript y caché interna](https://raw.githubusercontent.com/godotengine/godot/4.6-stable/modules/gdscript/gdscript.cpp).
- [Resource.set_path_cache](https://docs.godotengine.org/en/4.6/classes/class_resource.html#class-resource-method-set-path-cache).

La depuración sistemática y las regresiones primero-falla/después-pasa guiaron la modificación: no se quitaron todos los controles, sino la clasificación redundante donde la operación está acotada y autorizada por sus permisos normales.
