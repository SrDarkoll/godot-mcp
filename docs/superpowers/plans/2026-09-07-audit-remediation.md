# Auditoría: ejecución integral

**Objetivo aprobado:** aplicar todos los hallazgos, refuerzos y ampliaciones del informe `docs/testing/2026-09-07-project-audit.md`. Ese informe contiene el diseño y los criterios de aceptación aprobados por «Procede con todos».

**Arquitectura:** conservar MCP stdio, protocolo tipado y addon nativo; centralizar las políticas compartidas y el mantenimiento del proyecto. Entregar bloques verificables sin reducir el objetivo a un subconjunto. Trabajar sobre la rama existente conservando sus cambios; no integrar Git ni publicar de forma implícita.

**Tecnologías:** TypeScript, Vitest, Godot 4.6.3/GDScript, PowerShell, Node 22+.

## Registro de requisitos

Un bloque se marca completo únicamente con evidencia de sus criterios del informe. Los resultados históricos de la auditoría son la línea base, no la validación final.

- [x] A1: reflexión por ámbito/clase/método, cierre de invocación indirecta, confianza explícita para scripts; pruebas Node y Godot.
- [x] A2: exclusión de escritores cooperantes, precondiciones por archivo, preservación de cambios externos, pruebas de concurrencia y caída, límites de aislamiento documentados.
- [x] A3: status/stop/doctor independientes de configuración inválida y reparación conservadora.
- [x] A4: instalador CI con ejecución esperada, timeout y exit code fiable; validar instalación completa y fallos.
- [x] A5: barrera común para init/update/transacciones; actualización recuperable ante fallo parcial y backup completo.
- [x] A6: README, instalación, actualización, compatibilidad, changelog, contribución, seguridad y release sincronizados; verificación desde consumidor limpio.
- [x] R1: catálogo tipado único de herramientas, políticas/capacidades y documentación; cobertura exhaustiva del registro.
- [x] R2: serialización con límites de profundidad/elementos/bytes/ciclos en editor y runtime.
- [x] R3: refactor de política y recuperación en unidades legibles y transiciones exhaustivas.
- [x] R4: métricas de latencia/colas/desconexiones/memoria/bytes, cuotas informativas y exportación sin eliminación automática.
- [x] R5: pruebas adversas de disco/acceso/caídas/reinicio/editor/ciclos/tamaño y matriz explícita de compatibilidad.
- [x] N1: project.validate headless con diagnósticos estructurados, timeout y límites.
- [x] N2: diff de transacciones de texto/binarios/creación/eliminación con control de datos sensibles.
- [x] N3: lotes de ediciones estructuradas con precondiciones y undo/recuperación definidos.
- [x] N4: eventos de proyecto con cursor, reconexión y backpressure.
- [x] N5: importación/dependencias/referencias rotas y comprobaciones antes de mover/eliminar recursos.
- [x] N6: comparación visual determinista y presupuestos de rendimiento entre ejecuciones.
- [x] Cierre: auditoría requisito por requisito, build/typecheck/unitarias/GDScript/integración/visual/runtime/distribución y evidencia final.

## Primer bloque: A1 y operación CLI/CI

Archivos: `packages/server/src/security/tool-policy.ts`, nuevo módulo de reflexión, `bridge/safety_policy.gd`, `bridge/handlers/object_handlers.gd`, CLI runner/doctor/config, instalador PowerShell. Pruebas: policy, reflexión nativa aislada y ciclo de CLI.

1. Agregar casos que exijan `SAFETY_VIOLATION` para call/callv/call_deferred/set_deferred/emit_signal y rechacen destinos fuera de la escena. Verificar rojo con Vitest y Godot headless.
2. Sustituir blacklist abierta por métodos nativos permitidos y scripts de confianza explícita, sin habilitar invocadores indirectos. Mantener confirmación de operaciones reflectivas y restringir object_id al proyecto/escena.
3. Ejecutar caso existente de CLI corrupta para verificar rojo. Mover lectura de config a comandos dependientes y dejar doctor recoger errores de esquema.
4. Reproducir verificación fallida del ejecutable GUI. Cambiar a proceso de consola con espera/timeout y verificar el instalador completo.
5. Ejecutar pruebas focalizadas y registrar resultados antes de continuar A2/A5; no marcar A1 completo sin verificar también ámbito y confianza de scripts.

## Verificación por bloque

Agregar primero una regresión que falle por el defecto o comportamiento ausente; implementar, ejecutar la regresión y el conjunto afectado. Añadir pruebas de integración reales para comportamiento nativo y pruebas de procesos para recuperación/CI. Las pruebas de fallos se ejecutan sobre fixtures desechables retenidos; nunca sobre el editor/proyecto personal.

## Evidencia de ejecución

2026-09-08: A1/A3/A4 implementados y comprobados. A2 avanzó con precondiciones por escritura, compensación y backup de recuperación forzada; queda abierto hasta añadir exclusión entre procesos y pruebas de caída. Evidencia detallada: `docs/testing/2026-09-08-hardening-progress.md`.

135 unitarias, 12 integraciones base, tipos, 24 scripts Godot y distribución externa aprobados. No se declara terminado el objetivo integral. Próximo bloque: frontera común de mantenimiento A2/A5; conservar el límite documentado de concurrencia con escritores no cooperantes.

2026-09-08, segundo bloque: A2/A5 verificados con exclusión IPC por proyecto, compensación/reanudación de actualización y pruebas de caída reales. Evidencia: `docs/testing/2026-09-08-maintenance-progress.md`; límites: `docs/tools/project-maintenance.md`. 150 unitarias, 13 integraciones base y distribución externa pasan. El alcance A6/R1–R5/N1–N6 y el cierre integral siguen pendientes.

2026-09-08, tercer bloque: A6/R1/R2 implementados y verificados. Catálogo de 94 herramientas y esquemas reales, límites de serialización/recorridos nativos y documentación consolidada. Evidencia: `docs/testing/2026-09-08-catalog-serialization-progress.md`. Quedan R3–R5, N1–N6 y cierre integral; no reducir el objetivo a los bloques ya completados.

2026-09-08, cuarto bloque: R3/R4 verificados; responsabilidades críticas separadas, transiciones exhaustivas, métricas y exportaciones retenidas. Catálogo: 96 herramientas. Evidencia: `docs/testing/2026-09-08-core-observability-progress.md`. Quedan R5, N1–N6 y cierre; siguiente implementación: validación headless y diff de transacciones, sin olvidar el resto del alcance.

2026-09-08, quinto bloque: N1/N2 verificados con Godot real y consumidor de paquetes externo. Validación de copia retenida, timeout, cambios durante importación, colisión del método reload y diffs acotados/redactados. Evidencia: `docs/testing/2026-09-08-validation-diff-progress.md`. Quedan R5, N3–N6 y cierre integral. Incluir en R5 una comprobación de reflexión sobre recursos Script con nombres de métodos nativos, además de la matriz de fallos/compatibilidad pendiente.

2026-09-12, cierre: R5 y N3–N6 implementados y verificados. El catálogo contiene 107 herramientas. Node 22.13.0 y Node 24.20.0 pasan 173 pruebas unitarias, 19 integraciones base y distribución externa; Node 22 también pasa 2 pruebas visuales y 7 de runtime. Evidencia completa: `docs/testing/2026-09-12-final-audit-remediation.md`. Todos los requisitos de este plan están cubiertos; GitHub Actions remoto permanece como validación externa no ejecutada y no se presenta como aprobado.
