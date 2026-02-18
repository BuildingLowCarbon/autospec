import React, { useState } from 'react';
import translations from '../language/translations';

function InfoTooltip({ text, link, lang }) {
    const [visible, setVisible] = useState(false);
    const t = translations[lang];

    return (
    <div style={{ display: 'inline-block', position: 'relative', marginLeft: '8px' }}>
        <button
            onClick={() => setVisible(!visible)}
            style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#007bff',
                fontWeight: 'bold'
            }}
            title= {t.help}
        >
        ?
        </button>

        {visible && (
        <div style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            marginTop: '4px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            padding: '8px',
            borderRadius: '6px',
            width: '240px',
            boxShadow: '0px 2px 6px rgba(0,0,0,0.1)',
            zIndex: 100
        }}>
            <div style={{ fontSize: '14px' }}>{text}</div>
            {link && (
            <div style={{ marginTop: '6px', fontSize: '14px' }}>
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

export default InfoTooltip;
