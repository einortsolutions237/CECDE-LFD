import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, callback);
    } else if (fullPath.endsWith('.tsx')) {
      callback(fullPath);
    }
  }
}

function processFiles() {
  const dirs = ['src/pages', 'src/components'];
  dirs.forEach(dir => {
    walk(dir, (filePath) => {
      let content = fs.readFileSync(filePath, 'utf-8');
      
      const newContent = content
        .replace(/hover:bg-primary-hover/g, 'hover:opacity-90');

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
      }
    });
  });
}

processFiles();
console.log("Hover fixed");
