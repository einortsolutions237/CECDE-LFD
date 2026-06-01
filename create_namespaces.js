const fs = require('fs');
const path = require('path');

const namespaces = [
  'common',
  'auth',
  'dashboard',
  'admin',
  'network',
  'rankings',
  'settings',
  'reports',
  'validation'
];

namespaces.forEach(ns => {
  const enPath = path.join(__dirname, 'src/i18n/locales/en', `${ns}.json`);
  const frPath = path.join(__dirname, 'src/i18n/locales/fr', `${ns}.json`);
  
  if (!fs.existsSync(path.dirname(enPath))) {
    fs.mkdirSync(path.dirname(enPath), { recursive: true });
  }
  if (!fs.existsSync(path.dirname(frPath))) {
    fs.mkdirSync(path.dirname(frPath), { recursive: true });
  }

  if (!fs.existsSync(enPath)) fs.writeFileSync(enPath, '{\n}\n');
  if (!fs.existsSync(frPath)) fs.writeFileSync(frPath, '{\n}\n');
});

console.log('Namespaces created successfully.');
