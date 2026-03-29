import React from 'react';

interface GradientBackgroundProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'crimson-azure' | 'subtle';
}

/**
 * GradientBackground - Applies the Crimson-Azure gradient theme to the application
 * 
 * The gradient creates a visually striking dark theme:
 * - Start: Crimson dark (#450A0A)
 * - Middle: Near black (#0A0A0A)
 * - End: Deep azure (#051937)
 */
export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  children,
  className = '',
  variant = 'default',
}) => {
  const gradientClass = {
    default: 'bg-gradient-to-br from-crimson-950 via-gray-950 to-azure-950',
    'crimson-azure': 'bg-gradient-crimson-azure',
    subtle: 'bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900',
  }[variant];

  return (
    <div className={`min-h-screen ${gradientClass} ${className}`}>
      {children}
    </div>
  );
};

/**
 * GradientBorder - Creates a border with the Crimson-Azure gradient
 */
export const GradientBorder: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return (
    <div
      className={`relative rounded-lg p-[1px] bg-gradient-to-r from-crimson-500 via-accent-500 to-azure-500 ${className}`}
    >
      <div className="absolute inset-[1px] rounded-lg bg-bolt-elements-background-depth-2" />
      <div className="relative">{children}</div>
    </div>
  );
};

/**
 * GradientButton - Button with Crimson-Azure gradient
 */
export const GradientButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}> = ({ children, onClick, className = '', disabled = false }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative overflow-hidden rounded-lg px-4 py-2 font-medium text-white
        bg-gradient-to-r from-crimson-600 via-accent-600 to-azure-600
        hover:from-crimson-500 hover:via-accent-500 hover:to-azure-500
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export default GradientBackground;
