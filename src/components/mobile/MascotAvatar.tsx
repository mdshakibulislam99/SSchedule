import React from 'react';

export const MascotAvatar: React.FC<{ size?: number; className?: string }> = ({ size = 48, className = '' }) => {
  return (
    <div
      className={`relative rounded-full flex items-center justify-center bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-400 shadow-md shadow-indigo-500/25 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Robot Mascot SVG */}
      <svg
        viewBox="0 0 100 100"
        className="w-[78%] h-[78%] text-white"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antennas */}
        <circle cx="50" cy="18" r="5" fill="white" />
        <line x1="50" y1="23" x2="50" y2="30" stroke="white" strokeWidth="4" strokeLinecap="round" />
        
        {/* Head Shell */}
        <rect x="24" y="30" width="52" height="42" rx="16" fill="white" />
        
        {/* Visor Screen */}
        <rect x="28" y="35" width="44" height="28" rx="12" fill="#1E1B4B" />
        
        {/* Glowing Eyes */}
        <ellipse cx="40" cy="48" rx="4.5" ry="6" fill="#38BDF8" className="animate-pulse" />
        <ellipse cx="60" cy="48" rx="4.5" ry="6" fill="#38BDF8" className="animate-pulse" />
        
        {/* Sparkle Blush */}
        <circle cx="34" cy="54" r="2" fill="#EC4899" opacity="0.8" />
        <circle cx="66" cy="54" r="2" fill="#EC4899" opacity="0.8" />

        {/* Headphones / Ears */}
        <rect x="18" y="40" width="7" height="18" rx="3.5" fill="#C7D2FE" />
        <rect x="75" y="40" width="7" height="18" rx="3.5" fill="#C7D2FE" />

        {/* Cute Bow / Collar */}
        <path d="M42 74L50 78L58 74L50 82Z" fill="#818CF8" />
      </svg>
    </div>
  );
};
