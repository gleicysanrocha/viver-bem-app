# Checklist para publicar o Viver Bem na Play Store

## Antes de gerar o app

- Confirmar que o site esta publicado em HTTPS.
- Confirmar que `manifest.json` abre sem erro no navegador.
- Confirmar que o service worker esta registrado e que o app abre em modo standalone.
- Remover arquivos que nao fazem parte do app final, como `.rar`, `.zip` e backups.
- Revisar as regras do Firebase Auth e Firestore antes de liberar usuarios reais.
- Remover o fallback de login offline que salva senha no `localStorage`.

## Caminho recomendado

Para publicar um app web na Play Store com menos retrabalho, use Trusted Web Activity (TWA), por exemplo com Bubblewrap. O app web continua hospedado, e o Android abre a versao PWA com experiencia de aplicativo.

## Dados da loja

- Nome curto: Viver Bem
- Categoria sugerida: Saude e fitness
- Politica de privacidade: obrigatoria, porque o app lida com dados de saude, peso e autenticacao. Use a URL publica de `privacy.html`.
- Capturas: gerar imagens em celular para login, painel, plano ativo, historico e desafios.

## Pontos de atencao

- Dados de saude sao sensiveis. A descricao da Play Store e a politica de privacidade precisam explicar quais dados sao coletados, onde ficam armazenados e como o usuario pode excluir a conta/dados.
- Se o Firebase for usado em producao, configure dominios autorizados, regras de leitura/escrita por usuario e App Check.
