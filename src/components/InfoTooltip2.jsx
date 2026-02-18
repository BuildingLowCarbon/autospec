import React, { useState, useRef, useEffect } from 'react';
import translations from '../language/translations';
import IconInfo from './IconInfo';

function InfoTooltip2({ text, link, lang }) {
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef(null);
  const t = translations[lang];

  // Fermer la fenêtre si clic à l'extérieur
  useEffect(() => {
    function handleClickOutside(event) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        setVisible(false);
      }
    }

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible]);

  return (
    <div 
      title= {t.help} 
      style={{ display: 'inline-block', position: 'relative', marginLeft: '8px' }} ref={tooltipRef}>
        <div onClick={() => setVisible(!visible)} style={{ cursor: 'pointer' }}>
            <IconInfo />
        </div>

        {visible && (
        <div style={{
            position: 'absolute',
            top: '120%',
            left: 0,
            zIndex: 100,
            padding: '10px',
            border: '1px solid #ccc',
            backgroundColor: '#fff',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            width: '260px',
        }}>
            <div style={{ fontSize: '14px' }}>{text}</div>
            {link && (
            <div style={{ marginTop: '6px' }}>
                <a href={link} target="_blank" rel="noopener noreferrer">
                {t.more_info}
                </a>
            </div>
            )}
        </div>
        )}
    </div>
  );
}

export default InfoTooltip2;
