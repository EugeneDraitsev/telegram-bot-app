function loadConfig() {
  try {
    const config = require('./config')
    // tslint:disable-next-line
    for (const key in config) {
      process.env[key] = config[key]
    }
  } catch (err) {
    // ignore
  }
}

loadConfig()
