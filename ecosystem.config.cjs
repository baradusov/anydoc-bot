// Kept in the repository so the process configuration is reviewable and
// survives the server, rather than living only in pm2's own state.
module.exports = {
  apps: [
    {
      name: 'anydoc',
      script: 'index.js',
      // Fork, not cluster. `instances` alone puts pm2 in cluster mode, where a
      // reload starts the replacement before retiring the old process — and
      // two processes polling one bot token get 409 Conflict from Telegram.
      exec_mode: 'fork',
      autorestart: true,
      // A spreadsheet unfolding into Markdown is the one thing here that can
      // eat memory; restart rather than let the box swap.
      max_memory_restart: '300M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
