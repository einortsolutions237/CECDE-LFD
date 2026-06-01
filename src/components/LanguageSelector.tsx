import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const languages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export default function LanguageSelector() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === (i18n.resolvedLanguage || 'en')) || languages[0];

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent, code?: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (code) {
        handleLanguageChange(code);
      } else {
        setIsOpen(!isOpen);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => handleKeyDown(e)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
          "bg-background/50 hover:bg-muted/80 border border-border/50 hover:border-border backdrop-blur-sm",
          "focus:outline-none focus:ring-2 focus:ring-primary/20",
          isOpen && "bg-muted shadow-sm border-border"
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select Language"
      >
        <Globe className={cn("w-4 h-4 transition-colors", isOpen ? "text-primary" : "text-muted-foreground")} />
        <span className="hidden sm:inline-flex items-center gap-1.5 opacity-90">
          <span className="text-[13px] leading-none">{currentLang.flag}</span>
          <span>{currentLang.label}</span>
        </span>
        <span className="sm:hidden inline-flex items-center">
          <span className="text-[13px] leading-none">{currentLang.flag}</span>
        </span>
        <ChevronDown 
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform duration-300",
            isOpen && "rotate-180 text-foreground"
          )} 
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} 
            className="absolute right-0 top-[calc(100%+8px)] w-48 p-1.5 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-lg z-50 origin-top-right overflow-hidden"
            role="listbox"
          >
            {languages.map((lang) => {
              const isSelected = currentLang.code === lang.code;
              return (
                <button
                  key={lang.code}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleLanguageChange(lang.code)}
                  onKeyDown={(e) => handleKeyDown(e, lang.code)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative",
                    "focus:outline-none focus:bg-muted focus:ring-1 focus:ring-primary/30",
                    isSelected 
                      ? "text-primary bg-primary/5" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                  )}
                >
                  <div className="flex items-center gap-3 relative z-10">
                    <span className="text-[15px] leading-none drop-shadow-sm">{lang.flag}</span>
                    <span>{lang.label}</span>
                  </div>
                  
                  {isSelected && (
                    <motion.div 
                      layoutId="language-check"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative z-10"
                    >
                      <Check className="w-4 h-4 text-primary" strokeWidth={3} />
                    </motion.div>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
