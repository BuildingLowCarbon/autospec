import React from 'react';

function IconInfo({ size = 12, color = 'black', background = '#333' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="black"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="18" x2="12" y2="12" stroke={color} />
      <circle cx="12" cy="8" r="1" fill={color} />
    </svg>
  );
}

export default IconInfo;
