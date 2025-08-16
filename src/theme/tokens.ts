export const tokens = {
  color: {
    primary: "#2F7BF6",
    primaryHover: "#2468D4",
    ink: "#0E1116",
    bg: "#0B0F14",
    card: "#121722",
    muted: "#8592A3",
    success: "#25D366",
    error: "#FF5A5F",
    warning: "#FFB020",
    white: "#FFFFFF",
    transparent: "transparent",
  },
  radius: { 
    lg: "16px", 
    md: "12px", 
    sm: "8px" 
  },
  shadow: { 
    card: "0 10px 30px rgba(0,0,0,0.25)",
    subtle: "0 2px 10px rgba(0,0,0,0.1)"
  },
  space: (n: number) => `${n * 4}px`,
  font: {
    family: {
      system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif",
    },
    weight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    size: {
      xs: "12px",
      sm: "14px",
      base: "16px",
      lg: "18px",
      xl: "20px",
      "2xl": "24px",
      "3xl": "32px",
    },
  },
  button: {
    height: "48px",
  },
};

export type Tokens = typeof tokens;