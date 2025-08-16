import React, { createContext, useContext, ReactNode } from 'react';
import { tokens, type Tokens } from './tokens';

interface ThemeContextType {
  tokens: Tokens;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  return (
    <ThemeContext.Provider value={{ tokens }}>
      {children}
    </ThemeContext.Provider>
  );
};