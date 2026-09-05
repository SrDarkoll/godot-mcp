# Godot MCP Visual Capture & Session Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline unless the user requests delegation.

**Goal:** Permitir inspeccionar capturas PNG reales de los viewports 2D y 3D del editor mediante MCP, conservarlas por sesión y consultar su manifiesto con checkpoints visuales.

**Architecture:** Godot obtiene píxeles mediante API pública y devuelve PNG base64 por el bridge autenticado existente. Node valida la respuesta, asigna nombres, persiste imágenes y actualiza el manifiesto mediante una cola por sesión. MCP devuelve imagen y metadatos únicamente después de confirmar la persistencia.

**Tech Stack:** Node.js >=22, TypeScript ESM, npm workspaces, Zod v4, Vitest, MCP stdio, WebSocket loopback, GDScript Godot 4.x; validación objetivo en Godot 4.6.3 para Windows.

---

## Registro de ejecución — 2026-09-05

La superficie del Plan 3 está implementada en la rama original, sin commit/push/merge. El desglose de abajo conserva las instrucciones del plan; este registro distingue la evidencia ejecutada de la propuesta inicial.

- [x] Contratos públicos estrictos y esquemas de artefactos/manifiesto.
- [x] Manifiesto serializado con publicación atómica, cierre idempotente y protección de rutas.
- [x] PNG exclusivos, secuencias persistidas, SHA-256 y checkpoints; conservación ante fallo de publicación.
- [x] Despacho diferido con polling activo, capacidades gráficas y límite de transporte.
- [x] Captura nativa 2D/3D con render solicitado y deadline.
- [x] Herramientas MCP con contenido de imagen y consulta local del manifiesto.
- [x] Metadatos de handshake persistidos antes de habilitar RPC, cierre y reconexión del mismo editor.
- [x] Tests unitarios, headless, gráficos, decodificación real e inspección de PNG.
- [x] Guías de uso/protocolo y comandos reproducibles de verificación.

Resultados y límites: [informe de validación](../../testing/2026-09-05-visual-capture-validation.md).

Ajustes basados en pruebas: `RenderingServer.force_draw(false)` es necesario cuando el editor oculto sigue procesando pero no dibuja; se esperan dos frames y se mantiene el deadline. El descriptor se comprueba también durante una conexión pendiente para no quedarse en el puerto de la sesión anterior. Se añadió CRC por chunk al validar PNG y una textura de ruido determinista para probar mensajes superiores a 64 KiB. El cierre se prueba también con EOF de stdin en un proceso Node real. Estos cambios no amplían el alcance a control visual de periféricos ni runtime.

## Base comprobada y alcance

El 2026-09-05 se comprobó `HEAD=7e0b327`, rama `feat/foundation-editor-handshake` y árbol limpio antes de escribir este documento. Los resultados históricos de los planes 1 y 2 son contexto de traspaso; no equivalen a pruebas ejecutadas durante esta planificación.

Referencias leídas: especificación `docs/superpowers/specs/2026-09-05-godot-mcp-design.md`, ambos planes anteriores, `docs/architecture/foundation.md` y `docs/protocol/foundation-rpc.md`. No había herramientas del grafo disponibles; se verificaron directamente los archivos relevantes.

La especificación aprobada ya define la arquitectura. Este documento concreta su siguiente entrega:

- Nombres públicos solicitados: `visual.capture_viewport_2d`, `visual.capture_viewport_3d`, `session.manifest`.
- Los nombres ilustrativos `visual.capture_editor_2d/3d` de la sección 40 se documentarán como sustituidos por los anteriores; no crear aliases adicionales.
- El antiguo Plan 1 agrupaba runtime, debugger y visual en un Plan 3. Este traspaso separa captura del editor y artefactos; runtime, `visual.capture_game`, transacciones y rollback permanecen para hitos posteriores.
- Un checkpoint visual referencia una captura persistida, no una instantánea recuperable del proyecto. No implementar `checkpoint.restore` ni fingir transacciones activas.
- Captura explícita por solicitud; registrar motivos de checkpoint sin añadir capturas automáticas a cada mutación. Los disparadores de la política completa de la sección 41 se integrarán con runtime/transacciones en sus hitos.

Restricciones: Windows, Godot 4.x con capacidades negociadas, una instancia/proyecto activo, `127.0.0.1`, token efímero, stdout exclusivo para MCP, cero simulación de periféricos, cero borrado automático de capturas. No ejecutar push ni merge. Este documento no autoriza commits durante la planificación; al ejecutar, conservar la rama y revisar el diff antes de cualquier commit local solicitado.

## Decisiones técnicas

Se elige PNG base64 por RPC frente a escritura directa desde Godot: concentra rutas y manifiesto en Node y evita aceptar rutas de salida del cliente. La escritura directa evita expansión base64 pero divide la propiedad de archivos y hace más difícil confirmar consistencia. No se incorpora captura del escritorio ni un viewport recreado: deben ser los píxeles del editor solicitado.

API pública de referencia: [EditorInterface 4.6](https://docs.godotengine.org/en/4.6/classes/class_editorinterface.html), métodos `get_editor_viewport_2d`, `get_editor_viewport_3d(idx)` y `set_main_screen_editor`. Para leer la textura después del render, usar la señal `RenderingServer.frame_post_draw` descrita en [Viewport 4.6](https://docs.godotengine.org/en/4.6/classes/class_viewport.html). La disponibilidad documental no sustituye la prueba real en el ejecutable objetivo.

La captura activará explícitamente la pestaña `2D` o `3D` mediante `set_main_screen_editor`; documentar este efecto. No guardar escenas, modificar cámaras ni alterar nodos para obtener la captura. Una escena sin guardar puede tener `scene=null`; la ausencia de raíz devuelve `NO_OPEN_SCENE`.

`--headless` no es evidencia de render del editor: devolver `CAPTURE_UNSUPPORTED` antes de esperar frames. Las capacidades se calculan con método disponible y display no headless; la disponibilidad del viewport concreto se comprueba en cada solicitud. En Godot 4.x sin API, usar llamadas dinámicas protegidas con `has_method`, nunca una referencia estática a una API ausente.

## Contratos fijados

Crear `packages/protocol/src/visual.ts` con esquemas Zod estrictos y tipos derivados mediante `z.infer`; exportarlos desde `index.ts`.

```ts
import * as z from 'zod/v4';

export const VisualReasonSchema = z.enum([
  'manual_request', 'after_visual_change', 'after_visual_fix',
  'before_major_change', 'after_major_change', 'on_error'
]);
export const Capture2DParamsSchema = z.strictObject({
  label: z.string().trim().min(1).max(80).default('capture'),
  reason: VisualReasonSchema.default('manual_request'),
  checkpoint: z.boolean().default(false)
});
export const Capture3DParamsSchema = Capture2DParamsSchema.extend({
  viewport_index: z.number().int().min(0).max(3).default(0)
});
export const CapturePayloadSchema = z.strictObject({
  png_base64: z.string().min(1).max(22369624),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  scene: z.string().nullable(),
  captured_at: z.iso.datetime(),
  viewport_index: z.number().int().min(0).max(3).nullable()
});
```

El esquema 2D rechaza `viewport_index`. No aceptar rutas, session IDs, transaction IDs ni texto ejecutable como entrada pública. RPC solo recibe `{}` para 2D y `{viewport_index}` para 3D; `label`, `reason` y `checkpoint` son metadatos de Node. Tiempo máximo de render: 2 segundos; timeout RPC visual: 5 segundos existente. Tamaño PNG máximo: 16 MiB; si el viewport excede 4096 por eje o el PNG excede el límite, rechazar, sin reducir la imagen silenciosamente.

Tipos públicos nuevos en `packages/protocol/src/session-artifacts.ts`:

```ts
export interface ScreenshotRecord {
  id: string;                 // UUID generado por Node
  sequence: number;           // creciente por sesión; huecos permitidos
  type: 'editor_2d' | 'editor_3d';
  path: string;               // relativo al directorio de sesión, separadores '/'
  scene: string | null;
  reason: string;             // validar con VisualReasonSchema
  label: string;
  transaction: null;          // reservado; no hay gestor de transacciones todavía
  timestamp: string;          // captured_at de Godot en UTC
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  viewportIndex: number | null;
}
export interface VisualCheckpointRecord {
  id: string;
  kind: 'visual';
  screenshotId: string;
  timestamp: string;
  label: string;
}
export interface CaptureResult {
  sessionId: string;
  screenshot: ScreenshotRecord;
  checkpoint: VisualCheckpointRecord | null;
}
```

Añadir esquemas equivalentes, con `reason` enum, hashes de 64 caracteres hexadecimales, fechas UTC, enteros positivos y paths relativos restringidos. `SessionManifestSchema` conserva TODOS los campos que hoy crea `SessionStore.create`: `sessionId`, `projectRoot`, `startedAt`, `endedAt`, `godotVersion`, `addonVersion`, `protocolVersion`, `screenshots`, `transactions`, `checkpoints`, `errors`, `permissionChanges`. Añadir `manifestVersion: 1` y `nextScreenshotSequence: 1`. Las tres colecciones de dominios futuros admiten objetos JSON y permanecen vacías en esta entrega; no generar eventos ficticios. Errores visuales: `{timestamp, tool, code, message}` con texto controlado, sin token ni base64.

`session.manifest` recibe `{}` y devuelve `{manifest}` de la sesión actual, incluso sin editor. No permite leer otras sesiones/rutas. La captura devuelve `structuredContent: CaptureResult` y `content` con texto JSON más `{type:'image', mimeType:'image/png', data: png_base64}`. El manifiesto nunca contiene base64. No registrar herramientas futuras.

Errores nuevos documentados: `CAPTURE_UNSUPPORTED`, `VIEWPORT_UNAVAILABLE`, `CAPTURE_TIMEOUT`, `CAPTURE_FAILED`, `CAPTURE_TOO_LARGE`, `INVALID_CAPTURE_PAYLOAD`, `ARTIFACT_WRITE_FAILED`, `MANIFEST_WRITE_FAILED`, `SESSION_CLOSED`. Mantener `EDITOR_NOT_CONNECTED`, `NO_OPEN_SCENE`, `INVALID_REQUEST`. Usar `BridgeRpcError` para conservar códigos en `toolError`; no estrechar el esquema extensible existente.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/protocol/src/visual.ts`, `session-artifacts.ts`, `index.ts` | Contratos visuales, manifiesto y exportaciones |
| `packages/protocol/test/visual.test.ts`, `session-artifacts.test.ts` | Validación de entradas/salidas |
| `packages/server/src/session/session-store.ts` | Lectura, cola de escritura, actualización atómica y cierre |
| `packages/server/src/visual/screenshot-store.ts` | Validación de PNG, nombres, persistencia y checkpoints |
| `packages/server/src/tools/visual-tools.ts`, `session-manifest.ts` | Orquestación visual y lectura de manifiesto |
| `packages/server/src/mcp/create-server.ts`, `tool-result.ts` | Registro MCP y respuesta con imagen |
| `packages/server/src/index.ts`, `bridge/bridge-server.ts` | Store único, metadatos de hello y shutdown |
| `packages/godot-addon/addons/godot_mcp/bridge/handlers/visual_handlers.gd` | Captura con API nativa y deadline |
| `packages/godot-addon/addons/godot_mcp/bridge/rpc_dispatcher.gd`, `bridge_client.gd` | Despacho diferido, correlación y capacidades |
| `packages/server/test/{session-store,screenshot-store,visual-tools,mcp-server,bridge-server}.test.ts` | Persistencia, fallos, transporte y regresión |
| `tests/integration/visual-capture-headless.test.ts`, `visual-capture.test.ts` | Errores headless y PNG reales con editor gráfico |
| `tests/integration/helpers/visual-harness.ts` | Procesos y proyecto de prueba persistente |
| `fixtures/visual-project/{project.godot,main_2d.tscn,main_3d.tscn}` | Escenas con geometría y colores reconocibles |
| `scripts/run-integration.mjs`, `package.json` | Selección de tier y ejecución secuencial |
| `docs/tools/visual-capture.md`, `docs/protocol/visual-capture-rpc.md`, `README.md` | Uso, contratos y límites comprobados |

Los nombres agrupados entre llaves representan archivos individuales. No mover módulos existentes ni reescribir los planes históricos.

## Tarea 1: Fijar contratos con pruebas rojas

- [ ] Crear los dos tests de protocolo. Casos: defaults; rechazo de índice negativo, 4 y fraccionario; campos desconocidos; etiqueta vacía; límite de base64; dimensiones cero; timestamp inválido; manifiesto vacío; checkpoint con captura; rechazo de path absoluto/traversal.

```ts
import { expect, it } from 'vitest';
import { Capture2DParamsSchema, Capture3DParamsSchema } from '../src/visual.js';
it('separa parámetros de 2D y 3D', () => {
  expect(Capture2DParamsSchema.parse({})).toEqual({
    label: 'capture', reason: 'manual_request', checkpoint: false
  });
  expect(Capture2DParamsSchema.safeParse({ viewport_index: 0 }).success).toBe(false);
  for (const viewport_index of [-1, 4, 0.5]) {
    expect(Capture3DParamsSchema.safeParse({ viewport_index }).success).toBe(false);
  }
  expect(Capture3DParamsSchema.parse({}).viewport_index).toBe(0);
});
```

- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/protocol -- test/visual.test.ts test/session-artifacts.test.ts`; esperar FAIL por módulos ausentes.
- [ ] Añadir los esquemas y tipos definidos arriba, incluido `SessionManifestSchema`, y exportarlos desde `index.ts`. Preservar `protocol=1`: son métodos aditivos.
- [ ] Repetir el comando; esperar PASS. Ejecutar `rtk npm run build --workspace @godot-mcp/protocol` para que los consumidores vean los nuevos exports.
- [ ] Revisar diff acotado antes de pasar a persistencia.

## Tarea 2: Manifiesto durable con un único escritor

- [ ] Ampliar `session-store.test.ts` con un proyecto temporal real: crear, leer, dos actualizaciones concurrentes, error de escritura, recuperación de cola y cierre repetido. Comprobar que recrear la misma sesión no trunca el manifiesto.

API a implementar sobre el `SessionStore` existente:

```ts
// SessionManifest es z.infer<typeof SessionManifestSchema>.
read(sessionId: string): Promise<SessionManifest>;
update(sessionId: string, mutate: (value: SessionManifest) => SessionManifest): Promise<void>;
finish(sessionId: string, endedAt: string): Promise<void>;
flush(): Promise<void>;
```

Test de concurrencia: iniciar dos `update`, uno añadiendo error con código `CAPTURE_TIMEOUT` y otro actualizando `godotVersion`; tras `Promise.all`, ambos cambios deben existir. Inyectar fallo de `rename` mediante un adaptador de filesystem interno probado; el JSON anterior debe seguir siendo válido y la siguiente actualización debe poder completarse.

- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/session-store.test.ts`; esperar FAIL por métodos ausentes.
- [ ] Implementar cola por sessionId: leer dentro de la cola, validar, escribir temporal exclusivo en el mismo directorio, sincronizar/cerrar y renombrar a `manifest.json`. Encadenar también después de un rechazo para no envenenar la cola. No borrar el manifiesto anterior antes de renombrar; no prometer atomicidad conjunta entre PNG y JSON.
- [ ] Validar sessionId con el formato generado por `createSession`, confirmar que los directorios canónicos están bajo el proyecto real, rechazar links/junctions que saquen el destino del proyecto. Usar creación exclusiva para el primer manifiesto. `finish` es idempotente y conserva todos los arrays; `flush` espera tareas pendientes.
- [ ] Repetir tests; esperar PASS. Eliminar únicamente temporales propios de JSON cuando sea seguro; nunca directorios de sesión o capturas.

## Tarea 3: Almacén PNG, secuencias y checkpoints

- [ ] Crear `screenshot-store.test.ts`. Usar un PNG fixture válido conocido y `mkdtemp`; no borrar las capturas generadas por estos tests. Imprimir en el runner la ruta de evidencia. Probar dos guardados simultáneos con misma etiqueta, reinicio del store en la misma sesión, nombre con `../../`, caracteres Windows, payload corrupto, sobredimensionado, fallo de disco y fallo al publicar manifiesto.

Interfaz del componente nuevo:

```ts
// CapturePayload y Capture2DParams provienen de los esquemas de la tarea 1.
export interface SaveCaptureInput {
  type: 'editor_2d' | 'editor_3d';
  payload: CapturePayload;
  metadata: Capture2DParams;
}
// constructor(session: Session, sessions: SessionStore)
// save(input: SaveCaptureInput): Promise<CaptureResult>
```

El test de éxito debe leer el PNG real, comparar sus bytes, recalcular SHA-256 y comprobar exactamente una entrada screenshot y un checkpoint cuando `checkpoint=true`. Un segundo guardado debe tener secuencia distinta y no cambiar los bytes del primero.

- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/screenshot-store.test.ts`; esperar FAIL.
- [ ] Implementar `ScreenshotStore.save` serializado por sesión. Validar base64 canónico antes de decodificar; comprobar firma PNG, IHDR de 13 bytes, dimensiones coincidentes, tamaño y estructura de chunks con IEND final. No aceptar un fichero solo por su extensión. SHA-256 se calcula con `node:crypto`.
- [ ] Generar el nombre con secuencia y slug: `screenshots/editor/0001_initial_level.png`. Slug: normalizar NFKD, quitar diacríticos, convertir a minúsculas, sustituir todo salvo `[a-z0-9_-]` por `_`, colapsar y limitar a 48 caracteres; fallback `capture`. El prefijo numérico evita nombres de dispositivo Windows. No usar la etiqueta original como ruta.
- [ ] Reservar secuencia persistentemente antes de escribir; usar creación exclusiva `wx`, `writeFile`, `sync` y `close`. Colisiones incrementan la secuencia; no sobrescribir. Un archivo incompleto por fallo se conserva sin entrada de éxito. Confirmar PNG y checkpoint juntos en una sola actualización de manifiesto después de cerrar el fichero.
- [ ] Si falla el manifiesto tras escribir PNG, conservarlo y devolver `MANIFEST_WRITE_FAILED`; no devolver éxito ni imagen. Registrar el fallo si el store vuelve a estar disponible. Documentar PNG huérfanos como evidencia recuperable, sin inventar checkpoint ni borrarlos automáticamente.
- [ ] Repetir tests; esperar PASS. Verificar conservación también después de cerrar/reabrir el store. Tests de junctions usan directorios temporales propios; si Windows no permite crearlos, informar el caso omitido.

## Tarea 4: RPC diferido sin bloquear el polling

- [ ] Crear el tier `visual-capture-headless.test.ts` y ampliar integración del dispatcher: solicitar captura seguida de `project.info`, enviar dos solicitudes y desconectar/reconectar durante una espera. Los métodos del Plan 2 deben mantener resultados y errores.
- [ ] Ejecutar el test focal con Godot; antes de implementar debe fallar con `METHOD_NOT_FOUND`, no con error de harness.
- [ ] Añadir rutas visuales al dispatcher y permitir esperar un resultado. El bridge debe mantener `_process` haciendo `poll()` mientras procesa una cola FIFO: una única coroutine consume solicitudes. Cada elemento conserva socket y generación autenticada; al reconectar, descartar cola antigua y no enviar una respuesta al socket nuevo. Limitar pendientes a 64 y devolver error estructurado de saturación.

Patrón del envío, dentro del consumidor, después de validar el sobre y la generación:

```gdscript
var response: Dictionary = await _dispatcher.dispatch(raw_text)
if request_socket == _socket and request_generation == _generation:
    if _socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
        _socket.send_text(JSON.stringify(response))
```

- [ ] Mantener respuestas correlacionadas con `request.id`; esperar un resultado síncrono del dispatcher también debe funcionar. No llamar una coroutine sin `await` desde otro punto. `stop` invalida generación y vacía cola; timers/conexiones de render se liberan al terminar.
- [ ] Añadir estado de autenticación explícito: no procesar RPC antes de `hello_ack`. No releer tokens como parte del manifiesto. Conservar las reglas de protocolo/proyecto/instancia existentes.
- [ ] Reejecutar handshake y mutación secuencialmente; esperar PASS antes de añadir lectura de textura. La espera visual no debe paralizar reconexión ni dejar respuestas duplicadas.

## Tarea 5: Captura nativa 2D/3D y capacidades

- [ ] Escribir casos de integración que exijan `CAPTURE_UNSUPPORTED` en headless, ausencia de PNG y disponibilidad posterior de `project.info`. Agregar casos directos de parámetros 3D inválidos, raíz ausente y viewport no disponible.
- [ ] Ejecutar `rtk proxy node node_modules/vitest/vitest.mjs run tests/integration/visual-capture-headless.test.ts --maxWorkers=1 --no-file-parallelism`; esperar FAIL antes del handler.
- [ ] Crear `visual_handlers.gd` con `handle_capture_viewport_2d/3d`. Antes de acceder al viewport: validar params, display, método y raíz. Activar pestaña mediante API. Obtener viewport con `call` protegido; índice 0–3 y resultado no nulo. Para viewport oculto/no activo devolver `VIEWPORT_UNAVAILABLE` si no produce frame antes del deadline, sin capturar otra vista.
- [ ] Esperar un frame dibujado NUEVO mediante callback a `RenderingServer.frame_post_draw` y timer independiente de 2 segundos. Usar un objeto de espera con resultado único; desconectar la señal al vencer el timer. No basta `await frame_post_draw` sin deadline, porque podría no emitirse. Revalidar instancia de viewport y raíz tras esperar; si cambió la raíz, devolver `CAPTURE_FAILED` y permitir reintento del cliente.
- [ ] Obtener `viewport.get_texture().get_image()`, rechazar imagen nula/vacía, validar dimensiones, convertir formato a RGBA8 y codificar `save_png_to_buffer()`. Rechazar resultado vacío o mayor de 16 MiB. Construir `CapturePayload`: timestamp UTC con sufijo `Z`, ruta de escena nullable y el índice real. Ninguna escritura de archivos en Godot.

Núcleo de codificación después de las guardas y la espera:

```gdscript
var image: Image = viewport.get_texture().get_image()
image.convert(Image.FORMAT_RGBA8)
var png: PackedByteArray = image.save_png_to_buffer()
var encoded: String = Marshalls.raw_to_base64(png)
```

- [ ] Calcular `viewport2d/viewport3d` del hello usando API disponible Y display gráfico. Exponer getter de capacidades autenticadas en `BridgeServer`, devolviendo null tras desconexión; no cambiar el significado de `editor=true` en headless.
- [ ] Dimensionar explícitamente buffer saliente `WebSocketPeer` para el límite base64 + sobre (24 MiB) y comprobar error de `send_text`; limitar `maxPayload` de Node al mismo valor. Probar un payload superior al buffer anterior; no asumir que PNG pequeño demuestra transporte útil.
- [ ] Reejecutar test headless y chequeo de todos los scripts del addon instalado en el fixture. Esperar PASS y cero errores de parseo. El pase gráfico se completa en la tarea 8.

## Tarea 6: Herramientas MCP y lectura de manifiesto

- [ ] Crear `visual-tools.test.ts` con mocks de RPC y almacén: editor desconectado, capacidad ausente, payload inválido, error de disco, éxito 2D/3D. Verificar que `label` no cruza el bridge y que no se escribe si falla validación/captura.
- [ ] Añadir a `mcp-server.test.ts` lista de las tres herramientas, llamada de `session.manifest` sin editor, rechazo de parámetros y respuesta de captura con bloque de imagen. Las instancias de `createMcpServer` recibirán un store inicializado; actualizar todos sus callsites de tests.
- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/visual-tools.test.ts test/mcp-server.test.ts`; esperar FAIL.
- [ ] Implementar orquestación: comprobar conexión, capacidades, validar params, invocar RPC, parsear `CapturePayloadSchema`, persistir, responder. Toda la captura se serializa en una cola visual para impedir crecimiento de memoria por respuestas PNG simultáneas. No aplicar retries automáticos que produzcan duplicados.
- [ ] Añadir helper de resultado visual manteniendo `toolSuccess` para herramientas existentes:

```ts
export function toolImageSuccess(value: CaptureResult, data: string) {
  return {
    ...toolSuccess(value),
    content: [
      { type: 'text' as const, text: JSON.stringify(value, null, 2) },
      { type: 'image' as const, mimeType: 'image/png', data }
    ]
  };
}
```

- [ ] `session.manifest` espera actualizaciones pendientes y lee el JSON validado; no hace RPC ni crea otra sesión. Si hay fallo visual registrar error con código, herramienta y mensaje controlado; fallo del registro no oculta el error original.
- [ ] Reejecutar tests; esperar PASS. Verificar compatibilidad real del bloque `image` con el SDK instalado usando transporte MCP en memoria del test existente.

## Tarea 7: Integración del ciclo de sesión

- [ ] Ampliar tests de bridge/store: hello aceptado actualiza versiones; hello rechazado no altera manifiesto; desconexión no cierra sesión; cierre normal registra `endedAt`; una captura en curso finaliza o falla antes de cerrar.
- [ ] Ejecutar `rtk npm run test --workspace @godot-mcp/server -- test/bridge-server.test.ts test/session-store.test.ts`; esperar FAIL en las nuevas expectativas.
- [ ] En `index.ts`, conservar una instancia de `SessionStore` y `ScreenshotStore`, pasarlas al contexto MCP y agregar callback de hello autenticado a `BridgeServerOptions`. El callback actualiza exclusivamente versiones mediante la cola. Manejar su rechazo explícitamente, sin promesas rechazadas sin observar.
- [ ] Al apagar, dejar de aceptar capturas, esperar la cola visual con el deadline del RPC, cerrar el bridge, persistir `endedAt` y hacer `flush`; cerrar stdio y quitar descriptor aun si falla una etapa usando bloques `try/finally` separados. No eliminar sesiones. Cierre abrupto puede dejar `endedAt=null`; no inventar timestamp al reiniciar.
- [ ] Reejecutar tests y comprobar que ningún flujo de captura introduce salida ordinaria en stdout del servidor.

## Tarea 8: Integración gráfica con PNG verificable

- [ ] Crear `fixtures/visual-project` con `main_2d.tscn` (Polygon2D rojo y otro verde, visibles alrededor del origen) y `main_3d.tscn` (BoxMesh grande, material unshaded rojo y suelo verde). Mantener recursos embebidos, sin assets externos. Crear `visual-harness.ts` reutilizando el patrón MCP stdio e `initProject` de la integración existente.
- [ ] Los proyectos de captura se crean en una ruta persistente bajo `.godot-mcp/visual-test-runs/<run-id>/`; no reutilizar el `afterEach rm` de `editor-mutation.test.ts`. Imprimir ruta del proyecto/manifiesto, detener únicamente procesos creados por el test y conservar todos los PNG incluso al fallar.
- [ ] Añadir `test:integration:visual` al root y selector `--visual` al runner. El runner normal excluye `visual-capture.test.ts`; ambos tiers se ejecutan con `--maxWorkers=1 --no-file-parallelism` para no abrir instancias simultáneas. El visual exige Windows, `GODOT_BIN` y `GODOT_VISUAL_INTEGRATION=1`; si falta requisito termina con error explicativo, nunca PASS por skip.
- [ ] Iniciar Godot con `--editor --path <fixture> --rendering-method gl_compatibility res://main_2d.tscn`, sin `--headless` ni inputs simulados. Esperar handshake y raíz con timeout, capturar 2D, abrir escena 3D por RPC, capturar índice 0, volver a 2D y cambiar el color de un polígono mediante `node.set_property` antes de recapturar.
- [ ] Ejecutar inicialmente `rtk npm run test:integration:visual`; esperar FAIL hasta completar las aserciones y ajustes del handler, sin relajar una captura inválida a resultado aceptado.
- [ ] Comprobar en cada éxito: bloque MCP imagen decodifica al mismo PNG guardado, SHA-256 coincide, dimensiones >0, manifiesto referencia ruta existente, secuencias únicas, checkpoint enlaza ID correcto. Decodificar con Godot `Image.load` en un proceso posterior al cierre del editor y comprobar que hay píxeles rojos/verdes de la fixture; entre cambios comprobar modificación de la región de color, no solo desigualdad del fichero.
- [ ] Cerrar cliente/servidor limpiamente, leer manifiesto de disco con `endedAt` y comprobar que los PNG siguen existiendo. Reiniciar servidor con mismo proyecto: nueva sesión, capturas previas intactas. No exigir hashes idénticos entre máquinas.
- [ ] Abrir los PNG generados para inspección visual: contenido reconocible, orientación correcta, sin imagen negra/vacía. Registrar versiones reales y renderer. Si el entorno gráfico no renderiza, declarar este tier bloqueado/no verificado y conservar evidencia; no sustituirlo con screenshot del escritorio ni por render headless.

## Tarea 9: Documentación y cierre verificable

- [ ] Escribir `docs/tools/visual-capture.md`: nombres canónicos, ejemplos 2D/3D, cambio de pestaña, límites, ausencia de render headless, rutas persistentes, lectura de manifiesto y significado limitado del checkpoint visual.
- [ ] Escribir `docs/protocol/visual-capture-rpc.md`: parámetros, payload de imagen, errores, límites, timeout, capacidades, entrega MCP y comportamiento ante PNG huérfano. Actualizar README y añadir enlace desde docs de foundation indicando que describen el hito histórico.
- [ ] Comprobar todos los scripts GDScript desde un proyecto que tenga el addon instalado en `res://addons/godot_mcp`: ejecutar `--headless --editor --path <fixture> --quit` para importar, y `--headless --path <fixture> --check-only --script res://addons/godot_mcp/plugin.gd`; repetir `--check-only` para cada `.gd` del addon. Invocar el ejecutable a través de `rtk proxy` y exigir código 0 más ausencia de errores GDScript en stderr. El comando aislado sobre el repositorio puede fallar al resolver preloads `res://`; no confundir ese fallo de montaje con un bug del script.
- [ ] Ejecutar desde la raíz, con `GODOT_BIN` apuntando al Godot 4.6.3 local y `REQUIRE_GODOT_INTEGRATION=1`:

```powershell
rtk npm run build
rtk npm run typecheck
rtk npm test
rtk npm run test:integration
rtk npm run test:integration:visual
rtk git diff --check
rtk git status --short
```

- [ ] Esperar todos los comandos con salida 0, tests visuales realmente ejecutados, cero parse errors y evidencia PNG inspeccionada. Reportar conteos reales; no congelar los 83 tests históricos. Mantener explícito cualquier skip o limitación de versión/renderer.
- [ ] Revisar el diff: cambios solo del Plan 3, sin dependencias innecesarias, tokens/base64/artefactos personales fuera del código versionado, sin borrar capturas y sin alterar contratos existentes. No push ni merge.

## Criterios de aceptación y trazabilidad

| Requisito | Tareas / evidencia |
|---|---|
| Captura del editor 2D y 3D real | 4–6, 8: imagen MCP, PNG decodificado e inspección visual |
| APIs nativas, compatibilidad y capacidades | 4–5: headless rechazado, API protegida, sintaxis real |
| Captura después de render con timeout | 4–5, 8: frame nuevo, reconexión y cambio de color |
| Persistencia organizada por sesión | 2–3, 8: nombres únicos, hashes y supervivencia al cierre |
| Checkpoints visuales y manifiesto | 1–3, 6–8: referencias válidas y consulta sin editor |
| Paths bajo proyecto y una instancia | 2–4, 8: traversal/junction, colas y runner secuencial |
| Sin regresiones de planes 1 y 2 | 4, 7, 9: suite completa y chequeo GDScript |
| Alcance futuro visible | Introducción, 9: runtime/transacciones/política automática diferidos |

Plan terminado cuando se revisa este documento; implementación terminada únicamente cuando se cumplen las evidencias anteriores. Ninguna casilla se marca completada por escribir el plan.
