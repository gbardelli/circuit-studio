# Seguridad

## Cómo informar de una vulnerabilidad

No abras un issue público. Usa **Security → Report a vulnerability** en este repositorio
(avisos de seguridad privados de GitHub). Responderé lo antes posible.

## Secretos

- Las claves (`CLERK_SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`…) viven solo en variables de
  entorno del despliegue y en `.env.local`, que está en `.gitignore`. Ver `.env.example`.
- La clave pública de Clerk (`VITE_CLERK_PUBLISHABLE_KEY`) es pública por diseño.
- Si ves una credencial real en el código o en el historial, avísame por el canal privado de
  arriba: la rotaré de inmediato.

## Alcance

El servidor local (`npm run dev`) no tiene autenticación: está pensado para un solo equipo
o una red de confianza. En el despliegue con Clerk se comprueban sesión y rol en `api/`.
