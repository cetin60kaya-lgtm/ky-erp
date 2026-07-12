const fs = require('fs');
const env = `DATABASE_URL="file:D:/onedrive-Hkn/OneDrive/KY-ERP-MERKEZ/DATA/KYERP.db"
PORT=3101
NODE_ENV=development
STORAGE_PATH="D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE"
STORAGE_ROOT="D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE"
KYERP_STORAGE_ROOT="D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE"
`;
fs.writeFileSync('.env', env, 'utf8');
