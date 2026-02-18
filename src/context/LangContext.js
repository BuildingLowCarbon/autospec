import { createContext } from 'react';

const LangContext = createContext({
  lang: 'fr',
  setLang: () => {},
});

export default LangContext;
