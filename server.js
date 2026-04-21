const config = require('./server/config');
const { createApp } = require('./server/app');

const app = createApp(config);

app.listen(config.port, '0.0.0.0', () => {
  console.log('Sovereign Console running on port ' + config.port);
});
