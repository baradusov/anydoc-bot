// Kept in the repository so the process configuration is reviewable and
// survives the server, rather than living only in pm2's own state.
module.exports = {
  apps: [
    {
      name: 'anydoc',
      script: 'index.js',
      instances: 1,
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
