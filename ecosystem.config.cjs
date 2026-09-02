// pm2 process definition for the Mandy file server.
//
// Must stay .cjs: package.json sets "type": "module", and pm2 loads ecosystem
// files as CommonJS.
//
// Runs `deno run` directly rather than `deno task start`, so pm2 supervises the
// server process itself instead of a wrapper that spawns it — otherwise stop
// and restart can leave the real server orphaned and holding the port.

module.exports = {
  apps: [
    {
      name: "mandy",
      script: "deno",
      interpreter: "none",
      args: [
        "run",
        "--allow-read",
        "--allow-write",
        "--allow-net",
        "--allow-sys=homedir",
        "--allow-env=MANDY_PORT",
        "server/src/main.ts",
      ],
      // The server resolves front/ relative to its own source file, so cwd is
      // not load-bearing; it is set here only so the script path resolves.
      cwd: __dirname,
      env: {
        MANDY_PORT: 9130,
      },
      autorestart: true,
      // Off deliberately: this serves your documents, and a restart mid-save is
      // not worth the convenience. Use `npm run dev` when editing Mandy itself.
      watch: false,
    },
  ],
};
