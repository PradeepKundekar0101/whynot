// PM2 process file for the API/socket server.
// Usage on the droplet:
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "whatnot-server",
      script: "dist/index.js",
      cwd: __dirname,
      // Single instance because socket.io + in-process workers + BullMQ.
      // Scale horizontally later via Redis adapter (already wired) on multiple droplets.
      instances: 1,
      exec_mode: "fork",
      node_args: "-r dotenv/config",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "600M",
      out_file: "/var/log/whatnot/server.out.log",
      error_file: "/var/log/whatnot/server.err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
