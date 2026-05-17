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
        .replace(/<th className="px-6 py-4">([^<]+)<\/th>/g, '<th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">$1</th>')
        .replace(/<th className="px-6 py-4 text-center">([^<]+)<\/th>/g, '<th className="px-6 py-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">$1</th>')
        .replace(/<th className="px-6 py-4 text-right">([^<]+)<\/th>/g, '<th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">$1</th>');

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
      }
    });
  });
}

processFiles();
console.log("Table headers refactored");
