import { router } from './server.ts';

const PORT = Number(Deno.env.get('MANDY_PORT') ?? 9130);

// Bound to loopback on purpose: the file API can read and write anywhere the
// user can, so it must never be reachable from the network.
Deno.serve({ port: PORT, hostname: '127.0.0.1' }, router.fetch);
console.log(`Mandy running on http://localhost:${PORT}`);
