const createApp = require('./app');
const path = require('path');
const PORT = process.env.PORT || 3000;
const dataFile = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
createApp({ dataFile }).listen(PORT, () => console.log(`Exam system running on port ${PORT}`));
