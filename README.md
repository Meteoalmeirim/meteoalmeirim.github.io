# Estação Meteorológica de Almeirim (IALMEI2)

Página pública da estação Bresser 5 em 1 IALMEI2, com:

- dados da estação (Weather Underground), atualizados a cada 5 minutos;
- rio Tejo: caudais e barragens (APA · InfoÁgua / SNIRH), recolhidos de 30 em 30 minutos;
- avisos meteorológicos e risco de incêndio (IPMA);
- radar de chuva e trovoada.

Estrutura:

- `site/` — a página publicada no GitHub Pages
- `tools/tejo.mjs` — recolha dos dados do Tejo
- `.github/workflows/publicar.yml` — recolha e publicação automáticas

Limites de concelhos e distritos: CAOP (Direção-Geral do Território).
