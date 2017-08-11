function loadConfig() {
  try {
    // eslint-disable-next-line global-require
    const config = require('./config')
    // eslint-disable-next-line
    for (let key in config) {
      process.env[key] = config[key]
    }
  } catch (err) {
    // ignore
  }
}

loadConfig()
