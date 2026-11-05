/** @type {import('tailwindcss').Config} */
// Identidade visual do SOOL2.ai: claro e minimalista, com opção de fundo preto (classe "dark" no <html>).
// As cores vêm de variáveis CSS (src/index.css), redefinidas no modo escuro.
const cor = (nome) => `rgb(var(--c-${nome}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'primaria-escura': cor('primaria-escura'),
        primaria: cor('primaria'),
        'primaria-botao': cor('primaria-botao'),
        'primaria-clara': cor('primaria-clara'),
        acao: cor('acao'),
        'acao-desativada': cor('acao-desativada'),
        'icone-acao': cor('icone-acao'),
        fundo: cor('fundo'),
        divisor: cor('divisor'),
        borda: cor('borda'),
        texto: cor('texto'),
        'texto-secundario': cor('texto-secundario'),
        'texto-forte': cor('texto-forte'),
        placeholder: cor('placeholder'),
        'texto-verde': cor('texto-verde'),
        erro: cor('erro'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        suave: '0 1px 2px rgba(16, 24, 40, 0.05)',
        elevada: '0 12px 32px -12px rgba(16, 24, 40, 0.18)',
      },
    },
  },
  plugins: [],
}
