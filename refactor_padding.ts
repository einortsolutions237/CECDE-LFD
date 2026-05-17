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
        .replace(/className="[^"]*p-4 border-b border-border[^"]*"/g, (match) => match.replace('p-4', 'p-6'))
        // make sure gap is clean
        .replace(/gap-4/g, 'gap-6')
        // table cell paddings: px-6 py-4 -> px-6 py-4.5 for slightly more breathing room
        // actually standard row height is fine with py-4.

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
      }
    });
  });
}

processFiles();
console.log("Padding refactored");
