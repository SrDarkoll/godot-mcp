# Godot MCP Runtime & Debugger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Work inline unless delegation is explicitly requested.

**Goal:** Completar el ciclo editar → ejecutar → inspeccionar → leer diagnósticos → capturar el juego → detener, con una partida activa y artefactos persistentes por sesión.

**Architecture:** Node mantiene MCP, estado y almacenamiento; el EditorPlugin administra la ejecución con `EditorInterface` y un `EditorDebuggerPlugin`. Un autoload de desarrollo dentro del juego intercambia mensajes estructurados mediante `EngineDebugger`; no abre sockets ni escucha puertos. El canal editor–Node existente transporta respuestas y eventos autenticados, y el almacén del Plan 3 persiste las capturas del juego.

**Tech Stack:** Node.js >=22, TypeScript ESM, npm workspaces, Zod v4, Vitest, GDScript, Godot 4.x con capacidades negociadas; objetivo de verificación Windows/Godot 4.6.3.

---

## Registro de ejecución — 2026-09-05

La implementación está terminada para el alcance de este hito y permanece sin commit sobre la rama original. El contexto de planificación y sus pasos originales se conservan abajo; los resultados ejecutados están en el [informe de validación](../../testing/runtime-validation.md).

- [x] Viabilidad del debugger nativo y Logger comprobada con procesos reales.
- [x] Contratos de runtime, diagnósticos y eventos; manifiesto compatible con Plan 3.
- [x] Autoload idempotente, detección de colisión y adaptador Logger generado.
- [x] Control de ejecución, ownership, run IDs y correlación de respuestas.
- [x] Eventos autenticados y carril prioritario para stop/status.
- [x] Árbol/propiedades canónicas, pausa/resume y métricas puntuales.
- [x] Diagnósticos nativos paginados, buffer acotado y JSONL persistente.
- [x] Captura del juego por fragmentos y almacén compartido con Plan 3.
- [x] Herramientas MCP, cierre con EOF y protección de partidas manuales.
- [x] Regresión, check-only, inspección de PNG y documentación.

Ajustes de implementación respaldados por pruebas: el coordinador de ejecución reside junto al EditorDebuggerPlugin para mantener en un único módulo la identidad de las sesiones. CaptureId deriva de runId/requestId. La fixture importa recursos antes de readiness y usa UID en su escena principal. Se distingue tamaño de viewport real del tamaño nominal del proyecto. La captura interrumpida se comprueba con una demora introducida solo en la copia de fixture. Se corrigieron la herencia de ownership hacia una partida manual posterior y el silencio ante fallos de publicación del manifiesto.

Límite explícito: no hay garantía de stream diagnóstico completo desde el nacimiento hasta la muerte del proceso; `diagnosticsComplete` permanece false. El Logger registra origen del error, no variables ni stepping. La matriz ejecutada es Windows/Godot 4.6.3; no se presenta como una validación exhaustiva de todos los 4.x ni de exportaciones.

## Estado y autorización de esta entrega

Documento preparado el 2026-09-05 sobre `feat/foundation-editor-handshake`, `HEAD=7e0b327`, incluyendo los cambios locales del Plan 3 todavía sin commit. La petición inmediatamente anterior propuso redactar este Plan 4; esta entrega es planificación, no una afirmación de que runtime esté implementado.

No revertir, aislar fuera del alcance ni omitir los cambios locales del Plan 3. Mantener el directorio y rama del traspaso. No stage/commit/push/merge sin una instrucción posterior que lo solicite. No alterar el proyecto Godot personal que pueda estar abierto. Los tests futuros solo administran sus propios procesos y fixtures.

Se leyeron la especificación maestra, los contratos y módulos actuales de bridge/session/visual, el instalador del addon y el informe de validación del Plan 3. No había herramientas de Codebase Memory disponibles; el análisis se hizo sobre los archivos. Los 98 tests unitarios, 7 de integración y 17 scripts validados son la base registrada del Plan 3, no ejecuciones nuevas de este documento.

### Alcance fijado

Incluido: ejecución principal/actual/explícita, detención/reinicio, estado, pausa del SceneTree, inspección acotada de nodos/propiedades, diagnósticos propios de esta ejecución, métricas puntuales y `visual.capture_game`.

Diferido: escritura de propiedades y llamadas arbitrarias del runtime, breakpoints editables/stepping, inspección de variables en una interrupción, profiler continuo, runtime sin editor, exportaciones, múltiples partidas, transacciones/rollback y disparadores automáticos de captura. `debugger=true` no significa que toda API ilustrativa de la especificación esté disponible.

Una instancia lógica activa significa un proyecto, un editor y como máximo un proceso de juego asociado. Godot normalmente utiliza procesos distintos para editor y juego; no confundir esta arquitectura necesaria con soporte multiinstancia.

## Fundamento de APIs y decisiones

Referencias oficiales consultadas para Godot 4.6:

- [EditorDebuggerPlugin](https://docs.godotengine.org/en/4.6/classes/class_editordebuggerplugin.html): registro del plugin, selección de sesión y recepción de mensajes personalizados.
- [EditorDebuggerSession](https://docs.godotengine.org/en/4.6/classes/class_editordebuggersession.html): estado activo/interrumpido, señales de inicio/fin y envío al juego.
- [EngineDebugger](https://docs.godotengine.org/en/4.6/classes/class_enginedebugger.html): canal del lado runtime; su callback recibe el nombre sin prefijo.
- [EditorInterface](https://docs.godotengine.org/en/4.6/classes/class_editorinterface.html): `play_main_scene`, `play_current_scene`, `play_custom_scene` y `stop_playing_scene`.
- [Logger](https://docs.godotengine.org/en/4.6/classes/class_logger.html): recepción de mensajes, errores y advertencias. Los callbacks pueden ser concurrentes; no deben emitir nuevos logs.
- [OS](https://docs.godotengine.org/en/4.6/classes/class_os.html): registro/retiro del logger.
- [ScriptBacktrace](https://docs.godotengine.org/en/4.6/classes/class_scriptbacktrace.html): metadatos de frames; no capturar valores de variables.

Elegir el debugger nativo frente a un segundo WebSocket del juego: evita otro endpoint/token y conserva el modelo aprobado. No interceptar comandos internos no documentados del debugger ni leer su UI. El canal personalizado no equivale a una suscripción automática a todos los errores del motor.

Para diagnósticos, elegir un adaptador Logger del juego frente a parsear un archivo global del editor. Solo puede observar lo ocurrido después de instalarse; los fallos anteriores se reflejan como fallo/timeout de arranque, sin inventar mensajes. No prometer recuperar stderr de un proceso que lanzó el editor mediante una API sin redirección de streams.

La disponibilidad documental debe probarse en el ejecutable objetivo. La tarea 1 es una comprobación pequeña de viabilidad, con resultados retenidos; no introducir una alternativa de desktop automation si falla.

## Contratos públicos

Todos los esquemas nuevos son `z.strictObject`. Las rutas de escena son `res://...tscn` o `.scn`, canónicas y dentro del proyecto. Rechazar `..`, backslash, NUL, UNC, rutas absolutas y junctions que escapen; confirmar tipo `PackedScene` en Godot antes de ejecutar. Una ruta válida sintácticamente no prueba que exista.

| Herramienta MCP | Entrada | Salida |
|---|---|---|
| `project.run` | `{}` | `RuntimeStatus` de la escena principal |
| `project.run_scene` | `{path?: string}`; omitido = escena editada actual | `RuntimeStatus` |
| `project.stop` | `{}` | `{stopped:boolean,runId:string|null}` |
| `runtime.status` | `{}` | `RuntimeStatus`; disponible sin editor |
| `runtime.scene_tree` | `{max_depth?:0..32,max_nodes?:1..2000}` | `{runId,scenePath,root,truncated}` |
| `runtime.inspect_node` | `{node_path,properties?:string[0..64]}` | `{runId,node,properties}` |
| `runtime.get_property` | `{node_path,property}` | `{runId,property,value}` |
| `runtime.pause` / `runtime.resume` | `{}` | `RuntimeStatus` confirmado |
| `runtime.restart` | `{}` | `RuntimeStatus` con nuevo runId |
| `runtime.stop` | `{}` | mismo servicio que `project.stop` |
| `debug.output` | `{run_id?,after?:0..,limit?:1..200}` | `DiagnosticPage` |
| `debug.errors` / `debug.warnings` | misma entrada | misma página con filtro |
| `debug.performance` | `{}` | métricas puntuales etiquetadas por runId |
| `visual.capture_game` | metadatos del Plan 3; sin viewport_index | `CaptureResult` + bloque MCP image |

Defaults: árbol `max_depth=16`, `max_nodes=500`; página `after=0`, `limit=100`; inspección sin lista devuelve metadatos y cero getters. `node_path` usa `/root/...`, límite 1024 caracteres, nunca object IDs persistidos entre partidas. Resolver solo nodos descendientes del SceneTree runtime y excluir el autoload MCP y sus descendientes. No reutilizar los paths lógicos `/Main/...` del editor sin traducirlos explícitamente.

Propiedades se serializan con la representación canónica existente de Variant. La inspección acota profundidad a 8, arrays/dictionaries a 256 entradas, strings a 4096 caracteres y respuesta a 256 KiB. Un exceso devuelve `RESULT_TOO_LARGE`; no truncar un valor sin avisar. Los getters de scripts del usuario pueden ejecutar lógica: validar existencia y solicitar solo propiedades explícitas. No se expone ejecución arbitraria.

Tipos en `packages/protocol/src/runtime.ts`:

```ts
import * as z from 'zod/v4';
export const RunStateSchema = z.enum([
  'stopped','starting','running','paused','breaked','stopping','disconnected','failed'
]);
export const RuntimeFeaturesSchema = z.strictObject({
  inspect:z.boolean(), scenePause:z.boolean(), gameCapture:z.boolean(),
  diagnostics:z.boolean(), performance:z.boolean()
});
export const RuntimeStatusSchema = z.strictObject({
  state:RunStateSchema, runId:z.uuid().nullable(), scenePath:z.string().nullable(),
  connected:z.boolean(), ownership:z.enum(['none','session','external']),
  features:RuntimeFeaturesSchema, errorCode:z.string().nullable()
});
export const RuntimeNodeParamsSchema = z.strictObject({
  node_path:z.string().min(1).max(1024).refine(p=>p.startsWith('/root/') && !p.includes('..') && !p.includes('\\') && !p.includes('\0'))
});
export const DiagnosticQuerySchema = z.strictObject({
  run_id:z.uuid().optional(), after:z.number().int().nonnegative().default(0),
  limit:z.number().int().min(1).max(200).default(100)
});
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;
```

### Identidad, ownership y estados

- Node genera `runId` UUID antes de solicitar el arranque; `mcpSessionId` es la sesión persistente existente. El editor une ambos con el ID de debugger de Godot; nunca trata este último como un runId público.
- `starting` no es éxito: requiere sesión debugger activa, autoload listo y escena actual no nula. Deadline de 15 s; RPC de arranque 20 s. Sin readiness devolver `RUNTIME_START_FAILED` o `RUNTIME_START_TIMEOUT`, con estado observable.
- Solo el coordinador de editor posee transiciones de ejecución. Node valida/aplica sus eventos en orden y registra el run; un único servicio Node serializa run/stop/restart.
- Iniciar mientras otra partida existe devuelve `RUNTIME_ALREADY_RUNNING`. No detenerla implícitamente. Si hay varias sesiones activas, devolver `MULTIPLE_RUNTIME_SESSIONS` sin elegir la primera.
- Una partida iniciada manualmente se informa con `ownership=external`: no adoptar ni controlar silenciosamente. `project.stop`/pause/restart exigen ownership de la sesión MCP actual y devuelven `RUNTIME_NOT_OWNED` si falta.
- `paused` significa `SceneTree.paused=true`; el autoload usa `PROCESS_MODE_ALWAYS`. `breaked` significa interrupción del debugger, donde las coroutines del juego podrían no avanzar. Lecturas, pausa y captura devuelven `RUNTIME_BREAKED`; status y stop permanecen disponibles desde el editor.
- Stop confirma `EditorDebuggerSession.stopped` y/o ausencia de partida. No basta haber llamado `stop_playing_scene`. Stop sin partida es idempotente, `stopped=false`. Deadline 5 s; RPC 7 s.
- Restart conserva el objetivo original, espera stop, genera runId nuevo y luego arranca. No reutilizar IDs, cursores de log ni pendientes.
- Al cerrar MCP: detener solo su propia partida, vaciar eventos de diagnóstico pendientes, cerrar runs/manifiesto y continuar el shutdown del Plan 3. Fallos de stop se registran y no justifican matar procesos ajenos. Reinicio forzado del servidor deja una partida antigua como external; no la adopta automáticamente.

## Canal runtime y eventos de bridge

Prefijo único `godot_mcp`. Mensajes internos: `hello`, `bind`, `ready`, `request`, `response`, `diagnostics`, `capture_begin`, `capture_chunk`, `capture_end`. En `_capture` del EditorDebuggerPlugin llega el prefijo completo; en el callback EngineDebugger llega el sufijo. Validar esa asimetría con una prueba real.

Arranque: el runtime manda hello sin identidad MCP y permanece sin permisos; el editor solo contesta bind cuando existe un lanzamiento propio pendiente. Bind aporta runId y mcpSessionId. El agente confirma ready después de encontrar current_scene; solo entonces se habilitan requests. Un hello de una partida manual no recibe bind controlable.

```json
{
  "protocol":1,
  "mcpSessionId":"<current-session>",
  "runId":"<uuid>",
  "requestId":"<bridge-request-id>",
  "method":"runtime.get_property",
  "params":{"node_path":"/root/Main/Player","property":"position"}
}
```

Respuesta interna conserva los tres IDs y utiliza `ok/result` o `ok/error`. Rechazar IDs ajenos, respuestas duplicadas/tardías y métodos fuera de allowlist. Deadline runtime ordinario 3 s, RPC Node 5 s. Cada pendiente guarda generación del socket del Plan 3, runId y debugger session ID. Al parar/desconectar se rechazan y se liberan timers.

Añadir `packages/protocol/src/events.ts` para el canal editor–Node:

```ts
export interface BridgeRuntimeEvent {
  type:'event'; protocol:1; sessionId:string; sequence:number;
  event:'runtime.state'|'runtime.diagnostics';
  data:RuntimeStatus|DiagnosticBatch;
}
```

Implementar unión discriminada Zod real, con payload específico por event. Sequence crece por conexión autenticada. `BridgeServer` valida eventos antes de intentar `RpcResponseSchema`, verifica sessionId/generación, y notifica al servicio runtime. Mensajes de conexión anterior se ignoran aunque coincida el requestId. No cambiar las respuestas del Plan 3. `session.status.runtimeConnected` se actualiza solo después de ready; false al perder runtime/editor.

La cola FIFO actual no puede bloquear `project.stop` detrás de una espera runtime. Crear un carril acotado para `runtime.status`, `project.stop`, `runtime.stop` y eventos; el stop cancela pendientes antes de esperar el fin del juego. Las mutaciones del editor siguen en el carril existente. Máximo 32 RPC runtime pendientes, un arranque y una captura de juego; exceso = `BUSY`.

## Instalación y compatibilidad

Extender `godot-mcp init`/`enable_plugin.gd` para registrar `autoload/GodotMcpRuntime = "*res://addons/godot_mcp/runtime/runtime_agent.gd"`. Hacer preflight de colisión antes de escribir settings: una entrada existente distinta devuelve `AUTOLOAD_NAME_CONFLICT` sin sobrescribirla. Repetir init es idempotente y preserva el orden de autoloads del usuario. No insertar nodos en escenas ni guardar la escena del editor.

El autoload es inerte si `Engine.is_editor_hint()` o `not EngineDebugger.is_active()`: no logger, timers, archivos ni mensajes en ejecución standalone/exportada. Registrar captures una vez y retirarlas al salir. No incluir tokens de Node en project.godot ni en el juego.

No precargar una subclase de Logger en versiones que carezcan de esa clase. Guardar el adaptador 4.6 como `runtime/runtime_logger_46.gd.txt` y, durante init con el motor compatible, copiar el contenido de esa plantilla local confiable a `.godot-mcp/generated/runtime_logger.gd`. Ese directorio se ignora en Git y no se usa como API para recibir código. El runtime carga el adaptador solo si existen `Logger`, `OS.add_logger`/`remove_logger` y la firma compatible; en otros casos `diagnostics=false`, sin resultados vacíos que parezcan éxito. `init` sin Godot no genera adaptador y doctor explica que debe completarse la instalación.

La clase Logger no debe aparecer como base/tipo en scripts `.gd` que se importan universalmente. `check:godot` prueba los scripts comunes y el adaptador generado en el motor objetivo. La matriz inicial valida 4.6.3; otras versiones pueden usar controles/inspección según capacidades, pero no se anuncian como verificadas.

## Diagnósticos, límites y persistencia

El Logger del runtime se instala lo más pronto posible en `_enter_tree`, antes de current_scene. Sus callbacks solo agregan entradas a una cola protegida por Mutex; el hilo principal drena y envía batches. No llamar print/push_error/EngineDebugger desde el callback. Preservar una bandera de reentrada y nunca capturar variables de stack. `stderr` de `_log_message` se etiqueta como stream, no se reclasifica automáticamente como error de motor.

Tipos en `packages/protocol/src/diagnostics.ts`:

```ts
export interface DiagnosticEntry {
  sequence:number; runId:string; timestamp:string;
  kind:'output'|'error'|'warning'; stream:'stdout'|'stderr'|null;
  message:string; file:string|null; line:number|null;
  frames:Array<{file:string;line:number;function:string}>;
  truncated:boolean;
}
export interface DiagnosticBatch {
  runId:string; entries:DiagnosticEntry[]; dropped:number;
}
export interface DiagnosticPage {
  runId:string; entries:DiagnosticEntry[]; nextCursor:number;
  oldestAvailable:number; dropped:number; truncated:boolean;
}
```

`debug.output` devuelve todas las clases; errors/warnings filtran sin reiniciar el espacio de secuencias. `nextCursor` es el mayor sequence examinado, incluso si el filtro devuelve cero entradas. `run_id` omitido selecciona la ejecución actual o la última de la sesión. Sin ninguna ejecución = `NO_RUNTIME_HISTORY`; run ajeno = `RUN_NOT_FOUND`. Tras stop siguen disponibles los registros ya recibidos.

Límites: mensaje 4096 caracteres, 32 frames, batch 50 entradas/256 KiB, cola runtime 500 entradas, buffer Node 2000 entradas totales por sesión MCP. Conservar por run los contadores de descarte y oldestAvailable aunque se evacúen sus entradas. Máximo 20 batches/s. Registrar dropped en cualquier desbordamiento; no falsear exhaustividad. Pre-bind el logger conserva la cola acotada y la envía tras ready. Una caída antes del envío puede perder diagnósticos: reflejar estado incompleto.

Persistir registros JSONL por run en `logs/runtime/<runId>.jsonl` dentro de la sesión, con escritor serializado y máximo 10 MiB por run. Al alcanzar el límite dejar de persistir nuevos registros, conservar los existentes y marcar `persistenceTruncated=true`; no borrar ni rotar destructivamente. Los buffers de consulta pueden continuar dentro de su límite. Normalizar CR/LF y caracteres de control al presentar; persistir JSON escapado, nunca interpolar logs en comandos.

Los mensajes son contenido no confiable del proyecto y pueden contener información privada. No prometer redacción automática de cualquier secreto. El bridge nunca agrega tokens, entornos, argumentos de lanzamiento ni base64 a estos logs; no activar captura de variables. Un fallo del escritor agrega estado de persistencia degradada y no derriba el control del juego.

Agregar `runtimeRuns` al manifiesto con `.default([])` para leer el formato actual, manteniendo `manifestVersion=1`. Registro: `{runId,scenePath,startedAt,endedAt,state,logPath,diagnosticsComplete,persistenceTruncated}`; state final `stopped|failed|disconnected`. Conservar campos existentes y no poblar transactions/checkpoints de recuperación.

## Captura del juego

`visual.capture_game` captura únicamente `get_tree().root` del juego asociado: no una textura del editor, no una cámara reconstruida. Reutilizar espera post-render/deadline de 2 s y validación de tamaño del Plan 3; headless devuelve `CAPTURE_UNSUPPORTED`. Capturar mientras SceneTree está pausado es válido; durante debugger break se rechaza.

No enviar el PNG completo como un mensaje enorme del debugger. Fragmentar base64 en bloques de 64 KiB, máximo 342 fragmentos y 16 MiB decodificados. Begin contiene captureId, runId, requestId, dimensiones, timestamp, scene, totalChunks, totalBytes y SHA-256. End confirma captureId. Editor reensambla una sola captura por run, valida orden/duplicados/conteo/tamaño/hash y descarta los buffers al parar, cambiar run o vencer 8 s. Enviar como máximo cuatro chunks por process frame; ningún callback bloquea el bucle. RPC de captura Node = 10 s. La prueba de viabilidad verifica estos límites antes de fijarlos como compatibles con el debugger real.

El editor devuelve al Node el payload base64 habitual más `run_id`. Node valida el run activo, agrega `type:'game'`, `runId`, `viewportIndex:null`, ruta `screenshots/game/NNNN_label.png`, y usa el mismo contador global/cola de persistencia que las capturas de editor. No construir un segundo almacén ni resetear secuencias por run.

Extender `ScreenshotRecordSchema` para editor/game con refinamiento coherente entre type, carpeta, runId e índice; los registros anteriores sin runId se interpretan como null. La respuesta MCP mantiene el mismo formato imagen+structuredContent. Un checkpoint visual puede referenciar una imagen de juego. No habilitar ON_RUN automáticamente en este plan: la captura es explícita.

## Mapa de archivos y responsabilidades

| Archivo | Responsabilidad |
|---|---|
| `packages/protocol/src/runtime.ts`, `diagnostics.ts`, `events.ts` | Contratos de estado, consultas y eventos |
| `packages/protocol/src/capabilities.ts`, `session-artifacts.ts`, `visual.ts`, `index.ts` | Capacidades aditivas y capturas de juego compatibles |
| `packages/server/src/runtime/runtime-service.ts` | Estado validado, ownership y control de ejecuciones |
| `packages/server/src/runtime/diagnostic-store.ts` | Buffer paginado, límites y JSONL |
| `packages/server/src/tools/runtime-tools.ts`, `debug-tools.ts` | Registro agrupado MCP y adaptación de errores |
| `packages/server/src/bridge/bridge-server.ts` | Separar eventos autenticados de respuestas |
| `packages/server/src/mcp/create-server.ts`, `index.ts`, `session/session.ts` | Inyección, registro, estado y shutdown |
| `packages/server/src/session/session-store.ts`, `visual/screenshot-store.ts`, `tools/visual-tools.ts` | Runs y capturas dentro de la sesión existente |
| `packages/godot-addon/addons/godot_mcp/debugger/editor_debugger.gd` | Sesiones debugger, bindings y correlación |
| `packages/godot-addon/addons/godot_mcp/runtime/runtime_agent.gd` | Autoload de desarrollo y recepción nativa |
| `packages/godot-addon/addons/godot_mcp/runtime/runtime_handlers.gd` | Lecturas acotadas, pausa y métricas |
| `packages/godot-addon/addons/godot_mcp/runtime/runtime_capture.gd` | PNG/chunks del viewport runtime |
| `packages/godot-addon/addons/godot_mcp/runtime/runtime_logger_46.gd.txt` | Plantilla de Logger compatible |
| `packages/godot-addon/addons/godot_mcp/bridge/handlers/runtime_handlers.gd` | Coordinación EditorInterface y despacho a debugger |
| `packages/godot-addon/addons/godot_mcp/plugin.gd`, `bridge/bridge_client.gd`, `bridge/rpc_dispatcher.gd` | Registro nativo, eventos y carril stop/status |
| `packages/godot-addon/addons/godot_mcp/tools/enable_plugin.gd` | Autoload idempotente y generación del adaptador |
| `packages/cli/src/init/init-project.ts`, `doctor/doctor.ts` | Instalación y diagnóstico de runtime |
| `packages/protocol/test/runtime.test.ts`, `diagnostics.test.ts`, `events.test.ts` | Contratos nuevos |
| `packages/server/test/runtime-service.test.ts`, `diagnostic-store.test.ts`, `runtime-tools.test.ts` | Estado, persistencia y MCP |
| `packages/server/test/bridge-server.test.ts`, `screenshot-store.test.ts`, `visual-tools.test.ts` | Regresiones de bridge/artefactos |
| `packages/cli/test/init-project.test.ts`, `doctor.test.ts` | Colisiones y compatibilidad |
| `tests/integration/runtime-debugger.test.ts`, `runtime-game-capture.test.ts` | Engine real, ciclo y PNG |
| `tests/integration/helpers/runtime-harness.ts`, `runtime-probe.gd` | Fixture y prueba inicial de viabilidad |
| `fixtures/runtime-project/project.godot`, `main.tscn`, `main.gd`, `alternate.tscn` | Partida determinista, contador, colores y diagnósticos |
| `scripts/run-integration.mjs`, `check-addon.mjs`, `package.json`, `.gitignore` | Selección de tier y adaptador generado |
| `docs/tools/runtime-debugger.md`, `docs/protocol/runtime-rpc.md`, `docs/testing/runtime-validation.md`, `README.md` | Uso y evidencia |

## Tarea 1: Comprobar el canal nativo y límites en una fixture

- [ ] Crear `runtime-probe.gd` y una fixture aislada bajo `.godot-mcp/runtime-test-runs/`. Registrar un EditorDebuggerPlugin y el autoload solo en esa fixture. No modificar producción en esta tarea.
- [ ] Verificar el patrón mínimo con un `ping` del juego y `pong` del editor:

```gdscript
# En el juego, después de verificar EngineDebugger.is_active():
EngineDebugger.register_message_capture("godot_mcp", _capture)
EngineDebugger.send_message("godot_mcp:hello", [{"protocol": 1}])

func _capture(message: String, data: Array) -> bool:
    if message != "ping":
        return false
    EngineDebugger.send_message("godot_mcp:pong", data)
    return true
```

- [ ] Ejecutar Godot 4.6.3 desde un proceso de test propio: abrir el editor de fixture y lanzar mediante API. Afirmar el pong y el ID de sesión, detener y afirmar la señal stopped. Un print local sin pong no es éxito.
- [ ] Probar transporte de chunks >64 KiB agregados y Logger con `print`, `push_warning`, `push_error`, incluyendo llamada desde un Thread del fixture. Conservar logs y conteos, no aceptar solo compilación.
- [ ] Si el adaptador o límite documentado no funciona, corregir este plan con evidencia antes de implementar la superficie; no sustituir silenciosamente logs nativos por un wrapper obligatorio para scripts del usuario.

## Tarea 2: Contratos y compatibilidad del manifiesto (TDD)

- [ ] Crear tests de esquemas, incluidos paths, runId, cursores, estados, payloads desconocidos y manifiesto del Plan 3 sin runtimeRuns. Test mínimo:

```ts
import {expect,it} from 'vitest';
import {RuntimeNodeParamsSchema,DiagnosticQuerySchema} from '../src/runtime.js';
it('rejects escape paths and bounds diagnostic pages',()=>{
  for(const node_path of ['/Main','/root/../Secret','C:/scene','/root/A\\B']) {
    expect(RuntimeNodeParamsSchema.safeParse({node_path}).success).toBe(false);
  }
  expect(DiagnosticQuerySchema.safeParse({limit:201}).success).toBe(false);
  expect(DiagnosticQuerySchema.parse({})).toEqual({after:0,limit:100});
});
```

- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/protocol -- test/runtime.test.ts test/diagnostics.test.ts test/events.test.ts`; esperar FAIL por exports ausentes.
- [ ] Implementar contratos anteriores, refinamientos de eventos/artefactos y exports. Agregar `runtimeFeatures` opcional con defaults false al hello para tolerar un addon anterior; separar soporte runtime del estado conectado.
- [ ] Repetir tests → PASS; ejecutar `rtk npm run build --workspace @godot-mcp/protocol`.

## Tarea 3: Instalación del autoload y Logger compatible (TDD)

- [ ] Tests CLI con project.godot real: init dos veces produce una sola entrada; conserva otros autoloads; colisión distinta falla sin cambios; motor sin Logger no genera script incompatible. Registrar diff de settings de fixture.
- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/cli -- test/init-project.test.ts test/doctor.test.ts` → FAIL en las nuevas aserciones.
- [ ] Extender enable_plugin con preflight y settings, copiando únicamente la plantilla interna cuando sea compatible. Usar `ProjectSettings.set_setting` y un solo save al completar el preflight. Base del agente:

```gdscript
extends Node
func _enter_tree() -> void:
    if Engine.is_editor_hint() or not EngineDebugger.is_active():
        set_process(false)
        return
    process_mode = Node.PROCESS_MODE_ALWAYS
    # Registrar el callback definido en runtime_agent; no abrir red adicional.
```

- [ ] Implementar inicio/salida completos del agente y doctor: autoload, adaptador, API disponible, instalación pendiente. Añadir `.godot-mcp/generated/` al ignore de proyectos sin eliminar archivos existentes.
- [ ] Repetir tests → PASS; comprobar standalone headless/export-debug sin debugger: cero mensajes MCP y cero logger instalado.

## Tarea 4: Coordinador de ejecución y correlación (TDD)

- [ ] Añadir tests de máquina de estados con dependencias de transporte controladas: start no completa antes de ready, segundo start rechazado, session externa intocable, response de run anterior ignorada, stop cancela pendientes, restart espera stop.
- [ ] Definir `RuntimeService` con métodos `status()`, `run({target:'main'|'current'|'path',path?:string})`, `stop()`, `restart()`, `acceptEvent(event)` y `close()`. El constructor recibe Session, SessionStore y el bridge autenticado. Target `path` exige path; los otros lo rechazan. Principal y actual no se distinguen mediante un null ambiguo.
- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/runtime-service.test.ts` → FAIL.
- [ ] Implementar RuntimeService y coordinador GDScript; registrar `EditorDebuggerPlugin` antes de arrancar bridge. Guardar pendientes por `(debuggerSessionId,runId,requestId)` y timers. Esquema del envío editor:

```gdscript
get_session(debugger_session_id).send_message("godot_mcp:request", [request])
```

- [ ] Validar transición de ready y parada con fixture real; no usar sleeps fijos como señal de readiness. `project.run_scene` sobre escena sin ruta guardada devuelve `SCENE_NOT_SAVED`. No añadir llamadas propias a `save_all_scenes`; documentar los guardados que realice Godot por su configuración al lanzar. No prometer que ejecutar una escena modificada carezca de efectos de guardado nativos.
- [ ] Repetir tests → PASS y probar error de arranque antes del autoload: estado failed, sin runtimeConnected ficticio.

## Tarea 5: Eventos autenticados y stop prioritario (TDD)

- [ ] Tests de bridge: evento con sessionId erróneo ignorado; eventos antes de hello_ack no aceptados; respuesta RPC existente sigue resolviendo; stop no espera al timeout de una captura pendiente.
- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/bridge-server.test.ts test/runtime-service.test.ts` → FAIL.
- [ ] Separar `BridgeRuntimeEvent` de respuestas y aplicar validación/generación antes del callback. En Godot agregar señal `runtime_event(payload)` del coordinador al bridge y un método de envío que usa exclusivamente el socket autenticado actual.
- [ ] Implementar el carril control acotado y cancelación de pendientes. Nunca consumir una respuesta de runtime dentro de la misma cola que espera esa respuesta. Al desconectar emitir estado local disconnected y limpiar features efectivas.
- [ ] Repetir tests → PASS; prueba real reinicia Node con juego activo: no adoptar ownership anterior ni cruzar respuestas.

## Tarea 6: Árbol, propiedades, pausa y métricas (TDD)

- [ ] Fixture con `Counter` que incrementa un valor cada frame y un nodo con Vector2. Tests comparan valor runtime contra el valor editado, verifican truncamiento explícito del árbol y exclusión del autoload MCP. Pausar congela Counter, consultar sigue funcionando y resume lo incrementa.
- [ ] Implementar un test MCP de resultado canónico, no un test que solo confirme el mock:

```ts
expect(propertyResult).toMatchObject({
  property:'position',value:{type:'Vector2',value:{x:12,y:24}}
});
expect(pausedStatus.state).toBe('paused');
expect(counterAfterPause).toBe(counterBeforePause);
```

- [ ] Ejecutar test focal del tier runtime → FAIL por métodos ausentes, no por engine no configurado.
- [ ] Implementar resolución nativa de paths, validación de propiedades y el serializador canónico. Pausa modifica únicamente `get_tree().paused`; confirmar el valor antes de responder. Resume no intenta continuar un breakpoint.
- [ ] `debug.performance` devuelve `{runId,sampledAt,fps,frameTimeMs,nodeCount,objectCount}`. Valores no disponibles son null, no cero inventado; frameTimeMs solo se deriva de FPS positivo. Consultar `Performance`/`Engine` puntualmente sin activar profiler ni polling permanente.
- [ ] Repetir tests → PASS; nodo eliminado durante lectura devuelve `NODE_NOT_FOUND`, valor demasiado grande `RESULT_TOO_LARGE`.

## Tarea 7: Diagnósticos paginados y JSONL (TDD)

- [ ] Crear `diagnostic-store.test.ts` con filesystem temporal real: batches duplicados, filtro que no encuentra entradas pero avanza cursor, 2001 entradas/desborde, run anterior consultable, fallo de disco y límite 10 MiB sin borrado.
- [ ] API de DiagnosticStore: `append(batch)`, `query(runId,kind|'all',after,limit)`, `flush()`. El constructor recibe SessionStore y sessionId; no rutas del usuario. Usar entradas completas y una página esperada literal:

```ts
expect(page).toMatchObject({entries:[],nextCursor:3,oldestAvailable:1,dropped:0,truncated:false});
```

- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/diagnostic-store.test.ts` → FAIL.
- [ ] Implementar buffer/JSONL y escritor serial. Logger usa Mutex y copia metadatos a una cola; drain en hilo principal. Tests reales generan al menos un mensaje, warning y error después de ready y verifican kind, texto, runId y archivo persistente.
- [ ] Si no hay adaptador, `debug.output/errors/warnings` devuelve `CAPABILITY_UNAVAILABLE`; no `entries:[]` engañoso. Historias ya persistidas siguen consultables.
- [ ] Repetir tests → PASS; confirmar que no aparece el token del descriptor en eventos/logs y que secuencias/cursor no mezclan runs.

## Tarea 8: Captura runtime y reutilización del Plan 3 (TDD)

- [ ] Tests de schemas/store admiten `type:game` solo bajo screenshots/game y con runId. Mantener lectura de todos los registros editor anteriores. Test mixto exige secuencias editor 1, game 2, editor 3.
- [ ] Añadir pruebas de reensamblado: fragmento repetido/faltante/fuera de orden, run equivocado, timeout, bytes excedidos, stop a mitad de captura y hash incorrecto. Ningún caso debe guardar un PNG de éxito.
- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/screenshot-store.test.ts test/visual-tools.test.ts` → FAIL en casos game.
- [ ] Implementar `runtime_capture.gd`, reensamblado editor y `VisualTools.capture('game', ...)`. Reutilizar la cola/contador existente y `toolImageSuccess`; no duplicar validación PNG/CRC.
- [ ] Ejecutar el juego con un rectángulo cuyo color/posición cambian solo en runtime; afirmar que la captura muestra el estado del juego y difiere del editor. Añadir textura ruidosa que obligue a varios chunks.
- [ ] Repetir tests → PASS, decodificar con Godot y abrir el PNG para inspección. Los archivos quedan conservados incluso si falla el test.

## Tarea 9: Registro MCP y cierre ordenado (TDD)

- [ ] Crear `runtime-tools.test.ts` con cliente/transporte MCP en memoria y stores reales. Afirmar herramientas listadas, errores de capacidad, páginas reales y respuesta imagen. Los adaptadores se registran desde módulos separados para no seguir agrandando create-server.
- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/runtime-tools.test.ts` → FAIL.
- [ ] Implementar `registerRuntimeTools(server,context)` y `registerDebugTools(server,context)`, utilizando schemas compartidos y `toolError`. Aliases de stop comparten RuntimeService; no crean dos rutas de estado.
- [ ] Integrar runtime.close antes de cerrar el bridge en index.ts; dar oportunidad acotada a stop/drenaje antes de finalizar session. Al fallar una etapa conservar el patrón de shutdown que ejecuta las demás. No colgar stdio esperando indefinidamente al juego.
- [ ] Repetir tests → PASS y ampliar `session-lifecycle.test.ts` para comprobar runs finalizados tras EOF; el juego manual externo permanece fuera del control.

## Tarea 10: Tier de integración y cierre verificable

- [ ] Añadir `npm run test:integration:runtime` → `scripts/run-integration.mjs --runtime`, requiriendo Windows, GODOT_BIN y GODOT_RUNTIME_INTEGRATION=1. Seleccionar exclusivamente los dos archivos runtime nuevos, secuencialmente, sin skips que parezcan éxito.
- [ ] Excluir esos dos archivos del tier headless y del visual-editor; este hito necesita un editor y su proceso de juego. No asumir que lanzar desde un editor headless obliga al juego a usar renderer headless.
- [ ] Harness crea `.godot-mcp/runtime-test-runs/<id>/`, inicializa addon, abre editor de prueba y usa solo MCP/API. Registrar logs de sus procesos, paths de PNG, versión, renderer y estados. Detener únicamente procesos creados por el harness, sin borrado recursivo de evidencias.
- [ ] Ejecutar el escenario completo: principal → Counter/Vector2 → output/warning/error → pausa/lectura/resume → game PNG → stop → consulta posterior de logs → escena alternativa → restart con otro runId → EOF. Afirmar que no hay dos partidas y que quedan manifests/PNG/JSONL válidos.
- [ ] Documentar errores estructurados: `RUNTIME_NOT_CONNECTED`, `RUNTIME_NOT_OWNED`, `RUNTIME_ALREADY_RUNNING`, `MULTIPLE_RUNTIME_SESSIONS`, `RUNTIME_START_TIMEOUT`, `RUNTIME_START_FAILED`, `RUNTIME_STOP_TIMEOUT`, `RUNTIME_BREAKED`, `SCENE_NOT_SAVED`, `AUTOLOAD_NAME_CONFLICT`, `CAPABILITY_UNAVAILABLE`, `NO_RUNTIME_HISTORY`, `RUN_NOT_FOUND`, `RESULT_TOO_LARGE`; conservar los códigos existentes de paths/PNG/timeouts.
- [ ] Ejecutar, desde la raíz, con el ejecutable objetivo configurado mediante GODOT_BIN y ambos opt-ins gráficos activos:

```powershell
rtk npm run build
rtk npm run typecheck
rtk npm test
rtk npm run check:godot
rtk npm run test:integration
rtk npm run test:integration:visual
rtk npm run test:integration:runtime
rtk git diff --check
rtk git status --short
```

- [ ] Actualizar README, guías de runtime/protocolo e informe de validación con conteos y límites reales. Diferenciar diagnósticos emitidos intencionalmente por la fixture de errores del addon. No afirmar todos los Godot 4.x ni producción lista.
- [ ] Revisar el diff y el cumplimiento de la matriz siguiente. Mantener cambios locales revisables; no commit/push/merge implícitos. Si un requisito funcional falla, continuar corrigiéndolo o identificar el bloqueo real, sin marcarlo completo por agotar una sesión.

## Matriz de aceptación

| Objetivo | Evidencia requerida |
|---|---|
| Ejecutar principal/actual/explícita | Ready real con escena y runId correcto, no solo comando enviado |
| Una partida y ownership | Segundo start rechazado; partida manual no detenida |
| Inspección runtime | Counter/Vector2 reales, autoload excluido, límites visibles |
| Pausa separada de debugger break | Counter congelado con consultas disponibles; break informado |
| Diagnósticos | Print/warning/error nativos, paginación y JSONL por run |
| Captura de juego | PNG decodificado del viewport runtime, chunks y contenido visual inspeccionados |
| Persistencia/reinicio | Run finalizado, PNG/logs conservados, nuevo runId sin respuestas cruzadas |
| Compatibilidad y no regresión | Tests de planes 1–3 y checks del adaptador generado aprobados |

## Revisión del plan

El alcance cubre el siguiente ciclo funcional acordado y mantiene fuera la recuperación/transacciones. Las firmas/IDs, la compatibilidad Logger, los límites de transporte y la diferencia paused/breaked están definidos. La implementación comienza por verificar las APIs en una fixture; los contratos del debugger nativo y la captura de logs no se consideran probados únicamente por esta investigación documental.
