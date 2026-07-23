# @nuxt-laravelize/dead-letter-operations

Consola Nuxt opcional y fail-closed para `@nuxt-laravelize/dead-letter`. Esta desactivada por defecto y nunca forma parte del preset Laravelize.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/dead-letter-operations'],
  laravelizeDeadLetterOperations: {
    enabled: true,
    allowedOrigins: ['https://operaciones.example.com'],
    pagePath: '/operations/dead-letters',
    apiPath: '/api/operations/dead-letters',
    pageSize: 25,
    errorSummaries: false,
  },
})
```

La aplicacion debe registrar adapters durante el boot en un service provider propio resolviendo `deadLetterAdapterRegistryToken`. El paquete no registra adapters ni abilities permisivas. Registra en Authorization: `dead-letters.list`, `dead-letters.view`, `dead-letters.view-payload`, `dead-letters.view-error-summary`, `dead-letters.retry`, `dead-letters.discard` y `dead-letters.retry-inbox` para reintentos del inbox de reliability. Las policies reciben contexto congelado `{ source }` para listados y `{ key }` para operaciones de item. Una ability ausente deniega el acceso.

El payload se obtiene con una peticion separada y nunca se renderiza por SSR. Las mutaciones exigen Origin exacto, POST JSON, `X-Laravelize-Operations: 1`, revision, confirmacion e ID de operacion del cliente. No existen endpoints bulk. Las pistas de tenant no se exponen.

Authorization recibe argumentos de contexto congelados: el source validado para listados y la clave exacta para cada item. Las abilities ausentes deniegan acceso. Las capabilities del bootstrap son solo pistas globales; el detalle devuelve capabilities especificas de la clave y cada endpoint vuelve a autorizar. Si se pierde una respuesta de mutacion, la consola conserva la peticion y el ID exactos sin reintentar automaticamente: el operador debe refrescar, reintentar la misma operacion o abandonarla explicitamente antes de confirmar una nueva.

Los origins deben ser HTTPS canonicos exactos; HTTP solo se acepta en loopback para desarrollo/tests. Protege esta interfaz global de operador con autenticacion y controles de red de la aplicacion.

[English](./README.md)
