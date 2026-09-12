# Auditoría final y remediación completa — 2026-09-12

## Dictamen

Los seis hallazgos A1–A6, cinco refuerzos R1–R5 y seis ampliaciones N1–N6 de la auditoría del 7 de septiembre están implementados y verificados en el árbol de trabajo actual. El proyecto queda como pre-alpha avanzada con una base de seguridad, recuperación, observabilidad, distribución y automatización considerablemente más fuerte. La etiqueta pre-alpha sigue siendo adecuada: no existe aún una publicación npm/tag ni una ejecución remota de GitHub Actions que deba confundirse con esta validación local.

Base Git observada: rama `feat/foundation-editor-handshake`, HEAD `7e0b327`. El trabajo posterior permanece en el árbol de trabajo y no está representado solo por HEAD. No se ejecutaron staging, commits, push, tags, publicación ni merge.

El grafo de Codebase Memory no estuvo disponible durante esta ejecución. Las afirmaciones se basan en código fuente actual, catálogos generados, pruebas focalizadas, integraciones reales, artefactos retenidos y distribuciones instaladas fuera del checkout.

## Cobertura de requisitos

| Requisito | Evidencia actual |
|---|---|
| A1 reflexión | Allowlist nativa por clase, bloqueo de dispatch indirecto, ámbito de escena/recurso, permiso `editor.script_methods` y confirmación. Regresiones Node, Godot aislado y MCP/editor. Los recursos Script y métodos homónimos de APIs nativas se rechazan o se enlazan estáticamente. |
| A2 concurrencia | Lease IPC por proyecto, precondiciones por archivo, creación exclusiva, compensación, recuperación forzada ligada a su checkpoint y siete puntos de caída real. Límite de escritor externo no cooperante documentado. |
| A3 CLI/config | `status`/`stop` sobreviven JSON/esquema inválido; `doctor` informa checks independientes; `config --repair` conserva bytes originales y claves desconocidas. |
| A4 CI Godot | Descarga y SHA-256 fijados; extracción segura; ejecutable de consola con stdout/exit/timeout fiable; instalación completa probada localmente. |
| A5 addon | Barrera compartida, update journal con blobs before/after, versiones, archivos nuevos, compensación, reanudación tras SIGKILL y conflictos externos fail-closed. |
| A6 entrega | README y READMEs de paquetes, instalación, compatibilidad, seguridad, contribución, changelog y release. Verificador recursivo confirma enlaces. |
| R1 catálogo | Las 107 herramientas registradas coinciden exactamente con el catálogo tipado, sus schemas MCP reales, permisos, riesgo y capacidades. Herramientas desconocidas fallan cerradas. |
| R2 serialización | Ciclos, profundidad, elementos, strings/bytes, valores no finitos, escenas y filesystem acotados; argumentos se rechazan antes de mutar. |
| R3 mantenibilidad | AuditLog, ConfirmationStore, RecoveryJournal, RecoveryValidator, catálogo y transiciones exhaustivas separados; replay de estados intermedios probado. |
| R4 observabilidad | `session.metrics` y `session.export`: latencias, colas, memoria, desconexiones, inventario/cuotas informativas, hashes e inclusión explícita sin borrado. |
| R5 adversarial | Disco/rename/open fallidos, enlaces/junctions/hardlinks, procesos muertos, restarts/reconexión, ciclos, límites, configuración corrupta y matrices Node 22/24. Las pruebas de editor conservan sus proyectos/evidencia. |
| N1 validación | `project.validate` importa y valida una copia retenida, con deadline, límites, diagnósticos, tipos no cubiertos y detección de modificaciones internas. |
| N2 diff | `transaction.diff` cubre texto, creación/eliminación, binarios, newline/BOM, límites y redacción heurística; no publica staged bytes. |
| N3 lotes | Preview con fingerprint, 1–64 operaciones, aliases, propiedades nativas, jerarquía, una acción Undo/Redo, postcondiciones, inversos y rollback verificado/manual-recovery explícito. |
| N4 eventos | `project.events` con cursores del servidor, long-poll, reconnect, buffer de 1,000, 16 waiters, coalescing/buffer nativo y conteos separados de pérdidas. |
| N5 dependencias | Grafo directo/transitivo, UIDs/fallbacks, rotas, impacto inbound/target/links/truncation e importación confirmada con evento. `resource.impact` es el preflight para move/delete; no realiza la mutación. |
| N6 comparación | `visual.compare` verifica manifest/hash, decodifica PNG acotado, compara píxeles y conserva diff. Snapshots/performance compare usan ratios aportados por el cliente; cero baseline y muestras no finitas están definidos. |

## Regresión final Node 22

Dependencias restauradas con `npm ci`: 68 paquetes instalados, 73 auditados, 0 vulnerabilidades reportadas por npm en esa ejecución. Esto no sustituye el modelo de confianza documentado para scripts/proyectos.

Evidencia: `.godot-mcp/distribution/final-validation-20260912-120455/report.json` y logs contiguos.

| Gate | Resultado |
|---|---|
| Node | 22.13.0 |
| `npm run typecheck` | PASS |
| `npm test` | PASS: protocolo 21, servidor 138, CLI 14; total 173 |
| `npm run check:catalog` | PASS: 107 herramientas |
| `npm run check:docs` | PASS: 43 Markdown |
| `npm run check:godot` | PASS: 27 scripts addon + Logger generado |
| `npm run test:integration` | PASS: 19 |
| `npm run test:integration:visual` | PASS: 2; incluye comparación sobre PNG real |
| `npm run test:integration:runtime` | PASS: 7; incluye snapshots y presupuesto relativo |
| `npm run test:distribution` | PASS |
| `git diff --check` | PASS |

Distribución Node 22: `.godot-mcp/distribution/0.1.0-62f4ec1d`; consumidor externo `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-LUltoW`.

Después del bloque final se añadió una aserción adicional de ciclo jerárquico al test ya existente `scene-batch.test.ts`; el caso focalizado volvió a pasar. No cambió código de producción.

## Matriz Node 24

Node 24.20.0 se descargó de la distribución oficial y se verificó con el checksum oficial. Evidencia: `.godot-mcp/distribution/node-matrix/verification.json` y `matrix-report.json`.

Pasaron `test` (173), `typecheck`, `check:catalog`, `check:docs`, `test:integration` (19) y `test:distribution`. Distribución: `.godot-mcp/distribution/0.1.0-8ec8576e`; consumidor `C:\Users\ramir\AppData\Local\Temp\godot-mcp-consumer-ZQlrMi`.

El consumidor instalado fuera del repositorio comprobó ayuda CLI, init del addon, receta Codex sin editar perfil, session.status, métricas, export con hashes, status/stop autenticado, registro avanzado, diff sin publicación y validación headless.

## Límites materiales conservados

- Los permisos MCP no son un sandbox de Node/Godot ni del código del proyecto.
- El lease coordina procesos Godot MCP. Un editor externo puede escribir en la ventana posterior a la última comprobación optimista del filesystem.
- Las transacciones multiarchivo son recuperables; no son atómicamente visibles para procesos ajenos.
- El preflight de dependencias no encuentra referencias semánticas arbitrarias dentro de texto/custom loaders y no ejecuta move/delete.
- Comparación visual es exacta por píxel; no alinea imágenes ni calcula similitud perceptual.
- Presupuestos de rendimiento requieren condiciones comparables y no establecen umbrales absolutos portables entre hardware.
- La ejecución remota de GitHub Actions y el runner gráfico self-hosted no se realizaron desde este checkout. Los workflows están listos, pero ese estado externo no se presenta como validado.

No quedaron procesos Godot de las pruebas al finalizar. Los proyectos, capturas, logs, snapshots, diffs y reportes de prueba se conservaron en las carpetas ignoradas de `.godot-mcp`; no se limpiaron automáticamente.
