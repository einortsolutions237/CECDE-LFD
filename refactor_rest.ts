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
        .replace(/className="[^"]*px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary\/50 text-foreground[^"]*"/g, 'className="input-field"')
        .replace(/className="[^"]*flex items-center gap-2 px-6 py-2\.5 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 hover:shadow-md transition-all text-sm[^"]*"/g, 'className="btn-primary"')
        .replace(/className="[^"]*px-4 lg:px-6 py-3 border border-border bg-card rounded-r-xl focus:outline-none focus:ring-2 focus:ring-primary\/50 text-sm font-semibold text-foreground tracking-widest uppercase transition-all w-full[^"]*"/g, 'className="input-field rounded-l-none uppercase tracking-widest font-mono"');

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
      }
    });
  });
}

processFiles();
console.log("Remaining UI elements fixed");
