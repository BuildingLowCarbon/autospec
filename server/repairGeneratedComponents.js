const { repairGeneratedComponents } = require('./generatedComponentsService');
repairGeneratedComponents({ write: process.argv.includes('--write') })
  .then((report) => { console.log(JSON.stringify(report, null, 2)); if (report.unresolved.length) process.exitCode = 1; })
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
