# MAXGRIFOS V2 NIS SPEC (2.0)

## Filosofía: Invisibilidad y Fluidez
El **Narrow Interactive System (NIS)** en su versión 2.0 deja de ser un panel de control visible para convertirse en una gramática gestual intuitiva.

## Gestos Universales
- **Swipe Derecha**: Volver al contexto anterior (equivale a "Atrás" pero con transición visual fluida).
- **Swipe Izquierda**: Avanzar en flujos secuenciales (si aplica).
- **Double Tap**: Acción rápida de guardado o expansión de detalle.
- **Long Press**: Menú de opciones contextuales (uso moderado).

## Seguridad Operativa
- El NIS **no puede** confirmar acciones críticas (Facturar, Borrar, Despachar) de forma accidental.
- Si un proceso está incompleto, el gesto de salida genera un Toast:
  > *"Finaliza, guarda o cancela el proceso antes de salir."*

## Feedback Visual
- Los Swipes deben tener un indicador visual de "arrastre" (pull-to-action) sutil con colores de acento neon.
