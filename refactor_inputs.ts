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
        .replace(/className="[^"]*w-full px-4 py-2\.5 border border-border rounded-xl[^"]*"/g, 'className="input-field"')
        .replace(/className="[^"]*w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary\/50[^"]*"/g, 'className="input-field"')
        .replace(/className="[^"]*w-full pl-4 pr-10 py-2\.5 border border-border rounded-xl border border-border rounded-xl bg-muted focus:outline-none focus:ring-2 focus:ring-primary\/50 text-foreground text-sm[^"]*"/g, 'className="input-field pl-4 pr-10"')
        .replace(/className="[^"]*w-full pl-4 pr-10 py-2\.5 border border-border rounded-xl bg-muted focus:outline-none focus:ring-2 focus:ring-primary\/50 text-foreground text-sm[^"]*"/g, 'className="input-field pl-4 pr-10"')
        .replace(/className="[^"]*w-full p-3 border border-border rounded-xl bg-card focus:outline-none focus:ring-2 focus:ring-primary\/50 text-foreground[^"]*"/g, 'className="input-field"');

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
      }
    });
  });
}

processFiles();
console.log("Inputs fixed");
